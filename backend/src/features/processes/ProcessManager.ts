import { EventEmitter } from 'events';
import { ServerStatus } from '@shared/types';
import si from 'systeminformation';
import net from 'net';
import { runnerFactory } from './runners/RunnerFactory';
import { IServerRunner } from './runners/IServerRunner';
import { NetUtils } from '../../utils/NetUtils';
import { logger } from '../../utils/logger';
import { statsRingBuffer } from '../diagnosis/StatsRingBuffer';

class ProcessManager extends EventEmitter {
    private activeRunners: Map<string, IServerRunner> = new Map();
    private logHistory: Map<string, string[]> = new Map();
    private startTimes: Map<string, number> = new Map();
    private onlineTimes: Map<string, number> = new Map();
    private statusCache: Map<string, any> = new Map();
    private stoppingServers: Set<string> = new Set();
    private updatingStatuses: Set<string> = new Set();
    private startupLocks: Set<string> = new Set();
    private players: Map<string, Set<string>> = new Map();
    private readonly MAX_LOGS = 1000;
    private lastEmittedStatus: Map<string, string> = new Map();
    private activityHistory: Map<string, any[]> = new Map();
    private readonly MAX_ACTIVITY_HISTORY = 100;
    private runnerListeners: Map<string, { log: any, close: any }> = new Map();

    constructor() {
        super();
        this.startStatsLoop();
        this.startSyncLoop();
    }

    private startSyncLoop() {
        // Periodic sync to detect external/unmanaged processes and recover stuck STARTING states
        setInterval(async () => {
             try {
                const { getServers } = await import('../servers/ServerService');
                const servers = getServers();
                
                for (const server of servers) {
                    const id = server.id;
                    const isManaged = this.activeRunners.has(id);
                    const cached = this.statusCache.get(id);
                    const currentStatus = cached?.status || server.status;

                    // 1. RECOVERY: If server is STARTING/RESTARTING but port is reachable, it's ONLINE!
                    // This acts as a redundant check to log-based triggers.
                    if ((currentStatus === ServerStatus.STARTING || currentStatus === ServerStatus.RESTARTING) && !this.stoppingServers.has(id)) {
                        const isPortBound = await NetUtils.checkPort(server.port);
                        if (isPortBound) {
                            logger.info(`[ProcessManager:${id}] Reachability Sync: Detected responsive port ${server.port}. Forcing ONLINE.`);
                            this.startupLocks.delete(id);
                            this.updateCachedStatus(id, { online: true, status: ServerStatus.ONLINE });
                        }
                    }

                    // 2. Unmanaged / Managed Detection
                    if (!isManaged) {
                        const isPortBound = await NetUtils.checkPort(server.port);
                        
                        if (isPortBound) {
                            if (currentStatus !== ServerStatus.UNMANAGED && currentStatus !== ServerStatus.STARTING && currentStatus !== ServerStatus.RESTARTING) {
                                logger.warn(`[ProcessManager:${id}] Unmanaged process detected on port ${server.port}.`);
                                this.updateCachedStatus(id, { 
                                    online: true, 
                                    status: ServerStatus.UNMANAGED, 
                                    unmanaged: true,
                                    message: 'Running without panel control'
                                });
                            }
                        } else {
                            // If we thought it was online but port is dead, it's offline
                            if (cached?.online || server.status === ServerStatus.ONLINE || server.status === ServerStatus.UNMANAGED) {
                                if (!this.startupLocks.has(id)) {
                                    logger.info(`[ProcessManager:${id}] External/Unmanaged process lost. Syncing to OFFLINE.`);
                                    this.handleServerClose(id, 0);
                                }
                            }
                        }
                    }
                }
             } catch (err) {
                 // Prevent interval crash
             }
        }, 10000); // Increased frequency to 10s for faster recovery
    }



