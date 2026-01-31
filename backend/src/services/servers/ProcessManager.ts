import { EventEmitter } from 'events';
import si from 'systeminformation';
import { runnerFactory } from './runners/RunnerFactory';
import { IServerRunner } from './runners/IServerRunner';

class ProcessManager extends EventEmitter {
    private activeRunners: Map<string, IServerRunner> = new Map();
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
            for (const [id, runner] of this.activeRunners.entries()) {
                const stats = await runner.getStats(id);
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
        }, 3000);
    }

    async startServer(id: string, runCommand: string, cwd: string, env: any = {}) {
        if (this.activeRunners.has(id)) {
            throw new Error(`Server ${id} is already running.`);
        }
        
        // --- PORT PROTECTION ENGINE ---
        const port = env.SERVER_PORT;
        if (port) {
            console.log(`[ProcessManager] Integrity Check: Verifying port ${port} availability...`);
            const killed = await this.killProcessOnPort(port);
            if (killed) {
                console.warn(`[ProcessManager] Ghost process detected on port ${port}. Forcefully purged.`);
                await new Promise(r => setTimeout(r, 1000)); // Grace period for OS to release handle
            }
        }
        
        const engine = env.executionEngine || 'native';
        const runner = runnerFactory.getRunner(engine);
        
        this.stoppingServers.delete(id);
        this.startupLocks.add(id);
        console.log(`[ProcessManager] Initializing server ${id} using ${engine} engine.`);

        // Setup Event Handlers for this specific server/runner combo
        const logHandler = (data: { id: string, line: string, type: 'stdout' | 'stderr' }) => {
            if (data.id !== id) return;
            this.handleServerLog(id, data.line, data.type);
        };

        const closeHandler = (data: { id: string, code: number }) => {
            if (data.id !== id) return;
            this.handleServerClose(id, data.code);
            runner.off('log', logHandler);
            runner.off('close', closeHandler);
        };

        runner.on('log', logHandler);
        runner.on('close', closeHandler);

        await runner.start(id, runCommand, cwd, env);
        
        this.activeRunners.set(id, runner);
        this.startTimes.set(id, Date.now());
        this.statusCache.set(id, { online: false, status: 'STARTING', players: 0, playerList: [], uptime: 0, tps: "0.00" });
        this.logHistory.set(id, []);
        this.players.set(id, new Set());

        this.maybeEmitStatus(id, 'STARTING');

        // Startup Timeout Watchdog
        setTimeout(() => {
            if (this.startupLocks.has(id)) {
                console.error(`[ProcessManager] ${id} Startup timed out.`);
                this.startupLocks.delete(id);
                this.maybeEmitStatus(id, 'OFFLINE');
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
                this.updateCachedStatus(id, { online: true, status: 'ONLINE' });
            }
        }

        // Player Tracking
        const joinMatch = line.match(/(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+joined the game/i);
        if (joinMatch) {
            const name = joinMatch[1].trim();
            const set = this.players.get(id) || new Set();
            set.add(name);
            this.players.set(id, set);
            this.updateCachedStatus(id, { players: set.size, playerList: Array.from(set) });
            this.emit('player:join', { serverId: id, name, onlinePlayers: set.size });
        }
        
        const leaveMatch = line.match(/(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+left the game/i);
        if (leaveMatch) {
            const name = leaveMatch[1].trim();
            const set = this.players.get(id);
            if (set) {
                set.delete(name);
                this.updateCachedStatus(id, { players: set.size, playerList: Array.from(set) });
                this.emit('player:leave', { serverId: id, name, onlinePlayers: set.size });
            }
        }
    }

    private handleServerClose(id: string, code: number) {
        console.log(`[ProcessManager] Server ${id} closed with code ${code}`);
        this.startupLocks.delete(id);

        const isIntentional = this.stoppingServers.has(id);
        const finalStatus = (!isIntentional && code !== 0 && code !== null) ? 'CRASHED' : 'OFFLINE';

        this.stoppingServers.delete(id);
        this.activeRunners.delete(id);
        this.startTimes.delete(id);
        this.statusCache.delete(id);

        const { getServer, saveServer } = require('./ServerService');
        const server = getServer(id);
        if (server) {
            delete server.startTime;
            server.status = finalStatus;
            saveServer(server);
        }

        this.maybeEmitStatus(id, finalStatus);
    }

    stopServer(id: string, force: boolean = false) {
        const runner = this.activeRunners.get(id);
        if (runner) {
            if (this.startupLocks.has(id) && !force) {
                throw new Error('Server is initializing. Use force stop if necessary.');
            }
            this.stoppingServers.add(id);
            runner.stop(id, force);
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
        let startTime = this.startTimes.get(id);
        if (!startTime) {
            const { getServer } = require('./ServerService');
            const server = getServer(id);
            if (server && server.startTime) startTime = server.startTime;
        }
        if (!startTime || (!this.isRunning(id) && !this.statusCache.get(id)?.online)) return 0;
        return Math.floor((Date.now() - startTime) / 1000);
    }

    getTPS(id: string): string {
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
        if (data.online && current.status === 'STARTING') {
            data.status = 'ONLINE';
            this.startupLocks.delete(id);
        }
        if (data.status) this.maybeEmitStatus(id, data.status);
        this.statusCache.set(id, { ...current, ...data, lastUpdate: Date.now() });
    }

    getCachedStatus(id: string) {
        return this.statusCache.get(id) || {
            online: false, players: 0, playerList: [], uptime: this.getUptime(id), tps: this.getTPS(id)
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
        try {
            const connections = await si.networkConnections();
            const listener = connections.find(c => (c.localPort === port.toString()) && (c.state === 'LISTEN'));
            if (listener && listener.pid) {
                process.kill(listener.pid, 'SIGKILL');
                return true;
            }
        } catch (e) {}
        return false;
    }

    private maybeEmitStatus(id: string, status: string) {
        if (this.lastEmittedStatus.get(id) === status) return;
        this.lastEmittedStatus.set(id, status);
        this.emit('status', { id, status });
    }
}

export const processManager = new ProcessManager();
