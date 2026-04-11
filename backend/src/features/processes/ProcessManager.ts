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
import { logStreamer } from '../../utils/LogStreamer';


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
    private readonly MAX_LOGS = 100; 
    private lastEmittedStatus: Map<string, string> = new Map();
    private activityHistory: Map<string, any[]> = new Map();
    private focusedServerId: string | null = null; // v1.14.0: Focus mode for UI
    private readonly MAX_ACTIVITY_HISTORY = 100;
    private runnerListeners: Map<string, { log: any, close: any }> = new Map();
    private serverEpochs: Map<string, number> = new Map(); // v2.2: Epoch tracking for race protection

    constructor() {
        super();
        this.initializeRunners();
        this.startStatsLoop();
        this.startSyncLoop();
    }

    private async initializeRunners() {
        const runners = runnerFactory.getAllRunners();
        for (const runner of runners) {
            if (runner.sync) {
                logger.info(`[ProcessManager] Synchronizing runner...`);
                await runner.sync();
                
                // Re-attach listeners for any processes recovered by the runner
                const { getServers } = require('../servers/ServerService');
                const servers = getServers();
                for (const server of servers) {
                    if (runner.isRunning(server.id) && !this.activeRunners.has(server.id)) {
                        logger.info(`[ProcessManager:${server.id}] Recovery: Re-attaching listeners for recovered process.`);
                        this.attachRunnerListeners(server.id, runner, ServerStatus.ONLINE);
                        this.statusCache.set(server.id, { 
                            online: true, 
                            status: ServerStatus.ONLINE, 
                            players: 0, 
                            playerList: [], 
                            uptime: 0, 
                            tps: "0.00" 
                        });
                    }
                }
            }
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

    private isSyncing = false;

    private startSyncLoop() {
        // Periodic sync to detect external/unmanaged processes and recover stuck STARTING states
        setInterval(async () => {
             if (this.isSyncing) return;
             this.isSyncing = true;
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
                            // Phase 66: Passive Reachability only. 
                            logger.debug(`[ProcessManager:${id}] Reachability Sync: Detected port ${server.port} bound. Status remains ${currentStatus} (Startup Lock Active).`);
                            this.updateCachedStatus(id, { online: true }); 
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
             } finally {
                 this.isSyncing = false;
             }
        }, 30000); // Increased interval to 30s for better scalability
    }




    private lastActivityTime: Map<string, number> = new Map();

    private startStatsLoop() {
        setInterval(async () => {
            const now = Date.now();
            const servers = Array.from(this.activeRunners.keys());
            if (servers.length > 0) {
                logger.info(`[ProcessManager] Stats Loop for: ${servers.join(', ')}`);
            }
            const tasks = Array.from(this.activeRunners.entries()).map(async ([id, runner]) => {
                try {
                    // --- ADAPTIVE STATS (v1.14.0: UI-Aware Throttling) ---
                    const lastActivity = this.lastActivityTime.get(id) || 0;
                    const isInactive = (now - lastActivity > 60000); // 1 minute inactivity
                    const isFocused = (this.focusedServerId === id);
                    
                    if (isInactive && !isFocused && (Math.floor(now / 1000) % 5 !== 0)) {
                        return;
                    }

                    const stats = await runner.getStats(id);
                    
                    // Stabilize metrics (v1.12.7)
                    const normalizedCpu = Math.max(0, stats.cpu || 0);
                    const normalizedMem = Math.max(0, stats.memory || 0);
                    
                    const cachedStatus = this.statusCache.get(id);
                    const currentStatus = cachedStatus?.status || ServerStatus.OFFLINE;
                    
                    // Allow metrics if process is running (v1.12.7)
                    const isLive = currentStatus === ServerStatus.ONLINE || 
                                   currentStatus === ServerStatus.STARTING || 
                                   currentStatus === ServerStatus.RESTARTING || 
                                   currentStatus === ServerStatus.STOPPING;

                    const displayCpu = isLive ? normalizedCpu : 0;
                    const displayMem = isLive ? normalizedMem : 0;

                    // TPS Throttling
                    let tps = cachedStatus?.tps || "0.00";
                    if (isFocused || (Math.floor(now / 1000) % 5 === 0)) {
                        tps = await this.getTPS(id);
                    }

                    const uptime = this.getUptime(id);
                    const latency = cachedStatus?.latency || 0;
                    const players = cachedStatus?.players || 0;

                    // Emit to Sockets
                    this.emit('stats', { 
                        id, 
                        cpu: displayCpu, 
                        memory: displayMem, 
                        tps, 
                        uptime, 
                        latency: latency, // Correctly use latency
                        players,
                        pid: stats.pid || 0 // Added PID (v1.12.8)
                    });

                    statsRingBuffer.push(id, {
                        cpu: displayCpu,
                        memory: displayMem,
                        tps: parseFloat(tps),
                        players,
                        timestamp: Date.now()
                    });
                } catch (e) {
                    logger.error(`[ProcessManager] Stats failed for ${id}: ${e}`);
                }
            });

            await Promise.all(tasks);
        }, 1000); 
    }

    public setFocus(id: string | null) {
        this.focusedServerId = id;
        logger.debug(`[ProcessManager] UI Focus set to: ${id || 'NONE'}`);
    }

    async startServer(id: string, runCommand: string, cwd: string, env: any = {}) {
        if (this.activeRunners.has(id)) {
            logger.warn(`[ProcessManager:${id}] Start requested but runner is already active. (Idempotency)`);
            return;
        }

        // --- AUTOMATIC REPAIR RESET (v2.2) ---
        // If the user manually starts the server, we assume they've triaged it.
        // Resetting stability markers allows Automatic Repair to resume monitoring.
        const { automaticRepairService } = require('../diagnosis/AutomaticRepairService');
        automaticRepairService.resetStabilityMarker(id);
        
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
        
        // --- RESOURCE ENFORCEMENT (v1.14.0) ---
        // Pass hardware limits to the runner for OS-level throttling
        const { getServer } = require('../servers/ServerService');
        const server = getServer(id);
        if (server) {
            env.CC_RAM_LIMIT_MB = (server.ram * 1024).toString();
            env.CC_CPU_PRIORITY = (server.cpuPriority || 'normal').toLowerCase();
        }

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
                // Phase 66: Persist STARTING state so frontend pollers don't see STALE data
                this.updateCachedStatus(id, { status: ServerStatus.STARTING, online: false }, true);
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
        // --- v2.2: EPOCH EVOLUTION ---
        // Increment epoch for this server to invalidate any pending events from previous runs
        const epoch = (this.serverEpochs.get(id) || 0) + 1;
        this.serverEpochs.set(id, epoch);

        // Setup Event Handlers for this specific server/runner combo
        const logHandler = (data: { id: string, line: string, type: 'stdout' | 'stderr' }) => {
            if (data.id !== id) return;
            
            // Validate Epoch: Ignore logs from dead/recycled processes
            if (this.serverEpochs.get(id) !== epoch) return;

            this.lastActivityTime.set(id, Date.now()); // Any log output counts as activity
            this.handleServerLog(id, data.line, data.type);
        };

        const closeHandler = (data: { id: string, code: number }) => {
            if (data.id !== id) return;

            // Validate Epoch: Ignore close events from old instances
            if (this.serverEpochs.get(id) !== epoch) {
                logger.warn(`[ProcessManager:${id}] Ignored late 'close' event (Epoch ${epoch} vs Current ${this.serverEpochs.get(id)})`);
                return;
            }

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
        this.lastActivityTime.set(id, Date.now()); // Mark activity for Adaptive Stats
        const history = this.logHistory.get(id) || [];

        history.push(line);
        if (history.length > this.MAX_LOGS) history.shift();
        this.logHistory.set(id, history);
        
        this.emit('log', { id, line, type });

        if (this.startupLocks.has(id)) {
            if (line.includes('Done (') || line.includes('Listening on')) {
                this.clearStartupLock(id);
                this.updateCachedStatus(id, { online: true, status: ServerStatus.ONLINE }, true);
            }
        }

        // --- DISK STREAMING (Enterprise Scale) ---
        const { getServer } = require('../servers/ServerService');
        const server = getServer(id);
        if (server) {
            logStreamer.append(id, server.workingDirectory, line);
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
        this.lastActivityTime.set(id, Date.now()); // Mark activity for Adaptive Stats
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
        
        // Phase 62: Startup Race Protection (v1.12.16)
        // If a new startup is already in lock-phase, ignore close events from the previous session/purging
        if (this.startupLocks.has(id)) {
            logger.warn(`[ProcessManager:${id}] Ignored close event (code ${code}) during active startup sequence.`);
            return;
        }

        this.clearStartupLock(id);

        const isIntentional = this.stoppingServers.has(id);
        const finalStatus = (!isIntentional && code !== 0 && code !== null) ? ServerStatus.CRASHED : ServerStatus.OFFLINE;
        
        this.stoppingServers.delete(id);
        const { getServer, saveServer, invalidateDiagnosisCache } = require('../servers/ServerService');
        const server = getServer(id);
        if (server) {
            if (isIntentional || finalStatus === ServerStatus.CRASHED) {
                delete server.startTime;
                this.onlineTimes.delete(id);
                saveServer(server); // Commit metadata changes
                
                if (finalStatus === ServerStatus.CRASHED) {
                    invalidateDiagnosisCache(id);
                }
            }
        }

        // --- Phase 63/66: Unified Zero-Point Reset & Persistence ---
        this.updateCachedStatus(id, { 
            status: finalStatus, 
            online: false,
            cpu: 0,
            memory: 0,
            tps: "0.00",
            uptime: 0,
            players: 0,
            playerList: []
        }, true); // PERSIST final state
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

            const { getServer } = require('../servers/ServerService');
            const server = getServer(id);

            // Universal Zombie Process Killer Timeout (Phase 7)
            const shutdownMs = server?.shutdownTimeout || 30000;
            const killTargetRunner = runner;
            setTimeout(async () => {
                if (this.activeRunners.get(id) === killTargetRunner && this.stoppingServers.has(id)) {
                    logger.warn(`[ProcessManager] ${id} did not stop within ${shutdownMs}ms. Forcing SIGKILL to prevent zombie process.`);
                    await killTargetRunner.kill?.(id, 'SIGKILL');
                }
            }, shutdownMs);

            // Bedrock-Specific Smart Shutdown Orchestration
            // Bedrock-Specific Smart Shutdown Orchestration (Phase 12: Optimized Polling)
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
            // Bedrock is fixed at 20 ticks theoretically
            return cached?.online ? "20.00" : "0.00";
        }

        const logs = this.logHistory.get(id) || [];
        // Scan deeper (150 lines) for TPS logs
        for (let i = logs.length - 1; i >= Math.max(0, logs.length - 150); i--) {
            const line = logs[i];
            const match = line.match(/TPS from last [\d\w\s]+: ([\d\.]+)/i) || 
                          line.match(/TPS: ([\d\.]+)/i) ||
                          line.match(/current tps: ([\d\.]+)/i); // Added more common format
            if (match) return parseFloat(match[1]).toFixed(2);
        }

        const cached = this.statusCache.get(id);
        // Phase 59: TPS Latch (v1.12.14)
        // If we have a non-zero cached TPS, keep it instead of dropping to 0 or 20
        if (cached?.online && cached.tps && cached.tps !== "0.00") {
            return cached.tps;
        }

        return cached?.online ? "20.00" : "0.00"; 
    }

    /**
     * Phase 66: Unified Lifecycle Engine (v2.0)
     * Centralizes status updates to prevent race conditions and split-brain sync fixes.
     */
    updateCachedStatus(id: string, data: any, persist: boolean = false) {
        const current = this.statusCache.get(id) || {};
        
        // --- SMART PLAYER MERGE (Preserved from v1.12.16) ---
        if (data.playerList) {
            const currentList: string[] = current.playerList || [];
            const newList: string[] = data.playerList;
            if (newList.length === 0 && currentList.length > 0 && data.players > 0) {
                 data.playerList = currentList;
            } else if (newList.length > 0) {
                const hasGeneric = newList.some(n => n.toLowerCase().includes('anonymous') || n.toLowerCase().includes('unknown'));
                if (hasGeneric && currentList.length > 0) {
                    const combined = new Set([...currentList, ...newList]);
                    data.playerList = Array.from(combined).filter(name => {
                        const isGeneric = name.toLowerCase().includes('anonymous') || name.toLowerCase().includes('unknown');
                        return !isGeneric || combined.size === 1;
                    });
                }
            }
        }

        // --- SOURCE OF TRUTH CONSOLIDATION ---
        // We REMOVED the early promotion rule (online && STARTING -> ONLINE)
        // Readiness must now be explicitly declared by the log parser or fallback timeout.
        
        const newStatus = data.status || current.status;
        const isTransitioningFromBoot = current.status === ServerStatus.STARTING || current.status === ServerStatus.RESTARTING;
        const isNowOnline = newStatus === ServerStatus.ONLINE;

        if (isNowOnline && (isTransitioningFromBoot || current.status === ServerStatus.OFFLINE || !current.status)) {
            // Only update onlineTimes and clear lock if we just officially became online
            if (current.status !== ServerStatus.ONLINE) {
                this.onlineTimes.set(id, Date.now());
                this.clearStartupLock(id);
            }
        }

        // Persistence Sync: Update database if requested (ensures frontend list matches memory)
        if (persist && data.status) {
            const { getServer, saveServer } = require('../servers/ServerService');
            const server = getServer(id);
            if (server && server.status !== data.status) {
                server.status = data.status;
                saveServer(server);
            }
        }

        // Event Emission
        if (data.status) this.maybeEmitStatus(id, data.status);
        
        // Final Merge
        this.statusCache.set(id, { 
            ...current, 
            ...data, 
            status: newStatus, 
            lastUpdate: Date.now() 
        });
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
        logStreamer.close(id); // Release file handle
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
