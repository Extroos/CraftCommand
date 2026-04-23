import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import {  NodeInfo, NodeStatus, NodeCapabilities  } from '@shared/types';
import { logger } from '../../utils/logger';
import { auditService } from '../system/AuditService';
import { DATA_DIR } from '../../constants';
import { systemSettingsService } from '../system/SystemSettingsService';
import { NetUtils } from '../../utils/NetUtils';

const NODES_FILE = path.join(DATA_DIR, 'nodes.json');

// Debounce save interval (ms) — prevents disk thrashing from frequent heartbeats
const SAVE_DEBOUNCE_MS = 5000;

/**
 * NodeRegistryService — Phase 1 (Stabilized)
 * 
 * Manages the registry of enrolled Node Agents.
 * Handles enrollment, removal, heartbeat tracking, and stale detection.
 * Persists to data/nodes.json with debounced writes.
 * 
 * Panel decides. Agent performs.
 */
export class NodeRegistryService extends EventEmitter {

    private nodes: Map<string, NodeInfo> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private ipRefreshInterval: NodeJS.Timeout | null = null;
    private saveTimeout: NodeJS.Timeout | null = null;
    private dirty: boolean = false;
    private panelPublicIp: string = '127.0.0.1';
    private joinTokens: Map<string, { nodeId: string; expires: number }> = new Map();

    constructor() {
        super();
        this.loadNodes();

        // Sync with System Settings (Distributed Nodes Flag)
        systemSettingsService.on('updated', (settings) => {
            if (settings.app?.distributedNodes?.enabled) {
                this.startHeartbeatSweep();
            } else {
                this.stopHeartbeatSweep();
            }
        });
        const settings = systemSettingsService.getSettings();
        if (settings.app?.distributedNodes?.enabled) {
            this.startHeartbeatSweep();
            this.startIpDiscovery();
        }
    }

    private async startIpDiscovery() {
        if (this.ipRefreshInterval) return;
        
        const refresh = async () => {
            try {
                const ip = await NetUtils.getPublicIP();
                if (ip && ip !== this.panelPublicIp) {
                    this.panelPublicIp = ip;
                    logger.info(`[NodeRegistry] Panel Public IP discovered: ${ip}`);
                }
            } catch (e: any) {
                logger.warn(`[NodeRegistry] Public IP discovery failed (External Connectivity Issue): ${e.message}`);
                // Fallback to local if totally isolated
                if (this.panelPublicIp === '127.0.0.1') {
                    this.panelPublicIp = NetUtils.getLocalIP();
                }
            }
        };

        await refresh();
        // Refresh every hour
        this.ipRefreshInterval = setInterval(refresh, 3600000);
    }

    public getPanelPublicIp(): string {
        return this.panelPublicIp;
    }

    // ── Persistence (Debounced) ──

    private loadNodes(): void {
        try {
            if (fs.existsSync(NODES_FILE)) {
                const data: NodeInfo[] = fs.readJSONSync(NODES_FILE);
                if (!Array.isArray(data)) {
                    logger.error('[NodeRegistry] Invalid nodes.json format — expected array. Starting fresh.');
                } else {
                    for (const node of data) {
                        // Validate structure
                        if (!node?.id || !node?.name || !node?.host) {
                            logger.warn(`[NodeRegistry] Skipping invalid node entry: ${JSON.stringify(node).substring(0, 100)}`);
                            continue;
                        }
                        // Mark all nodes as OFFLINE on startup until they heartbeat
                        // Hardening: Local node stays ONLINE (Host process is running if panel is running)
                        node.status = (node.id === 'local') ? NodeStatus.ONLINE : NodeStatus.OFFLINE;
                        this.nodes.set(node.id, node);
                    }
                }

                // FIX: Backfill missing enrollmentSecret for existing "local" node (if migration needed)
                const localNode = this.nodes.get('local');
                if (localNode && !localNode.enrollmentSecret) {
                    logger.info('[NodeRegistry] Backfilling missing enrollmentSecret for "Local Node".');
                    localNode.enrollmentSecret = crypto.randomBytes(32).toString('hex');
                    this.saveNow();
                }

                logger.info(`[NodeRegistry] Loaded ${this.nodes.size} enrolled node(s).`);
            }

            // Always ensure "local" node exists for zero-config operation
            if (!this.nodes.has('local')) {
                this.enrollLocalDefault();
            }
        } catch (e) {
            logger.error(`[NodeRegistry] Failed to load nodes: ${e}`);
        }
    }