    private startStatsLoop() {
        setInterval(async () => {
            const tasks = Array.from(this.activeRunners.entries()).map(async ([id, runner]) => {
                try {
                    const stats = await runner.getStats(id);
                    const tps = await this.getTPS(id);
                    const uptime = this.getUptime(id);
                    
                    // --- Bedrock-Specific Query ---
                    const { getServer } = await import('../servers/ServerService');
                    const server = getServer(id);
                    if (server?.software === 'Bedrock') {
                        const query = await NetUtils.queryBedrock(server.port);
                        if (query) {
                            this.updateCachedStatus(id, {
                                online: true,
                                players: query.players,
                                maxPlayers: query.maxPlayers,
                                latency: query.ping,
                                softwareVersion: query.version
                            });
                        }
                    }

                    const latency = this.statusCache.get(id)?.latency || 0;
                    const players = this.statusCache.get(id)?.players || 0;

                    if (stats.cpu > 0 || stats.memory > 0) {
                        logger.debug(`[ProcessManager:${id}] Stats: CPU ${stats.cpu}% | RAM ${stats.memory}MB | Players ${players} | Latency ${latency}ms`);
                    }

                    this.emit('stats', { id, ...stats, tps, uptime, latency, players });

                    // Feed predictive diagnosis engine
                    statsRingBuffer.push(id, {
                        cpu: stats.cpu,
                        memory: stats.memory,
                        tps: parseFloat(tps),
                        players,
                        timestamp: Date.now()
                    });
                    this.updateCachedStatus(id, { 
                        cpu: stats.cpu,
                        memory: stats.memory,
                        uptime,
                        tps,
                        latency,
                        players
                    });
                } catch (e) {
                    logger.error(`[ProcessManager] Stats failed for ${id}: ${e}`);
                }
            });

            await Promise.all(tasks);
        }, 1000); // Live high-frequency updates (1s)
    }

    async startServer(id: string, runCommand: string, cwd: string, env: any = {}) {
        if (this.activeRunners.has(id)) {
            throw new Error(`Server ${id} is already running.`);
        }
        
        // --- PORT PROTECTION ENGINE ---
        const port = env.SERVER_PORT;
        if (port) {
            logger.info(`[ProcessManager] Integrity Check: Verifying port ${port} availability...`);
            const killed = await this.killProcessOnPort(port);
            if (killed) {
                logger.warn(`[ProcessManager] Ghost process detected on port ${port}. Forcefully purged.`);
                await new Promise(r => setTimeout(r, 1000)); // Grace period for OS to release handle
            }
        }
        
        const engine = env.executionEngine || 'native';
        const runner = runnerFactory.getRunner(engine);
        
        this.stoppingServers.delete(id);
        this.startupLocks.add(id);
        logger.info(`[ProcessManager] Initializing server ${id} using ${engine} engine.`);

        // Setup Event Handlers for this specific server/runner combo
        const logHandler = (data: { id: string, line: string, type: 'stdout' | 'stderr' }) => {
            if (data.id !== id) return;
            this.handleServerLog(id, data.line, data.type);
        };

        const closeHandler = (data: { id: string, code: number }) => {
            if (data.id !== id) return;
            this.cleanupRunner(id); // Comprehensive cleanup
            this.handleServerClose(id, data.code);
        };

        // Store listeners for explicit cleanup if needed
        this.runnerListeners.set(id, { log: logHandler, close: closeHandler });

        this.statusCache.set(id, { online: false, status: ServerStatus.STARTING, players: 0, playerList: [], uptime: 0, tps: "0.00" });
        this.logHistory.set(id, []);
        this.activityHistory.set(id, []);
        this.players.set(id, new Set());
        this.activeRunners.set(id, runner);
        this.startTimes.set(id, Date.now());

        // Attach listeners BEFORE starting to catch early logs
        runner.on('log', logHandler);
        runner.on('close', closeHandler);

        try {
            await runner.start(id, runCommand, cwd, env);
            // --- RACE CONDITION GUARD ---
            // Only emit STARTING if the server is still managed.
            // If it crashed during startup, handleServerClose would have already 
            // set it to CRASHED or offline.
            if (this.activeRunners.has(id)) {
                this.maybeEmitStatus(id, ServerStatus.STARTING);
            }
        } catch (err) {
            this.cleanupRunner(id);
            throw err;
        }

        this.maybeEmitStatus(id, ServerStatus.STARTING);

        // Startup Timeout Watchdog
        setTimeout(() => {
            if (this.startupLocks.has(id)) {
                logger.error(`[ProcessManager] ${id} Startup timed out.`);
                this.startupLocks.delete(id);
                this.maybeEmitStatus(id, ServerStatus.OFFLINE);
            }
        }, 180000);
    }

