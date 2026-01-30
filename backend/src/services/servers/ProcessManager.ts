import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import si from 'systeminformation';
import path from 'path';

interface ServerProcess {
    process: ChildProcess;
    id: string;
}

class ProcessManager extends EventEmitter {
    private processes: Map<string, ServerProcess> = new Map();
    private logHistory: Map<string, string[]> = new Map();
    private startTimes: Map<string, number> = new Map();
    private statusCache: Map<string, any> = new Map();
    private stoppingServers: Set<string> = new Set();
    private updatingStatuses: Set<string> = new Set();
    private startupLocks: Set<string> = new Set();
    private players: Map<string, Set<string>> = new Map();
    private readonly MAX_LOGS = 1000;
    private lastEmittedStatus: Map<string, string> = new Map();

    constructor() {
        super();
        this.startStatsLoop();
    }

    private startStatsLoop() {
        setInterval(async () => {
            for (const [id, proc] of this.processes.entries()) {
                const stats = await this.getServerStats(id);
                const tps = this.getTPS(id);
                const uptime = this.getUptime(id);
                
                this.emit('stats', { id, ...stats, tps, uptime });
                this.updateCachedStatus(id, { 
                    cpu: stats.cpu,
                    memory: stats.memory,
                    uptime,
                    tps
                });
            }
        }, 3000); // 3s for dashboard liveness
    }

    startServer(id: string, runCommand: string, cwd: string, env: NodeJS.ProcessEnv = {}) {
        if (this.processes.has(id)) {
            throw new Error(`Server ${id} is already running.`);
        }
        
        // Remove from stopping set if present (restarting case)
        this.stoppingServers.delete(id);
        
        // Start "Safe Startup Lock"
        this.startupLocks.add(id);
        console.log(`[ProcessManager] ${id} Startup Lock ACTIVE. Stop command blocked until "Done".`);

        console.log(`[ProcessManager] Starting server ${id} with command: ${runCommand}`);

        const child = spawn(runCommand, {
            cwd,
            shell: true, // Needed for complex command strings on Windows
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...env }
        });

        this.processes.set(id, { process: child, id });
        this.startTimes.set(id, Date.now());
        // INITIAL STATE: STARTING (Yellow)
        this.statusCache.set(id, { online: false, status: 'STARTING', players: 0, playerList: [], uptime: 0, tps: "0.00" });
        
        // Reset state for new run
        this.logHistory.set(id, []); 
        this.players.set(id, new Set()); // Clear players too just in case

        // STARTUP TIMEOUT WATCHDOG (Stabilization)
        // If server hasn't started in 3 minutes, force unlock to prevent UI freeze
        const startupTimeout = setTimeout(() => {
            if (this.startupLocks.has(id)) {
                console.error(`[ProcessManager] ${id} Startup timed out (180s). Releasing lock to allow user intervention.`);
                this.startupLocks.delete(id);
                this.maybeEmitStatus(id, 'OFFLINE'); // Assume failed
            }
        }, 180000);