    private enrollLocalDefault(): void {
        logger.info('Creating default "Local Node" for one-click hosting...');
        const id = 'local';
        const now = Date.now();
        const secret = crypto.randomBytes(32).toString('hex');

        const node: NodeInfo = {
            id,
            name: 'Local Node',
            host: '127.0.0.1',
            port: 3001, // Default port (matches panel)
            status: NodeStatus.ONLINE, // We assume the panel is online if it's running this
            protocolVersion: '1.0',
            enrolledAt: now,
            lastHeartbeat: now,
            labels: ['built-in', 'local'],
            capabilities: {
                java: 'Detection Pending',
                docker: false, 
                node: process.version
            },
            enrollmentSecret: secret
        };

        this.nodes.set(id, node);
        this.saveNow();
        logger.info('[NodeRegistry] ✓ Default "Local Node" auto-enrolled.');
    }

    private saveNodes(): void {
        try {
            fs.writeJSONSync(NODES_FILE, Array.from(this.nodes.values()), { spaces: 2 });
            this.dirty = false;
        } catch (e) {
            logger.error(`[NodeRegistry] Failed to save nodes: ${e}`);
        }
    }

    /**
     * Schedule a debounced save. Multiple calls within the debounce window
     * are coalesced into a single write. This prevents disk thrashing from
     * heartbeats (one per node every ~30s).
     */
    private scheduleSave(): void {
        this.dirty = true;
        if (this.saveTimeout) return; // Already scheduled
        this.saveTimeout = setTimeout(() => {
            this.saveTimeout = null;
            if (this.dirty) this.saveNodes();
        }, SAVE_DEBOUNCE_MS);
    }

    /** Force an immediate save (used for critical mutations like enroll/remove) */
    private saveNow(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        this.saveNodes();
    }

    // ── Enrollment ──

    /**
     * Enroll a new node into the registry.
     * Returns the enrolled node info.
     * Throws if a node with the same host:port already exists.
     */
    enroll(name: string, host: string, port: number, labels: string[] = []): NodeInfo {
        // Input sanitization
        name = this.sanitizeName(name);
        host = this.sanitizeHost(host);

        if (!name) throw new Error('Node name is required.');
        if (!host) throw new Error('Node host is required.');
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid port: ${port}. Must be between 1 and 65535.`);
        }

        // Duplicate check: prevent enrolling the same host:port twice
        for (const existing of this.nodes.values()) {
            if (existing.host === host && existing.port === port) {
                throw new Error(
                    `A node is already enrolled at ${host}:${port} ("${existing.name}"). ` +
                    `Remove it first if you want to re-enroll.`
                );
            }
        }

        // Name uniqueness check
        for (const existing of this.nodes.values()) {
            if (existing.name.toLowerCase() === name.toLowerCase()) {
                throw new Error(
                    `A node named "${existing.name}" already exists. Choose a different name.`
                );
            }
        }

        const id = crypto.randomUUID();
        const now = Date.now();

        // Read version.json for protocol version (v1.13.0 Resilience)
        let protocolVersion = '0.0.0';
        try {
            const vf = path.join(__dirname, '../../../../version.json');
            if (fs.existsSync(vf)) {
                const versionData = fs.readJSONSync(vf);
                // Handle both object { version: "..." } and legacy string "..." formats
                protocolVersion = versionData?.version || (typeof versionData === 'string' ? versionData : '0.0.0');
            }
        } catch (e) { /* use fallback */ }

        const node: NodeInfo = {
            id,
            name,
            host,
            port,
            status: NodeStatus.ENROLLING,
            protocolVersion,
            enrolledAt: now,
            lastHeartbeat: now,
            labels: labels.filter(l => typeof l === 'string' && l.trim().length > 0).map(l => l.trim()),
            enrollmentSecret: crypto.randomBytes(32).toString('hex')
        };

        this.nodes.set(id, node);
        this.saveNow(); // Critical mutation — save immediately

        auditService.log('SYSTEM', 'SYSTEM_SETTINGS_UPDATE', id, {
            action: 'NODE_ENROLLED',
            nodeName: name,
            host,
            port
        });

        logger.info(`[NodeRegistry] Enrolled node "${name}" (${id}) at ${host}:${port}`);
        this.emit('status', { nodeId: id, status: node.status, node });
        return node;
    }

    /**
     * Creates a short-lived join token for a specific node.
     * Valid for 15 minutes.
     */
    public createJoinToken(nodeId: string): string {
        const node = this.nodes.get(nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found.`);

