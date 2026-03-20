import { EventEmitter } from 'events';
import { IServerRunner, RunnerStats } from './IServerRunner';
import { logger } from '../../../utils/logger';
import { systemSettingsService } from '../../system/SystemSettingsService';

/**
 * RemoteRunner — Phase 1 (Stabilized)
 * 
 * Implements IServerRunner to proxy lifecycle commands to remote Node Agents.
 * 
 * IMPORTANT: This class does NOT import NodeAgentHandler directly to avoid
 * circular dependencies. Instead, the agent handler injects its functions
 * via `bindAgentBridge()` at startup.
 */

// Bridge functions injected by NodeAgentHandler (breaks circular import)
type AgentSendFn = (nodeId: string, event: string, data: any, timeoutMs?: number) => Promise<any>;
type AgentCheckFn = (nodeId: string) => boolean;

let _sendToAgent: AgentSendFn | null = null;
let _isAgentConnected: AgentCheckFn | null = null;

/**
 * Called once by NodeAgentHandler to inject its functions.
 * This avoids circular imports between runners ↔ sockets.
 */
export function bindAgentBridge(send: AgentSendFn, check: AgentCheckFn): void {
    _sendToAgent = send;
    _isAgentConnected = check;
    logger.info('[RemoteRunner] Agent bridge bound.');
}

function requireBridge(): void {
    if (!_sendToAgent || !_isAgentConnected) {
        throw new Error(
            'RemoteRunner: Agent bridge not initialized. ' +
            'Ensure setupAgentNamespace() has been called before starting remote servers.'
        );
    }
}

export class RemoteRunner extends EventEmitter implements IServerRunner {

    // Track which servers are running on which nodes
    private serverNodeMap: Map<string, string> = new Map(); // serverId → nodeId
    private runningServers: Set<string> = new Set();

    // Stats cache populated by agent:stats events
    private statsCache: Map<string, RunnerStats> = new Map();

    constructor() {
        super();
        // Listen for stats events from NodeAgentHandler
        this.on('stats', (data: { serverId: string; cpu: number; memory: number; pid?: number }) => {
            this.statsCache.set(data.serverId, {
                cpu: data.cpu,
                memory: data.memory,
                pid: data.pid
            });
        });

        // Listen for close events to update our tracking
        this.on('close', (data: { id: string; code: number }) => {
            this.runningServers.delete(data.id);
            this.serverNodeMap.delete(data.id);
            this.statsCache.delete(data.id);
        });
    }

    async start(id: string, runCommand: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
        requireBridge();

        const nodeId = (env as any).nodeId;
        if (!nodeId) {
            throw new Error(
                `Server "${id}" is configured for remote execution but has no nodeId assigned. ` +
                `Assign it to a node in the server settings.`
            );
        }

        if (!_isAgentConnected!(nodeId)) {
            throw new Error(
                `Cannot start server "${id}" — Node Agent for node "${nodeId}" is not connected. ` +
                `Ensure the agent is running on the remote host and can reach this panel.`
            );
        }

        // Prevent double-start
        if (this.runningServers.has(id)) {
            throw new Error(`Server "${id}" is already running on remote node "${nodeId}".`);
        }

        logger.info(`[RemoteRunner] Sending start command to node ${nodeId} for server ${id}...`);
        
        try {
            await _sendToAgent!(nodeId, 'agent:start', {
                serverId: id,
                runCommand,
                cwd,
                env
            }, 15000);
        } catch (err: any) {
            logger.error(`[RemoteRunner] Failed to start server ${id} on node ${nodeId}: ${err.message}`);
            throw err;
        }

        this.serverNodeMap.set(id, nodeId);
        this.runningServers.add(id);
        logger.info(`[RemoteRunner] Server ${id} started on node ${nodeId}.`);
    }

    async stop(id: string, force: boolean = false): Promise<void> {
        requireBridge();

        const nodeId = this.serverNodeMap.get(id);
        if (!nodeId) {
            // Server might not be tracked — could be from a previous session
            logger.warn(`[RemoteRunner] Cannot stop server "${id}" — no active node assignment found.`);
            return;
        }

        if (!_isAgentConnected!(nodeId)) {
            throw new Error(
                `Cannot stop server "${id}" — Node Agent for node "${nodeId}" is disconnected. ` +
                `The server may still be running on the remote host.`
            );
        }

        logger.info(`[RemoteRunner] Sending stop command to node ${nodeId} for server ${id}...`);
        
        try {
            await _sendToAgent!(nodeId, 'agent:stop', { serverId: id, force }, 10000);
        } catch (err: any) {
            logger.error(`[RemoteRunner] Failed to stop server ${id} on node ${nodeId}: ${err.message}`);
            throw err;
        }
        
        // Don't remove from tracking yet — wait for the close event
    }

    async kill(id: string, signal: string = 'SIGKILL'): Promise<void> {
        requireBridge();

        const nodeId = this.serverNodeMap.get(id);
        if (!nodeId) return;

        if (!_isAgentConnected!(nodeId)) {
            throw new Error(`Cannot kill server "${id}" — remote node is disconnected.`);
        }

        try {
            await _sendToAgent!(nodeId, 'agent:kill', { serverId: id, signal }, 10000);
        } catch (err: any) {
            logger.error(`[RemoteRunner] Kill failed for server ${id}: ${err.message}`);
            throw err;
        }
    }