        const handleLog = (line: string, type: 'stdout' | 'stderr') => {
            const history = this.logHistory.get(id) || [];
            history.push(line);
            if (history.length > this.MAX_LOGS) history.shift();
            this.logHistory.set(id, history);
            
            this.emit('log', { id, line, type });

            // Startup Lock Logic: Unlock on success -> Transition to ONLINE
            // We use the lock presence as the "STARTING" indicator
            if (this.startupLocks.has(id)) {
                // Done (seconds)! | Listening on port | Can't bind to port
                if (line.includes('Done (') || line.includes('Listening on')) {
                    this.startupLocks.delete(id);
                    clearTimeout(startupTimeout); // Clear watchdog
                    this.updateCachedStatus(id, { online: true, status: 'ONLINE' });
                    console.log(`[ProcessManager] ${id} Transitioned to ONLINE (Log Trigger).`);
                } else if (line.includes('FAILED TO BIND') || line.includes('Address already in use')) {
                     // Crash Detection during startup
                     this.startupLocks.delete(id);
                     clearTimeout(startupTimeout); // Clear watchdog
                     // Let the close handler deal with the crash state, but release lock so we don't hang.
                     console.warn(`[ProcessManager] ${id} Startup Failed (Bind Error).`);
                }
            }

            // Log Scraping for Players
            // Log Scraping for Players
            // Regex: Optional prefix ([...]: or :), then Name(3-16 chars), then "joined the game"
            const joinMatch = line.match(/(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+joined the game/i);
            if (joinMatch) {
                const name = joinMatch[1].trim();
                const set = this.players.get(id) || new Set();
                set.add(name);
                this.players.set(id, set);
                console.log(`[ProcessManager] ${id} Player Join: ${name} (Total: ${set.size})`);
                this.updateCachedStatus(id, { 
                    players: set.size,
                    playerList: Array.from(set)
                });
                this.emit('player:join', { serverId: id, name, onlinePlayers: set.size });
            }
            
            const leaveMatch = line.match(/(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+left the game/i);
            if (leaveMatch) {
                const name = leaveMatch[1].trim();
                const set = this.players.get(id);
                if (set) {
                    set.delete(name);
                    console.log(`[ProcessManager] ${id} Player Leave: ${name} (Total: ${set.size})`);
                    this.updateCachedStatus(id, { 
                        players: set.size,
                        playerList: Array.from(set)
                    });
                    this.emit('player:leave', { serverId: id, name, onlinePlayers: set.size });
                }
            }
        };

        child.stdout?.on('data', (data) => handleLog(data.toString(), 'stdout'));
        child.stderr?.on('data', (data) => handleLog(data.toString(), 'stderr'));

        child.on('close', (code) => {
            console.log(`[ProcessManager] Server ${id} stopped with code ${code}`);
            
            // Release lock if it crashes early
            this.startupLocks.delete(id);
            clearTimeout(startupTimeout); // Safe cleanup

            const isIntentional = this.stoppingServers.has(id);
            let finalStatus = 'OFFLINE';
            
            if (!isIntentional && code !== 0 && code !== null) {
                console.warn(`[ProcessManager] Server ${id} CRASHED with code ${code}`);
                finalStatus = 'CRASHED';
            }

            this.stoppingServers.delete(id);

            // Clear persistent start time in DB
            // Clear persistent start time in DB
            const { getServer, saveServer, getServers, updateServer } = require('./ServerService');
            const server = getServer(id);
            if (server) {
                delete server.startTime;
                server.status = finalStatus;
                saveServer(server);



            }

            this.processes.delete(id);
            this.startTimes.delete(id);
            this.statusCache.delete(id);
            this.maybeEmitStatus(id, finalStatus);
        });

        // EMIT STARTING, NOT ONLINE
        this.maybeEmitStatus(id, 'STARTING');
        return child;
    }

    stopServer(id: string, force: boolean = false) {
        if (this.startupLocks.has(id)) {
            if (!force) {
                console.warn(`[ProcessManager] Stop blocked for ${id}: Server is still initializing.`);
                throw new Error('Server is initializing. Stopping now may corrupt files. Use force stop if necessary.');
            } else {
                 console.warn(`[ProcessManager] FORCE STOP initiated for ${id} while locked.`);
            }
        }

        const server = this.processes.get(id);
        if (server) {
            console.log(`[ProcessManager] Stopping server ${id}`);
            this.stoppingServers.add(id);
            server.process.stdin?.write("stop\n");

            // KILL TIMEOUT (Pro-Grade Monitoring)
            const { getServer } = require('./ServerService');
            const config = getServer(id);
            const timeout = config?.advancedFlags?.killTimeout || 30000; // Default 30s

            setTimeout(() => {
                if (this.processes.has(id) && this.stoppingServers.has(id)) {
                    console.warn(`[ProcessManager] ${id} failed to stop gracefully in ${timeout}ms. Sending SIGKILL.`);
                    this.killServer(id);
                }
            }, timeout);
        }
    }

    getProcess(id: string) {
        return this.processes.get(id)?.process;
    }

    killServer(id: string) {
        const server = this.processes.get(id);
        if (server) {
             console.log(`[ProcessManager] Killing server ${id}`);
             server.process.kill();
        }
    }

    sendCommand(id: string, command: string) {
        const server = this.processes.get(id);
        if (server) {
            server.process.stdin?.write(command + "\n");
        }
    }

    isRunning(id: string): boolean {
        return this.processes.has(id);
    }

    getLogs(id: string): string[] {
        return this.logHistory.get(id) || [];
    }

    getUptime(id: string): number {
        // 1. Check active process map first
        let startTime = this.startTimes.get(id);
        
        // 2. Resolve Status
        const status = this.statusCache.get(id);
        const isProcessActive = this.processes.has(id);
        const isOnline = status && (status.online || status.status === 'ONLINE' || status.status === 'STARTING');

        // 3. Fallback to server config (for persistence across restarts)
        if (!startTime) {
            const { getServer } = require('./ServerService');
            const server = getServer(id);
            if (server && server.startTime) startTime = server.startTime;
        }

        // 4. Guard: If we are in STARTING/ONLINE, but no startTime exists yet, 
        // return 0 (correct), but don't reset to 0 if we HAVE a startTime but the cache says offline.
        if (!startTime) return 0;
        
        // 5. Validation: If it's not in the process map AND not online in cache, it's dead.
        if (!isProcessActive && !isOnline) {
            return 0;
        }

        // Return current duration
        return Math.floor((Date.now() - startTime) / 1000);
    }

    getTPS(id: string): string {
        if (!this.isRunning(id)) return "0.00";
        
        const logs = this.logHistory.get(id) || [];
        // Scan last 50 lines for TPS reports
        for (let i = logs.length - 1; i >= Math.max(0, logs.length - 50); i--) {
            const line = logs[i];
            const match = line.match(/TPS from last [\d\w\s]+: ([\d\.]+)/i);
            if (match) return parseFloat(match[1]).toFixed(2);
            
            const matchSpark = line.match(/TPS: ([\d\.]+)/i);
            if (matchSpark) return parseFloat(matchSpark[1]).toFixed(2);
        }
        
        // If query found it online recently, assume 20.00
        const status = this.statusCache.get(id);
        if (status && status.online) return "20.00";

        return "0.00"; 
    }

    updateCachedStatus(id: string, data: any) {
        const current = this.statusCache.get(id) || {};
        
        // State Machine Transition: STARTING -> ONLINE via Ping Success
        if (data.online && current.status === 'STARTING') {
            console.log(`[ProcessManager] ${id} Transitioned to ONLINE (Ping Trigger).`);
            data.status = 'ONLINE';
            this.startupLocks.delete(id); // Release lock
        }

        if (data.status) {
            this.maybeEmitStatus(id, data.status);
        }

        this.statusCache.set(id, { ...current, ...data, lastUpdate: Date.now() });
    }

    getCachedStatus(id: string) {
        return this.statusCache.get(id) || {
            online: false,
            players: 0,
            playerList: [],
            uptime: this.getUptime(id),
            tps: this.getTPS(id)
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
        try {
            const { getServer } = require('./ServerService');
            const server = getServer(id);
            if (!server) return { cpu: 0, memory: 0 };

            let pid: number | null = null;

            // 1. Find PID by Network Port (Most robust for Minecraft)
            const connections = await si.networkConnections();
            const targetPort = server.port || 25565;
            
            // Look for a listener on the server port
            const listener = connections.find(c => 
                (c.localPort === targetPort.toString()) && 
                (c.state === 'LISTEN')
            );

            if (listener && listener.pid) {
                pid = listener.pid;
                console.log(`[Stats:${id}] Found PID ${pid} listening on port ${targetPort}`);
            }

            // 2. Fetch Stats via process list
            const procs = await si.processes();
            
            let target = null;
            if (pid) {
                target = procs.list.find(p => p.pid === pid);
                if (target) console.log(`[Stats:${id}] Tracking Process: ${target.name} | CMD: ${target.command.substring(0, 50)}...`);
            }

            // 3. Fallback: Name & Path matching
            if (!target) {
                const serverPath = server.workingDirectory.toLowerCase();
                target = procs.list.find(p => 
                    (p.name.toLowerCase().includes('java') || p.command.toLowerCase().includes('java')) &&
                    (p.command.toLowerCase().includes(serverPath) || p.params.toLowerCase().includes(serverPath))
                );
            }

            if (target) {
                const memoryMB = target.memRss / 1024;
                return {
                    cpu: target.cpu,
                    memory: memoryMB, // MB
                    pid: target.pid,
                    commandLine: `${target.command} ${target.params}`.trim()
                };
            }

            return { cpu: 0, memory: 0, pid: 0, commandLine: '' };
        } catch (e) {
            console.error(`Failed to get stats for server ${id}`, e);
            return { cpu: 0, memory: 0 };
        }
    }

    async findAndKillGhostProcess(port: number, workingDirectory: string) {
        // Reuse for generic kill request
        return this.killProcessOnPort(port);
    }

    async killProcessOnPort(port: number): Promise<boolean> {
        try {
            console.log(`[ProcessManager] Force killing process on port ${port}...`);
            const connections = await si.networkConnections();
            const listener = connections.find(c => 
                (c.localPort === port.toString()) && 
                (c.state === 'LISTEN')
            );

            if (listener && listener.pid) {
                console.log(`[ProcessManager] Found PID ${listener.pid} on port ${port}. Terminating...`);
                try {
                    process.kill(listener.pid, 'SIGKILL'); // Force Kill
                    return true;
                } catch (e) {
                    console.warn(`[ProcessManager] Failed to SIGKILL PID ${listener.pid}:`, e);
                }
            } else {
                console.log(`[ProcessManager] No active listener found on port ${port}.`);
            }
        } catch (e) {
            console.error('[ProcessManager] Failed to kill process on port:', e);
        }
        return false;
    }

    private maybeEmitStatus(id: string, status: string) {
        if (this.lastEmittedStatus.get(id) === status) return;
        this.lastEmittedStatus.set(id, status);
        this.emit('status', { id, status });
    }
}

export const processManager = new ProcessManager();