        const token = crypto.randomBytes(16).toString('hex');
        this.joinTokens.set(token, {
            nodeId,
            expires: Date.now() + (15 * 60 * 1000)
        });

        return token;
    }

    /**
     * Validates and consumes a join token, returning the encoded enrollment config.
     */
    public consumeJoinToken(token: string): { panelUrl: string; nodeId: string; nodeSecret: string } {
        const entry = this.joinTokens.get(token);
        if (!entry) throw new Error('Invalid or expired join token.');

        if (Date.now() > entry.expires) {
            this.joinTokens.delete(token);
            throw new Error('Join token has expired.');
        }

        const node = this.nodes.get(entry.nodeId);
        if (!node || !node.enrollmentSecret) {
            this.joinTokens.delete(token);
            throw new Error('Node information corrupted or missing.');
        }

        // Consume token
        this.joinTokens.delete(token);

        return {
            panelUrl: `http://${this.panelPublicIp}:3001`,
            nodeId: node.id,
            nodeSecret: node.enrollmentSecret
        };
    }

    /**
     * Remove a node from the registry.
     */
    removeNode(id: string): boolean {
        const node = this.nodes.get(id);
        if (!node) return false;

        this.nodes.delete(id);
        this.saveNow();

        auditService.log('SYSTEM', 'SYSTEM_SETTINGS_UPDATE', id, {
            action: 'NODE_REMOVED',
            nodeName: node.name
        });

        logger.info(`[NodeRegistry] Removed node "${node.name}" (${id})`);
        this.emit('status', { nodeId: id, status: NodeStatus.REMOVED, node });
        return true;
    }

    /**
     * Pre-enroll a node for the Wizard flow.
     * Host/Port are unknown until the Agent connects.
     */
    preEnroll(name: string): { node: NodeInfo, secret: string, token: string } {
        // Name uniqueness check
        for (const existing of this.nodes.values()) {
            if (existing.name.toLowerCase() === name.toLowerCase()) {
                throw new Error(
                    `A node named "${existing.name}" already exists. Choose a different name.`
                );
            }
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        const secret = crypto.randomBytes(32).toString('hex');
        const token = crypto.randomBytes(16).toString('hex'); // Short-lived download token

        // Protocol version (v1.13.0 Resilience)
        let protocolVersion = '0.0.0';
        try {
            const vf = path.join(__dirname, '../../../../version.json');
            if (fs.existsSync(vf)) {
                const versionData = fs.readJSONSync(vf);
                protocolVersion = versionData?.version || (typeof versionData === 'string' ? versionData : '0.0.0');
            }
        } catch (e) { /* use fallback */ }

        const node: NodeInfo = {
            id,
            name: this.sanitizeName(name),
            host: 'pending',
            port: 0,
            status: NodeStatus.ENROLLING,
            protocolVersion,
            enrolledAt: now,
            lastHeartbeat: now,
            labels: [],
            enrollmentSecret: secret,
            enrollmentToken: token
        };

        this.nodes.set(id, node);
        this.saveNow();

        auditService.log('SYSTEM', 'SYSTEM_SETTINGS_UPDATE', id, {
            action: 'NODE_PRE_ENROLLED',
            nodeName: name
        });

        logger.info(`[NodeRegistry] Pre-enrolled node "${name}" (${id})`);
        this.emit('status', { nodeId: id, status: node.status, node });
        return { node, secret, token };
    }

    /**
     * Verify an enrollment secret for a node.
     */
    verifySecret(nodeId: string, secret: string): boolean {
        const node = this.nodes.get(nodeId);
        if (!node || !node.enrollmentSecret) return false;
        return node.enrollmentSecret === secret;
    }

    /**
     * Verify a short-lived download token.
     */
    verifyDownloadToken(nodeId: string, token: string): boolean {
        const node = this.nodes.get(nodeId);
        if (!node || !node.enrollmentToken) return false;
        
        const isValid = node.enrollmentToken === token;
        
        // Consume token after use? For now, we keep it till paired
        return isValid;
    }

    /**
     * Remove a node from the registry.
     */
    remove(nodeId: string): boolean {
        const node = this.nodes.get(nodeId);
        if (!node) return false;

        this.nodes.delete(nodeId);
        this.saveNow(); // Critical mutation

        auditService.log('SYSTEM', 'SYSTEM_SETTINGS_UPDATE', nodeId, {
            action: 'NODE_REMOVED',
            nodeName: node.name
        });

        logger.info(`[NodeRegistry] Removed node "${node.name}" (${nodeId})`);
        return true;
    }

    /**
     * Manually inject a node (Used for Recovery or E2E Testing)
     */
    injectNode(node: NodeInfo): void {
        this.nodes.set(node.id, node);
        this.saveNow();
    }

    /**
     * Update node address details on connection.
     * Used when a pre-enrolled node comes online.
     */
    updateNodeAddress(nodeId: string, host: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        // Only update if changed or pending
        if (node.host !== host || node.host === 'pending') {
            node.host = this.sanitizeHost(host);
            this.dirty = true;
            this.saveNow(); // Save this change
            logger.info(`[NodeRegistry] Updated address for node "${node.name}" (${nodeId}) to ${host}`);
        }
    }

    /**
     * Update node capabilities (Java, Docker, etc.)
     */
    updateCapabilities(nodeId: string, caps: NodeCapabilities): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        // Check if actually changed to avoid spamming saves?
        // For now, just save.
        node.capabilities = caps;
        this.dirty = true;
        this.saveNow(); // Save checks dirty flag anyway (or we can debounce)
        logger.info(`[NodeRegistry] Updated capabilities for node "${node.name}" (${nodeId})`);
    }

    // ── Heartbeat & Status ──

    /**
     * Called when a node agent sends a heartbeat.
     * Uses debounced save to prevent disk thrashing.
     */
    heartbeat(nodeId: string, health?: NodeInfo['health'], signature?: string, nonce?: string): boolean {
        const node = this.nodes.get(nodeId);
        if (!node) return false;

        // ── SECURITY CHALLENGE VERIFICATION ──
        // v1.15.0: Nodes must sign the heartbeat using their enrollmentSecret
        if (nodeId !== 'local' && node.enrollmentSecret) {
            if (!signature || !nonce) {
                logger.warn(`[NodeRegistry] Node "${node.name}" (${nodeId}) sent unsigned heartbeat. Rejecting.`);
                return false;
            }

            if (!this.verifyHeartbeatSignature(node, signature, nonce)) {
                logger.error(`[NodeRegistry] 🚨 SECURITY ALERT: Node "${node.name}" (${nodeId}) failed signature challenge! FORCING OFFLINE.`);
                node.status = NodeStatus.OFFLINE;
                this.emit('status', { nodeId, status: node.status, node });
                return false;
            }
        }

        node.lastHeartbeat = Date.now();
        if (health) node.health = health;

        // 1. Determine Status Based on Health Metrics
        const newStatus = this.calculateNodeStatus(node, health);

        // 2. Transition Back if Healthy
        if (node.status !== newStatus) {
            // Only transition if not in a PROTECTED state (RECOVERING or ENROLLING), unless degraded.
            const isRecovering = node.status === NodeStatus.RECOVERING;
            const isEnrolling = node.status === NodeStatus.ENROLLING;

            if ((!isRecovering && !isEnrolling) || newStatus === NodeStatus.DEGRADED) {
                node.status = newStatus;
                this.emit('status', { nodeId, status: node.status, node });
            }
        }
        
        this.scheduleSave(); // Debounced write
        return true;
    }

    /**
     * Helper to compute node status based on memory/CPU heuristics.
     */
    private calculateNodeStatus(node: NodeInfo, health?: NodeInfo['health']): NodeStatus {
        if (!health) return NodeStatus.ONLINE;
        
        const memPercent = (health.memoryUsed / health.memoryTotal) * 100;
        const isCpuStressed = health.cpu > 90;
        const isMemStressed = memPercent > 95;

        if (isCpuStressed || isMemStressed) {
            if (node.status !== NodeStatus.DEGRADED) {
                logger.warn(`[NodeRegistry] Node "${node.name}" (${node.id}) is DEGRADED: ${isCpuStressed ? 'CPU Stressed' : ''} ${isMemStressed ? 'RAM Stressed' : ''}`);
            }
            return NodeStatus.DEGRADED;
        }

        return NodeStatus.ONLINE;
    }

    /**
     * Mark stale nodes as OFFLINE (no heartbeat within threshold).
     */
    private sweepStaleNodes(): void {
        const now = Date.now();
        const settings = systemSettingsService.getSettings();
        const threshold = settings?.app?.distributedNodes?.nodeHeartbeatThresholdMs || 300000; // Default 5 min
        let changed = false;

        for (const [id, node] of this.nodes.entries()) {
            // Local node is exempt from heartbeat timeouts (hardening)
            if (id === 'local') continue;

            if (node.status === NodeStatus.ONLINE && now - node.lastHeartbeat > threshold) {
                logger.warn(`[NodeRegistry] Node "${node.name}" (${id}) timed out. Marking OFFLINE.`);
                node.status = NodeStatus.OFFLINE;
                this.emit('status', { nodeId: id, status: node.status, node });
                changed = true;
            }
        }
        if (changed) this.scheduleSave();
        this.sweepJoinTokens();
    }

    /**
     * Remove expired join tokens and abandoned "pending" node entries.
     */
    private sweepJoinTokens(): void {
        const now = Date.now();
        let changed = false;

        // 1. Cleanup expired join tokens
        for (const [token, entry] of this.joinTokens.entries()) {
            if (now > entry.expires) {
                this.joinTokens.delete(token);
            }
        }

        // 2. Cleanup "pending" nodes that haven't paired within 15 mins
        for (const [id, node] of this.nodes.entries()) {
            if (node.status === NodeStatus.ENROLLING && node.host === 'pending') {
                const age = now - node.enrolledAt;
                if (age > 15 * 60 * 1000) {
                    logger.warn(`[NodeRegistry] Purging abandoned node enrollment: ${node.name} (${id})`);
                    this.nodes.delete(id);
                    changed = true;
                }
            }
        }

        if (changed) this.scheduleSave();
    }
    
    /**
     * Manually update the status of a node.
     */
    updateStatus(nodeId: string, status: NodeStatus): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        
        if (node.status !== status) {
            node.status = status;
            this.dirty = true;
            this.scheduleSave();
            this.emit('status', { nodeId, status, node });
        }
    }

    /**
     * Get the enrollment secret for the Local Node.
     * Used by the backend to spawn the embedded agent.
     */
    getLocalNodeSecret(): string | undefined {
        const node = this.nodes.get('local');
        return node?.enrollmentSecret;
    }

    // ── Queries ──

    getNode(nodeId: string): NodeInfo | undefined {
        if (!nodeId) return undefined;
        const normalizedId = nodeId.trim().toLowerCase();
        
        // Resilience: If "local" is requested but missing, enroll it on-the-fly
        if (normalizedId === 'local' && !this.nodes.has('local')) {
            logger.warn('[NodeRegistry] "local" node requested but missing. Re-enrolling on-the-fly.');
            this.enrollLocalDefault();
        }

        const node = this.nodes.get(normalizedId);

        // Hardening: Local node status is always ONLINE when requested 
        // (Host is obviously running, heartbeats might be delayed in debug/E2E)
        if (node && normalizedId === 'local' && node.status !== NodeStatus.ONLINE) {
            node.status = NodeStatus.ONLINE;
        }

        return node;
    }

    getAllNodes(): NodeInfo[] {
        return Array.from(this.nodes.values()).map(node => {
            if (node.id === 'local' && node.status !== NodeStatus.ONLINE) {
                node.status = NodeStatus.ONLINE;
            }
            return node;
        });
    }

    getOnlineNodes(): NodeInfo[] {
        const nodes = this.getAllNodes();
        return nodes.filter(n => n.status === NodeStatus.ONLINE);
    }

    getNodeCount(): number {
        return this.nodes.size;
    }

    /**
     * Start the heartbeat sweep interval.
     * Checks for stale nodes every 30 seconds.
     */
    startHeartbeatSweep(): void {
        if (this.heartbeatInterval) return; // Already running
        this.heartbeatInterval = setInterval(() => {
            this.sweepStaleNodes();
        }, 30000);
        logger.info('[NodeRegistry] Heartbeat sweep started (30s interval).');
    }

    stopHeartbeatSweep(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // ── Input Sanitization ──

    // ── SECURITY HELPERS ──

    /**
     * Generates a 32-byte randomized nonce for the next heartbeat challenge.
     */
    public generateNextNonce(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Verifies that the heartbeat was signed with the node's enrollment secret.
     */
    private verifyHeartbeatSignature(node: NodeInfo, signature: string, nonce: string): boolean {
        if (!node.enrollmentSecret) return false;

        const expected = crypto.createHmac('sha256', node.enrollmentSecret)
            .update(nonce)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expected, 'hex')
        );
    }

    private sanitizeName(name: string): string {
        return (name || '')
            .trim()
            .substring(0, 64)
            .replace(/[<>"'`]/g, '');
    }

    private sanitizeHost(host: string): string {
        return (host || '')
            .trim()
            .toLowerCase()
            .substring(0, 255)
            .replace(/[^a-z0-9.\-:]/g, '');
    }
}

export const nodeRegistryService = new NodeRegistryService();
