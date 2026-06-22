import { Server, Socket } from 'socket.io';
import { nodeRegistryService } from './NodeRegistryService';
import { runnerFactory } from '../processes/runners/RunnerFactory';
import { bindAgentBridge } from '../processes/runners/RemoteRunner';
import { systemSettingsService } from '../system/SystemSettingsService';
import { auditService } from '../system/AuditService';
import {  NodeHealth, NodeStatus  } from '@shared/types';
import { logger } from '../../utils/logger';
import { jitterMiddleware } from '../../sockets/middleware/JitterMiddleware';
import { ErrorCode, SystemError } from '../../utils/ErrorCodes';

/**
 * NodeAgentHandler — Phase 1 (Stabilized)
 * 
 * Manages WebSocket connections from remote Node Agents.
 * Uses a dedicated `/agent` namespace to keep agent traffic
 * separate from user-facing sockets.
 * 
 * Protocol:
 *   Agent → Panel:  agent:heartbeat, agent:log, agent:close, agent:stats
 *   Panel → Agent:  agent:start, agent:stop, agent:command
 */

// Track connected agent sockets: nodeId → Socket
const agentSockets: Map<string, Socket> = new Map();

/**
 * Check if an agent is currently connected
 */
export function isAgentConnected(nodeId: string): boolean {
    const socket = agentSockets.get(nodeId);
    if (!socket || !socket.connected) return false;

    // Verify node isn't marked OFFLINE by the sweep
    const node = nodeRegistryService.getNode(nodeId);
    return !!node && node.status === NodeStatus.ONLINE;
}

/**
 * Get the socket for a connected agent
 */
export function getAgentSocket(nodeId: string): Socket | undefined {
    return agentSockets.get(nodeId);
}

/**
 * Send a command to a specific node agent.
 * Returns a promise that resolves when the agent acknowledges.
 */
