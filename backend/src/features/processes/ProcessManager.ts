import { EventEmitter } from 'events';
import { ServerStatus } from '@shared/types';
import si from 'systeminformation';
import net from 'net';
import { runnerFactory } from './runners/RunnerFactory';
import { IServerRunner } from './runners/IServerRunner';
import { NetUtils } from '../../utils/NetUtils';
import { logger } from '../../utils/logger';
import { statsRingBuffer } from '../diagnosis/StatsRingBuffer';
import { ErrorCode, SystemError } from '../../utils/ErrorCodes';

class ProcessManager extends EventEmitter {
    private activeRunners: Map<string, IServerRunner> = new Map();
    private logHistory: Map<string, string[]> = new Map();
    private startTimes: Map<string, number> = new Map();
    private onlineTimes: Map<string, number> = new Map();
    private statusCache: Map<string, any> = new Map();
    private stoppingServers: Set<string> = new Set();
    private gracefulShutdowns: Map<string, boolean> = new Map();
    private updatingStatuses: Set<string> = new Set();
    private startupLocks: Set<string> = new Set();
    private startupTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private players: Map<string, Set<string>> = new Map();
    private readonly MAX_LOGS = 1000;
    private lastEmittedStatus: Map<string, string> = new Map();
    private activityHistory: Map<string, any[]> = new Map();
    private readonly MAX_ACTIVITY_HISTORY = 100;
    private runnerListeners: Map<string, { log: any, close: any }> = new Map();

    constructor() {
        super();
        this.initializeRunners();
        this.startStatsLoop();
        this.startSyncLoop();
    }