    async sendCommand(id: string, command: string): Promise<void> {
        requireBridge();

        const nodeId = this.serverNodeMap.get(id);
        if (!nodeId) {
            throw new Error(`Cannot send command to server "${id}" — no active node assignment.`);
        }
        if (!_isAgentConnected!(nodeId)) {
            throw new Error(`Cannot send command to server "${id}" — the remote node is disconnected.`);
        }

        try {
            await _sendToAgent!(nodeId, 'agent:command', { serverId: id, command }, 5000);
        } catch (err: any) {
            logger.error(`[RemoteRunner] Command failed for server ${id}: ${err.message}`);
            throw err;
        }
    }

    async getStats(id: string): Promise<RunnerStats> {
        return this.statsCache.get(id) || { cpu: 0, memory: 0 };
    }

    isRunning(id: string): boolean {
        return this.runningServers.has(id);
    }

    async createBackup(id: string, serverDir: string, options: { description?: string, worldOnly?: boolean, nodeId?: string }): Promise<any> {
        requireBridge();
        const nodeId = options.nodeId || this.serverNodeMap.get(id);
        if (!nodeId) throw new Error(`No node assigned to server ${id}`);

        const settings = systemSettingsService.getSettings();
        const mirror = settings.app.distributedNodes?.mirrorRemoteBackups || false;

        logger.info(`[RemoteRunner] Requesting remote backup for ${id} on node ${nodeId}...`);
        
        const response = await _sendToAgent!(nodeId, 'agent:backup:create', {
            serverId: id,
            description: options.description,
            worldOnly: options.worldOnly,
            mirror
        }, 120000); // 2 minute timeout for ZIP

        return response.backup;
    }

    async restoreBackup(id: string, serverDir: string, backupId: string, options: { worldOnly?: boolean, nodeId?: string }): Promise<void> {
        requireBridge();
        const nodeId = options.nodeId || this.serverNodeMap.get(id);
        if (!nodeId) throw new Error(`No node assigned to server ${id}`);

        logger.info(`[RemoteRunner] Requesting remote restore for ${id} (backupId: ${backupId})...`);

        await _sendToAgent!(nodeId, 'agent:backup:restore', {
            serverId: id,
            backupId,
            worldOnly: options.worldOnly
        }, 120000); // 2 minute timeout
    }

    /**
     * Register a connected node (called by NodeAgentHandler)
     */
    registerNode(nodeId: string, _connection: any): void {
        logger.info(`[RemoteRunner] Node ${nodeId} registered.`);
    }

    /**
     * Unregister a disconnected node (called by NodeAgentHandler)
     * #7 — Emits close events for all servers on this node so ProcessManager
     * marks them as CRASHED/OFFLINE instead of leaving them in ONLINE state.
     */
    unregisterNode(nodeId: string): void {
        const orphanedServers: string[] = [];
        for (const [serverId, nId] of this.serverNodeMap) {
            if (nId === nodeId) {
                orphanedServers.push(serverId);
            }
        }

        for (const serverId of orphanedServers) {
            logger.warn(`[RemoteRunner] Node ${nodeId} disconnected — marking server ${serverId} as lost.`);
            // Emit close with code -2 to indicate "node lost" (not a clean exit)
            this.emit('close', { id: serverId, code: -2 });
            // The 'close' event listener in the constructor will clean up tracking
        }

        if (orphanedServers.length === 0) {
            logger.info(`[RemoteRunner] Node ${nodeId} unregistered (no active servers).`);
        } else {
            logger.warn(`[RemoteRunner] Node ${nodeId} unregistered — ${orphanedServers.length} server(s) marked as lost.`);
        }
    }

    isNodeConnected(nodeId: string): boolean {
        return _isAgentConnected ? _isAgentConnected(nodeId) : false;
    }

    /**
     * Get count of servers running on remote nodes
     */
    getRemoteServerCount(): number {
        return this.runningServers.size;
    }

    /**
     * Get all servers running on a specific node
     */
    getServersOnNode(nodeId: string): string[] {
        const servers: string[] = [];
        for (const [serverId, nId] of this.serverNodeMap) {
            if (nId === nodeId) servers.push(serverId);
        }
        return servers;
    }

    /**
     * #4 — Restore server-node mappings after an agent reconnects.
     * Called when the agent sends agent:sync with its running serverIds.
     */
    syncServersFromAgent(nodeId: string, serverIds: string[]): void {
        let restored = 0;
        for (const serverId of serverIds) {
            if (!this.serverNodeMap.has(serverId)) {
                this.serverNodeMap.set(serverId, nodeId);
                this.runningServers.add(serverId);
                restored++;
                logger.info(`[RemoteRunner] Restored tracking for server ${serverId} on node ${nodeId}.`);
            }
        }
        if (restored > 0) {
            logger.info(`[RemoteRunner] Sync complete: restored ${restored} server(s) for node ${nodeId}.`);
        }
    }
}