    private handleServerLog(id: string, line: string, type: 'stdout' | 'stderr') {
        const history = this.logHistory.get(id) || [];
        history.push(line);
        if (history.length > this.MAX_LOGS) history.shift();
        this.logHistory.set(id, history);
        
        this.emit('log', { id, line, type });

        if (this.startupLocks.has(id)) {
            if (line.includes('Done (') || line.includes('Listening on')) {
                this.startupLocks.delete(id);
                this.updateCachedStatus(id, { online: true, status: ServerStatus.ONLINE });
            }
        }

        // Player Tracking (Unified & Software-Aware)
        let joinName: string | null = null;
        let leaveName: string | null = null;

        // 1. Bedrock Patterns (Explicit markers)
        const bJoin = line.match(/Player connected: ([\w\d_ \(\)]{3,24})(?:\s*,\s*xuid:)/i);
        const bLeave = line.match(/Player disconnected: ([\w\d_ \(\)]{3,24})(?:\s*,\s*xuid:)/i);
        
        if (bJoin) joinName = bJoin[1].trim();
        if (bLeave) leaveName = bLeave[1].trim();

        // 2. Java Patterns (Suffix markers)
        if (!joinName && !leaveName) {
            const jJoin = line.match(/(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+joined the game/i);
            const jLeave = line.match(/(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+left the game/i);
            if (jJoin) joinName = jJoin[1].trim();
            if (jLeave) leaveName = jLeave[1].trim();
        }

        if (joinName) {
            const set = this.players.get(id) || new Set();
            set.add(joinName);
            this.players.set(id, set);
            this.updateCachedStatus(id, { players: set.size, playerList: Array.from(set) });
            this.emit('player:join', { serverId: id, name: joinName, onlinePlayers: set.size });
            this.addActivity(id, { type: 'join', player: joinName, message: `${joinName} joined the game` });
        }
        
        if (leaveName) {
            const set = this.players.get(id);
            if (set) {
                set.delete(leaveName);
                this.updateCachedStatus(id, { players: set.size, playerList: Array.from(set) });
                this.emit('player:leave', { serverId: id, name: leaveName, onlinePlayers: set.size });
                this.addActivity(id, { type: 'leave', player: leaveName, message: `${leaveName} left the game` });
                logger.info(`[ProcessManager:${id}] Player Left: ${leaveName}`);
            }
        }

        // --- ENHANCED ACTIVITY PARSING ---
        
        // 1. Deaths
        const deathMatch = line.match(/(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+((was slain by|fell from|blew up|burned to death|drowned|hit the ground too hard|tried to swim in lava|was shot by|was blown up by|was pricked to death|was squashed by|was killed by|withered away|walked into a campfire|suffocated in a wall|starved to death).*)/i);
        if (deathMatch) {
            this.addActivity(id, { type: 'death', player: deathMatch[1], message: `${deathMatch[1]} ${deathMatch[2]}` });
        }

        // 2. Achievements/Advancements
        const advMatch = line.match(/(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+has\s+made\s+the\s+advancement\s+\[(.*?)\]/i);
        if (advMatch) {
            this.addActivity(id, { type: 'achievement', player: advMatch[1], metadata: { achievement: advMatch[2] }, message: `${advMatch[1]} achieved [${advMatch[2]}]` });
        }

        // 3. Commands & Teleports
        const cmdMatch = line.match(/(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+issued\s+server\s+command:\s+\/(.*)/i);
        if (cmdMatch) {
            const cmd = cmdMatch[2].toLowerCase();
            const type = (cmd.startsWith('tp') || cmd.startsWith('teleport')) ? 'teleport' : 'command';
            this.addActivity(id, { 
                type, 
                player: cmdMatch[1], 
                metadata: { command: cmdMatch[2] },
                message: `${cmdMatch[1]} used /${cmdMatch[2]}` 
            });
        }
    }

    private addActivity(id: string, activity: any) {
        const history = this.activityHistory.get(id) || [];
        const entry = {
            ...activity,
            timestamp: new Date().toISOString(),
            id: Math.random().toString(36).substr(2, 9)
        };
        
        history.unshift(entry);
        if (history.length > this.MAX_ACTIVITY_HISTORY) history.pop();
        this.activityHistory.set(id, history);
        
        this.emit('player:activity', { serverId: id, activity: entry });
    }

    getActivityHistory(id: string) {
        return this.activityHistory.get(id) || [];
    }

    private handleServerClose(id: string, code: number) {
        logger.info(`[ProcessManager] Server ${id} closed with code ${code}`);
        this.startupLocks.delete(id);

        const isIntentional = this.stoppingServers.has(id);
        const finalStatus = (!isIntentional && code !== 0 && code !== null) ? ServerStatus.CRASHED : ServerStatus.OFFLINE;

        this.stoppingServers.delete(id);

        const { getServer, saveServer } = require('../servers/ServerService');
        const server = getServer(id);
        if (server) {
            // Only wipe startTime if it was intentional or a crash
            // Persistence Guard: Only wipe timing metadata if intentional or crash
            if (isIntentional || finalStatus === 'CRASHED') {
                delete server.startTime;
                this.onlineTimes.delete(id);
            }
            server.status = finalStatus;
            saveServer(server);
        }

        // Update cache to reflect final status immediately (prevents polling desyncs)
        this.updateCachedStatus(id, { status: finalStatus, online: false });
        this.maybeEmitStatus(id, finalStatus);
    }

    async stopServer(id: string, force: boolean = false) {
        const runner = this.activeRunners.get(id);
        if (runner) {
            if (this.startupLocks.has(id) && !force) {
                throw new Error('Server is initializing. Use force stop if necessary.');
            }
            this.stoppingServers.add(id);

            if (force) {
                await runner.kill?.(id, 'SIGKILL');
                return;
            }

            // Normal Stop: Try stdin first
            await runner.stop(id, false);

            // Bedrock-Specific Smart Shutdown Orchestration
            const { getServer } = require('../servers/ServerService');
            const server = getServer(id);
            if (server?.software === 'Bedrock' && runner.kill) {
                // Wait 10s for stdin 'stop' to work
                setTimeout(async () => {
                    if (this.activeRunners.get(id) === runner) {
                        logger.info(`[ProcessManager] ${id} (Bedrock) did not stop via stdin. Escalating to SIGINT...`);
                        await runner.kill?.(id, 'SIGINT');

                        // Wait another 10s for SIGINT
                        setTimeout(async () => {
                            if (this.activeRunners.get(id) === runner) {
                                logger.info(`[ProcessManager] ${id} (Bedrock) still alive after SIGINT. Force killing...`);
                                await runner.kill?.(id, 'SIGKILL');
                            }
                        }, 10000);
                    }
                }, 10000);
            }
        }
    }

    async waitForClose(id: string, timeoutMs: number = 30000): Promise<boolean> {
        if (!this.activeRunners.has(id)) return true;
        const start = Date.now();
        while (this.activeRunners.has(id) && Date.now() - start < timeoutMs) {
            await new Promise(r => setTimeout(r, 500));
        }
        return !this.activeRunners.has(id);
    }

    killServer(id: string) {
        this.stopServer(id, true);
    }

    isStarting(id: string): boolean {
        return this.startupLocks.has(id);
    }

    isStopping(id: string): boolean {
        return this.stoppingServers.has(id);
    }

    sendCommand(id: string, command: string) {
        const runner = this.activeRunners.get(id);
        if (runner) runner.sendCommand(id, command);
    }

    isRunning(id: string): boolean {
        return this.activeRunners.has(id);
    }

    getLogs(id: string): string[] {
        return this.logHistory.get(id) || [];
    }

    getUptime(id: string): number {
        const cached = this.statusCache.get(id);
        const status = cached?.status;
        
        let onlineTime = this.onlineTimes.get(id);
        if (!onlineTime) {
            const { getServer } = require('../servers/ServerService');
            const server = getServer(id);
            if (server && server.startTime) onlineTime = server.startTime;
        }

        // If we have an onlineTime, it means the server has reached ONLINE state.
        // We only stop showing uptime if the process is completely gone or intentional stop.
        if (!onlineTime) return 0;

        // --- RENDER GUARD ---
        // If status is OFFLINE or CRASHED, definitely return 0.
        // But if it's STARTING, RESTARTING, or momentarily EMPTY, we KEEP the uptime 
        // IF and only if the process is still managed/running.
        if (status === ServerStatus.OFFLINE || status === ServerStatus.CRASHED) return 0;
        
        return Math.floor((Date.now() - onlineTime) / 1000);
    }

    async getTPS(id: string): Promise<string> {
        const { getServer } = require('../servers/ServerService');
        const server = getServer(id);
        
        if (server?.software === 'Bedrock') {
            const cached = this.statusCache.get(id);
            // For Bedrock, we use "Stable" or "Responsive" as a TPS proxy since we can't query actual TPS via RCON/RakNet
            return cached?.online ? "20.0" : "0.0";
        }

        const logs = this.logHistory.get(id) || [];
        for (let i = logs.length - 1; i >= Math.max(0, logs.length - 50); i--) {
            const line = logs[i];
            const match = line.match(/TPS from last [\d\w\s]+: ([\d\.]+)/i) || line.match(/TPS: ([\d\.]+)/i);
            if (match) return parseFloat(match[1]).toFixed(2);
        }
        return this.statusCache.get(id)?.online ? "20.00" : "0.00"; 
    }

    updateCachedStatus(id: string, data: any) {
        const current = this.statusCache.get(id) || {};
        
        // --- SMART PLAYER MERGE ---
        if (data.playerList) {
            const currentList: string[] = current.playerList || [];
            const newList: string[] = data.playerList;
            
            // If the new list is empty but we have current players, keep the current ones (Logs are more reliable)
            if (newList.length === 0 && currentList.length > 0 && data.players > 0) {
                 // The query said players are online but didn't give names. Trust our existing list.
                 data.playerList = currentList;
            } else if (newList.length > 0) {
                // If the new list contains generic names like "Anonymous Player" or "Unknown", 
                // and we already have real names, try to preserve them.
                const hasGeneric = newList.some(n => n.toLowerCase().includes('anonymous') || n.toLowerCase().includes('unknown'));
                if (hasGeneric && currentList.length > 0) {
                    // Combine lists and take unique, preferring non-generic
                    const combined = new Set([...currentList, ...newList]);
                    data.playerList = Array.from(combined).filter(name => {
                        const isGeneric = name.toLowerCase().includes('anonymous') || name.toLowerCase().includes('unknown');
                        // Only keep generic if we have nothing else
                        return !isGeneric || combined.size === 1;
                    });
                }
            }
        }

        if (data.online && current.status === ServerStatus.STARTING) {
            data.status = ServerStatus.ONLINE;
            this.onlineTimes.set(id, Date.now());
            this.startupLocks.delete(id);
        }
        if (data.status) this.maybeEmitStatus(id, data.status);
        this.statusCache.set(id, { ...current, ...data, lastUpdate: Date.now() });
    }

    getCachedStatus(id: string) {
        return this.statusCache.get(id) || {
            online: false, players: 0, playerList: [], uptime: this.getUptime(id), tps: "0.00", latency: 0
        };
    }

    isUpdatingStatus(id: string): boolean {
        return this.updatingStatuses.has(id);
    }

    setUpdatingStatus(id: string, updating: boolean) {
        if (updating) this.updatingStatuses.add(id);
        else this.updatingStatuses.delete(id);
    }

    async getServerStats(id: string) {
        const runner = this.activeRunners.get(id);
        if (!runner) return { cpu: 0, memory: 0 };
        return runner.getStats(id);
    }

    async killProcessOnPort(port: number): Promise<boolean> {
        return NetUtils.killProcessOnPort(port);
    }

    private maybeEmitStatus(id: string, status: ServerStatus) {
        if (this.lastEmittedStatus.get(id) === status) return;
        this.lastEmittedStatus.set(id, status);
        this.emit('status', { id, status });
    }

    private cleanupRunner(id: string) {
        const runner = this.activeRunners.get(id);
        const listeners = this.runnerListeners.get(id);

        if (runner && listeners) {
            runner.off('log', listeners.log);
            runner.off('close', listeners.close);
        }

        this.activeRunners.delete(id);
        this.runnerListeners.delete(id);
        this.startTimes.delete(id);
        this.onlineTimes.delete(id);
        this.statusCache.delete(id);
        statsRingBuffer.clear(id); // Clear predictive history on stop
        // We keep logHistory/activityHistory as they are needed for UI after close
    }
    async shutdown() {
        logger.info('[ProcessManager] Shutting down all active servers...');
        
        // 1. Stop Sync Loops
        // (We can't easily stop the private intervals without refactoring to store their IDs, 
        // but since the process is exiting, we just need to stop spawning NEW things)
        this.startupLocks.clear();

        // 2. Kill all Active Runners
        const killPromises = Array.from(this.activeRunners.keys()).map(async (id) => {
            try {
                logger.info(`[ProcessManager] Killing server ${id}...`);
                await this.stopServer(id, true); // Force kill
            } catch (e) {
                logger.error(`[ProcessManager] Failed to kill ${id}: ${e}`);
            }
        });

        await Promise.all(killPromises);
        logger.info('[ProcessManager] All servers stopped.');
    }
}

export const processManager = new ProcessManager();