    private async initializeRunners() {
        const dockerRunner = runnerFactory.getRunner('docker') as any;
        if (dockerRunner.syncActiveContainers) {
            await dockerRunner.syncActiveContainers();
        }

        // --- REMOTE RUNNER DESYNC FIX ---
        const remoteRunner = runnerFactory.getRunner('remote') as any;
        if (remoteRunner) {
            remoteRunner.on('sync-recover', (data: { id: string }) => {
                logger.info(`[ProcessManager:${data.id}] Node Agent reconnected! Recovering ONLINE state...`);
                // Force state back to online immediately
                this.updateCachedStatus(data.id, { online: true, status: ServerStatus.ONLINE });
                
                // Persist recovery so next panel reboot isn't confused
                const { getServer, saveServer } = require('../servers/ServerService');
                const server = getServer(data.id);
                if (server) {
                    server.status = ServerStatus.ONLINE;
                    saveServer(server);
                }
            });
        }
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
                            this.clearStartupLock(id);
                            this.updateCachedStatus(id, { online: true, status: ServerStatus.ONLINE });
                        }
                    }

                    // 2. Unmanaged / Managed Detection
                    if (!isManaged) {
                        const isPortBound = await NetUtils.checkPort(server.port);
                        
                        if (isPortBound) {
                            // --- DOCKER RECOVERY (v1.12.0) ---
                            // If not managed but port is bound, check if Docker already has this container
                            const dockerRunner = runnerFactory.getRunner('docker');
                            if (dockerRunner.isRunning(id)) {
                                logger.info(`[ProcessManager:${id}] Recovery: Re-binding to existing Docker container.`);
                                this.attachRunnerListeners(id, dockerRunner);
                                this.updateCachedStatus(id, { online: true, status: ServerStatus.ONLINE });
                                continue;
                            }

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
            logger.warn(`[ProcessManager:${id}] Start requested but runner is already active. (Idempotency)`);
            return;
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

        // --- STARTUP TIMEOUT (Rule #1: Stability under failure) ---
        // If the server doesn't boot within 5 minutes, forcibly unlock it.
        const timeout = setTimeout(async () => {
            if (this.startupLocks.has(id)) {
                logger.warn(`[ProcessManager:${id}] Startup timed out after 5 minutes! Unlocking to prevent eternal hang.`);
                this.clearStartupLock(id);
                // Check if port actually bound despite missing logs
                const isPortBound = env.SERVER_PORT ? await NetUtils.checkPort(env.SERVER_PORT) : false;
                if (!isPortBound) {
                    this.updateCachedStatus(id, { 
                        online: false, 
                        status: ServerStatus.CRASHED,
                        errorCode: ErrorCode.E_PROC_TIMEOUT 
                    });
                    this.maybeEmitStatus(id, ServerStatus.CRASHED);
                } else {
                    this.updateCachedStatus(id, { online: true, status: ServerStatus.ONLINE });
                }
            }
        }, 5 * 60 * 1000);
        this.startupTimeouts.set(id, timeout);

        this.attachRunnerListeners(id, runner);

        try {
            await runner.start(id, runCommand, cwd, env);
            if (this.activeRunners.has(id)) {
                this.maybeEmitStatus(id, ServerStatus.STARTING);
            }
        } catch (err: any) {
            this.cleanupRunner(id);
            // Wrap in SystemError if not already one
            if (!(err instanceof SystemError)) {
                throw new SystemError(ErrorCode.E_PROC_SPAWN_FAIL, err.message);
            }
            throw err;
        }
    }

    private clearStartupLock(id: string) {
        this.startupLocks.delete(id);
        const timeout = this.startupTimeouts.get(id);
        if (timeout) {
            clearTimeout(timeout);
            this.startupTimeouts.delete(id);
        }
    }

    private attachRunnerListeners(id: string, runner: IServerRunner, initialStatus: ServerStatus = ServerStatus.STARTING) {
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

        this.statusCache.set(id, { 
            online: initialStatus === ServerStatus.ONLINE, 
            status: initialStatus, 
            players: 0, 
            playerList: [], 
            uptime: 0, 
            tps: "0.00" 
        });
        this.logHistory.set(id, this.logHistory.get(id) || []);
        this.activityHistory.set(id, this.activityHistory.get(id) || []);
        this.players.set(id, this.players.get(id) || new Set());
        this.activeRunners.set(id, runner);
        if (!this.startTimes.has(id)) {
            this.startTimes.set(id, Date.now());
        }

        // Attach listeners
        runner.on('log', logHandler);
        runner.on('close', closeHandler);
    }

    private handleServerLog(id: string, line: string, type: 'stdout' | 'stderr') {
        const history = this.logHistory.get(id) || [];
        history.push(line);
        if (history.length > this.MAX_LOGS) history.shift();
        this.logHistory.set(id, history);
        
        this.emit('log', { id, line, type });

        if (this.startupLocks.has(id)) {
            if (line.includes('Done (') || line.includes('Listening on')) {
                this.clearStartupLock(id);
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

        // 4. Chat Messages
        // Matches standard Java format: [hh:mm:ss] [Server thread/INFO]: <Player> message
        const chatMatch = line.match(/(?:\[.*\]:\s+|:\s+|^)<([\w\d_]{3,16})>\s+(.*)/);
        if (chatMatch) {
            this.emit('chat', { serverId: id, name: chatMatch[1], message: chatMatch[2] });
            this.addActivity(id, { type: 'chat', player: chatMatch[1], message: `${chatMatch[1]}: ${chatMatch[2]}` });
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
        this.clearStartupLock(id);

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
                throw new SystemError(ErrorCode.E_PROC_TIMEOUT, 'Server is initializing. Use force stop if necessary.');
            }
            this.stoppingServers.add(id);

            if (force) {
                await runner.kill?.(id, 'SIGKILL');
                return;
            }

            // Normal Stop: Try stdin first
            await runner.stop(id, false);

            // Bedrock-Specific Smart Shutdown Orchestration
            // Bedrock-Specific Smart Shutdown Orchestration (Phase 12: Optimized Polling)
            const { getServer } = require('../servers/ServerService');
            const server = getServer(id);
            if (server?.software === 'Bedrock' && runner.kill) {
                // Poll for up to 10s for stdin 'stop' to work
                const pollAndEscalate = async (stage: 'STDIN' | 'SIGINT', timeoutMs: number, nextSignal: string) => {
                    const start = Date.now();
                    while (Date.now() - start < timeoutMs) {
                        if (this.activeRunners.get(id) !== runner) return true; // Already stopped
                        await new Promise(r => setTimeout(r, 500));
                    }
                    
                    // Still alive after timeout, escalate
                    if (this.activeRunners.get(id) === runner) {
                        logger.info(`[ProcessManager] ${id} (Bedrock) did not stop via ${stage}. Escalating to ${nextSignal}...`);
                        await runner.kill?.(id, nextSignal as any);
                        return false;
                    }
                    return true;
                };

                // Create a self-invoking async block to handle orchestration without blocking the main stopServer call context
                (async () => {
                    const stoppedAfterStdin = await pollAndEscalate('STDIN', 10000, 'SIGINT');
                    if (!stoppedAfterStdin) {
                        const stoppedAfterSigint = await pollAndEscalate('SIGINT', 10000, 'SIGKILL');
                        if (!stoppedAfterSigint) {
                            logger.warn(`[ProcessManager] ${id} (Bedrock) required SIGKILL to terminate.`);
                        }
                    }
                })();
            }
        }
    }

    async gracefulStop(id: string, delaySeconds: number = 30) {
        if (!this.isRunning(id)) return;
        if (this.gracefulShutdowns.has(id)) return;

        logger.info(`[ProcessManager:${id}] Initiating graceful stop with ${delaySeconds}s delay.`);
        this.gracefulShutdowns.set(id, true);

        // Broadcast warnings
        const intervals = [delaySeconds, 10, 5, 3, 2, 1];
        const uniqueIntervals = [...new Set(intervals.filter(s => s > 0 && s <= delaySeconds))].sort((a, b) => b - a);

        for (const seconds of uniqueIntervals) {
            // Check if cancelled
            if (!this.gracefulShutdowns.get(id)) {
                logger.info(`[ProcessManager:${id}] Graceful stop cancelled.`);
                this.sendCommand(id, 'say §a⚠ Graceful shutdown has been CANCELLED!');
                return;
            }

            const index = uniqueIntervals.indexOf(seconds);
            const nextSeconds = uniqueIntervals[index + 1] || 0;
            const waitTime = (seconds - nextSeconds) * 1000;

            this.sendCommand(id, `say §c⚠ Server stopping in ${seconds} seconds!`);
            
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            // Check if server was already stopped manually during wait
            if (!this.isRunning(id)) {
                this.gracefulShutdowns.delete(id);
                return;
            }
        }

        if (this.gracefulShutdowns.get(id)) {
            this.sendCommand(id, 'say §c⚠ Server stopping NOW!');
            await this.stopServer(id);
        }
        this.gracefulShutdowns.delete(id);
    }

    cancelGracefulStop(id: string) {
        if (this.gracefulShutdowns.has(id)) {
            this.gracefulShutdowns.set(id, false);
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
        if (!runner) return;

        const { getServer } = require('../servers/ServerService');
        const server = getServer(id);

        if (server?.software === 'Bedrock') {
            // Bedrock console handles rapid input poorly. 
            // We add a tiny buffer delay to ensure reliability of injection.
            setTimeout(() => {
                runner.sendCommand(id, command);
            }, 50);
        } else {
            runner.sendCommand(id, command);
        }
    }

    isRunning(id: string): boolean {
        return this.activeRunners.has(id);
    }

    async createBackup(id: string, serverDir: string, description?: string, worldOnly?: boolean) {
        const { getServer } = require('../servers/ServerService');
        const server = getServer(id);
        if (!server) throw new Error('Server not found');

        const engine = server.executionEngine || 'native';
        const runner = this.activeRunners.get(id) || runnerFactory.getRunner(engine);

        return runner.createBackup(id, serverDir, { 
            description, 
            worldOnly, 
            nodeId: server.nodeId 
        });
    }

    async restoreBackup(id: string, serverDir: string, backupId: string, options: { scope?: 'full' | 'world' | 'configs' | 'plugins', worldOnly?: boolean } = {}) {
        const { getServer } = require('../servers/ServerService');
        const server = getServer(id);
        if (!server) throw new Error('Server not found');

        const engine = server.executionEngine || 'native';
        const runner = this.activeRunners.get(id) || runnerFactory.getRunner(engine);

        const scope = options.scope || (options.worldOnly ? 'world' : 'full');

        return runner.restoreBackup(id, serverDir, backupId, { 
            scope, 
            nodeId: server.nodeId 
        });
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
            this.clearStartupLock(id);
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
        Array.from(this.startupTimeouts.values()).forEach(clearTimeout);
        this.startupTimeouts.clear();
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