export async function sendToAgent(nodeId: string, event: string, data: any, timeoutMs: number = 10000): Promise<any> {
    const socket = agentSockets.get(nodeId);
    if (!socket || !socket.connected) {
        agentSockets.delete(nodeId); // Clean up stale reference
        throw new Error(`Node Agent "${nodeId}" is not connected.`);
    }

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new SystemError(ErrorCode.E_PROC_TIMEOUT, `Timeout: Node Agent "${nodeId}" did not respond within ${timeoutMs / 1000}s.`));
        }, timeoutMs);

        socket.emit(event, data, (response: any) => {
            clearTimeout(timer);
            if (response?.error) {
                reject(new SystemError(ErrorCode.E_NODE_DEGRADED, response.error));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Send a restart command to the node agent itself
 */
export async function restartNode(nodeId: string): Promise<any> {
    logger.info(`[AgentHandler] Initiating remote restart for node ${nodeId}`);
    return sendToAgent(nodeId, 'agent:restart', { timestamp: Date.now() });
}

/**
 * Trigger a diagnostics run on the remote node
 */
export async function runDiagnostics(nodeId: string): Promise<any> {
    logger.info(`[AgentHandler] Triggering remote diagnostics for node ${nodeId}`);
    return sendToAgent(nodeId, 'agent:diagnostics', { timestamp: Date.now() });
}

/**
 * Get count of currently connected agents
 */
export function getConnectedAgentCount(): number {
    return agentSockets.size;
}

/**
 * Register the /agent namespace on the Socket.IO server.
 */
export function setupAgentNamespace(io: Server): void {
    // Bind the agent bridge to RemoteRunner (breaks circular import)
    bindAgentBridge(sendToAgent, isAgentConnected);

    const agentNs = io.of('/agent');

    // Authentication middleware for agents
    agentNs.use((socket, next) => {
        try {
            // 1. Check for E2E Test Bypass
            const secret = socket.handshake.auth?.secret;
            const nodeId = socket.handshake.auth?.nodeId;

            if (process.env.NODE_ENV === 'test' && secret === 'e2e-secret-bypass') {
                 // Ensure node exists in registry so heartbeat works
                 let node = nodeRegistryService.getNode(nodeId);
                 if (!node) {
                     logger.info(`[AgentHandler] E2E Bypass: Injecting missing node ${nodeId}`);
                     nodeRegistryService.injectNode({
                         id: nodeId,
                         name: 'E2E Test Node',
                         host: '127.0.0.1',
                         port: 3006,
                         status: NodeStatus.ENROLLING,
                         protocolVersion: 'E2E',
                         enrolledAt: Date.now(),
                         lastHeartbeat: Date.now(),
                         labels: ['e2e']
                     });
                 }

                 (socket as any).nodeId = nodeId;
                 (socket as any).nodeName = node?.name || 'E2E Test Node';
                 logger.info(`[AgentHandler] E2E Bypass: Allowing connection for ${nodeId}`);
                 return next();
            }

            // 2. Standard Production Auth
            const settings = systemSettingsService.getSettings();
            
            // Allow 'local' node even if distributed nodes is disabled
            // We check nodeId from auth here (it's validated later for format)
            const incomingNodeId = socket.handshake.auth?.nodeId;

            if (!settings.app.distributedNodes?.enabled && incomingNodeId !== 'local') {
                return next(new Error('Distributed Nodes is disabled on this panel.'));
            }

            if (!nodeId || typeof nodeId !== 'string') {
                return next(new Error('Missing or invalid nodeId in handshake auth.'));
            }

            // Validate nodeId format (UUID) or allow 'local'
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (nodeId !== 'local' && !uuidRegex.test(nodeId)) {
                return next(new Error('Invalid nodeId format. Expected UUID.'));
            }

            // Verify the node is enrolled
            const node = nodeRegistryService.getNode(nodeId);
            if (!node) {
                return next(new Error(`Node "${nodeId}" is not enrolled on this panel. Enroll it first via Settings.`));
            }

            // Enforce Secret Validation
            if (!nodeRegistryService.verifySecret(nodeId, secret)) {
                logger.warn(`[AgentHandler] Authentication failed for node "${node.name}" (${nodeId}): Invalid secret.`);
                return next(new Error('Authentication failed: Invalid node secret.'));
            }

            (socket as any).nodeId = nodeId;
            (socket as any).nodeName = node.name;

            const agentVersion = socket.handshake.auth?.agentVersion;
            const protocolVersion = socket.handshake.auth?.protocolVersion;

            // Version Handshake Enforcement
            // We require protocol version 1 or higher (introduced in v1.10.0)
            const MIN_PROTOCOL_VERSION = 1;
            const currentProto = protocolVersion ? parseInt(protocolVersion) : 0;

            if (currentProto < MIN_PROTOCOL_VERSION && process.env.NODE_ENV !== 'test') {
                logger.warn(`[AgentHandler] Node "${node.name}" (${nodeId}) rejected: Incompatible protocol version (Agent: ${currentProto}, Min Required: ${MIN_PROTOCOL_VERSION}).`);
                return next(new Error(`Incompatible protocol version (v${currentProto}). Please update your Node Agent (requires v${MIN_PROTOCOL_VERSION}+).`));
            }

            if (agentVersion) (socket as any).agentVersion = agentVersion;
            if (protocolVersion) (socket as any).protocolVersion = protocolVersion;

            next();
        } catch (err: any) {
            logger.error(`[AgentHandler] Auth middleware error: ${err.message}`);
            next(new Error('Authentication failed.'));
        }
    });

    // 2.5 Jitter Middleware for agents
    agentNs.use(jitterMiddleware);

    agentNs.on('connection', (socket: Socket) => {
        const nodeId = (socket as any).nodeId as string;
        const nodeName = (socket as any).nodeName as string;

        // Prevent duplicate connections from the same node
        const existing = agentSockets.get(nodeId);
        if (existing) {
            logger.warn(`[AgentHandler] Node "${nodeName}" (${nodeId}) reconnecting — disconnecting stale socket.`);
            try {
                existing.disconnect(true);
            } catch (e) {
                // Stale socket may already be dead
            }
        }

        agentSockets.set(nodeId, socket);
        const agentVer = (socket as any).agentVersion || 'unknown';
        const protoVer = (socket as any).protocolVersion || 'unknown';
        logger.info(`[AgentHandler] ✓ Node Agent connected: "${nodeName}" (${nodeId}) [${socket.id}] agent=v${agentVer} proto=v${protoVer}`);

        // Register with RemoteRunner
        const remoteRunner = runnerFactory.getRemoteRunner();
        remoteRunner.registerNode(nodeId, socket);

        // --- Settings Sync ---
        const syncSettings = () => {
            const s = systemSettingsService.getSettings();
            socket.emit('agent:settings-sync', {
                dockerEnabled: s.app?.dockerEnabled || false,
                baseServersPath: s.app?.baseServersPath || ''
            });
        };
        syncSettings();

        // Set node to RECOVERING until first sync is complete
        nodeRegistryService.updateStatus(nodeId, NodeStatus.RECOVERING);

        // Mark node as ONLINE and store agent version
        try {
            nodeRegistryService.heartbeat(nodeId);
            // Update node address from socket connection (for Pre-Enrollment flow)
            const address = socket.handshake.address;
            if (address) {
                // Strip IPv6 prefix if present (e.g. ::ffff:)
                const cleanAddress = address.replace(/^::ffff:/, '');
                nodeRegistryService.updateNodeAddress(nodeId, cleanAddress);
            }
        } catch (e: any) {
            logger.error(`[AgentHandler] Failed to process initial heartbeat for ${nodeId}: ${e.message}`);
        }
        
        const nodeInfo = nodeRegistryService.getNode(nodeId);
        if (nodeInfo) nodeInfo.agentVersion = agentVer;

        auditService.log('SYSTEM', 'SYSTEM_SETTINGS_UPDATE', nodeId, {
            action: 'NODE_CONNECTED',
            nodeName,
            socketId: socket.id
        });

        // ── Heartbeat ──
        socket.on('agent:heartbeat', (data: { health?: NodeHealth }, callback?: (ack: any) => void) => {
            try {
                nodeRegistryService.heartbeat(nodeId, data.health);
                
                // Fulfill "Global IP Sync" claim: Provide the agent with the panel's current public IP
                if (typeof callback === 'function') {
                    callback({
                        success: true,
                        panelPublicIp: nodeRegistryService.getPanelPublicIp(),
                        timestamp: Date.now()
                    });
                }
            } catch (e: any) {
                logger.error(`[AgentHandler] Heartbeat processing error for node ${nodeId}: ${e.message}`);
                if (typeof callback === 'function') {
                    callback({ success: false, error: e.message });
                }
            }
        });

        // ── Reconnect State Sync (#4) ──
        socket.on('agent:sync', (data: { serverIds?: string[] }) => {
            if (!data?.serverIds || !Array.isArray(data.serverIds)) return;
            const validIds = data.serverIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0);
            if (validIds.length > 0) {
                logger.info(`[AgentHandler] Node "${nodeName}" synced ${validIds.length} running server(s): ${validIds.join(', ')}`);
                remoteRunner.syncServersFromAgent(nodeId, validIds);
            }
            // Transition out of RECOVERING once sync is received
            if (nodeRegistryService.getNode(nodeId)?.status === NodeStatus.RECOVERING) {
                nodeRegistryService.updateStatus(nodeId, NodeStatus.ONLINE);
            }
        });

        // Send Capabilities
        socket.on('agent:capabilities', (caps: any) => {
            if (caps && typeof caps === 'object') {
                nodeRegistryService.updateCapabilities(nodeId, caps);
            }
        });

        // ── Server Lifecycle Responses ──
        socket.on('agent:log', (data: { serverId: string; line: string; type: 'stdout' | 'stderr' }) => {
            if (!data?.serverId || !data?.line) return; // Defensive
            remoteRunner.emit('log', { id: data.serverId, line: data.line, type: data.type || 'stdout' });
        });

        // #3 — Handle batched log lines
        socket.on('agent:log-batch', (data: { serverId: string; lines: { line: string; type: 'stdout' | 'stderr' }[] }) => {
            if (!data?.serverId || !Array.isArray(data?.lines)) return;
            for (const entry of data.lines) {
                if (!entry?.line) continue;
                remoteRunner.emit('log', { id: data.serverId, line: entry.line, type: entry.type || 'stdout' });
            }
        });

        socket.on('agent:close', (data: { serverId: string; code: number }) => {
            if (!data?.serverId) return;
            logger.info(`[AgentHandler] Server ${data.serverId} closed on node ${nodeId} (exit code: ${data.code})`);
            remoteRunner.emit('close', { id: data.serverId, code: data.code ?? -1 });
        });

        socket.on('agent:stats', (data: { serverId: string; cpu: number; memory: number; pid?: number }) => {
            if (!data?.serverId) return;
            remoteRunner.emit('stats', data);
        });

        // ── Error handling ──
        socket.on('error', (err) => {
            logger.error(`[AgentHandler] Socket error from node "${nodeName}" (${nodeId}): ${err.message}`);
        });

        // ── Disconnect ──
        socket.on('disconnect', (reason) => {
            logger.warn(`[AgentHandler] ✗ Node Agent disconnected: "${nodeName}" (${nodeId}) — Reason: ${reason}`);
            agentSockets.delete(nodeId);
            remoteRunner.unregisterNode(nodeId);

            // Mark node OFFLINE immediately instead of waiting for sweep
            try {
                nodeRegistryService.updateStatus(nodeId, NodeStatus.OFFLINE);
            } catch (e: any) {
                logger.error(`[AgentHandler] Failed to update status for disconnected node ${nodeId}: ${e.message}`);
            }

            auditService.log('SYSTEM', 'SYSTEM_SETTINGS_UPDATE', nodeId, {
                action: 'NODE_DISCONNECTED',
                nodeName,
                reason
            });
        });
    });

    // Push settings to ALL agents when global settings change
    systemSettingsService.on('updated', (s) => {
        logger.info('[AgentHandler] Global settings updated, syncing to all nodes...');
        agentNs.emit('agent:settings-sync', {
            dockerEnabled: s.app?.dockerEnabled || false,
            baseServersPath: s.app?.baseServersPath || ''
        });
    });

    // Start heartbeat sweep to detect stale nodes
    nodeRegistryService.startHeartbeatSweep();

    logger.info('[AgentHandler] /agent namespace initialized. Waiting for Node Agent connections...');
}
