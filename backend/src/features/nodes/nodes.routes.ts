import { Router } from 'express';
import { nodeRegistryService } from './NodeRegistryService';
import { nodeSchedulerService } from './NodeSchedulerService';
import { systemSettingsService } from '../system/SystemSettingsService';
import { verifyToken, requireRole } from '../../middleware/authMiddleware';
import { nodeEnrollmentService } from './NodeEnrollmentService';
import { backupService } from '../backups/BackupService';
import { ValidationUtils } from '../../utils/ValidationUtils';

const router = Router();

/**
 * Middleware: Ensure distributed nodes feature is enabled.
 */
const requireDistributedNodes = (req: any, res: any, next: any) => {
    // E2E Test Bypass
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-bypass'] === 'true') {
        return next();
    }

    const settings = systemSettingsService.getSettings();
    if (!settings.app?.distributedNodes?.enabled) {
        return res.status(403).json({
            error: 'Distributed Nodes is disabled.',
            hint: 'Enable it in Settings → Distributed Nodes to manage remote nodes.'
        });
    }
    next();
};

/**
 * GET /api/nodes — List all enrolled nodes
 */
router.get('/', verifyToken, requireRole(['OWNER', 'ADMIN']), requireDistributedNodes, (req, res) => {
    try {
        const nodes = nodeRegistryService.getAllNodes();
        res.json({ nodes, total: nodes.length });
    } catch (error) {
        logger.error(`[Nodes] Failed to list nodes: ${error}`);
        res.status(500).json({ error: 'Failed to list nodes' });
    }
});

/**
 * GET /api/nodes/recommend — Get scheduler recommendation for the best node
 * Query params: ram (number, GB) — RAM requirement for the server
 */
router.get('/recommend', verifyToken, requireRole(['OWNER', 'ADMIN']), requireDistributedNodes, (req, res) => {
    try {
        const ramGB = parseFloat(req.query.ram as string) || 2;
        const result = nodeSchedulerService.findBestNode(ramGB);
        res.json({
            recommendation: result.selectedNode ? {
                nodeId: result.selectedNode.id,
                nodeName: result.selectedNode.name,
                score: result.candidates.find(c => c.node.id === result.selectedNode!.id)?.score || 0
            } : null,
            candidates: result.candidates.map(c => ({
                nodeId: c.node.id,
                nodeName: c.node.name,
                score: c.score,
                reasons: c.reasons
            })),
            reason: result.reason
        });
    } catch (error) {
        logger.error(`[Nodes] Failed to get recommendation: ${error}`);
        res.status(500).json({ error: 'Failed to get scheduler recommendation' });
    }
});

import rateLimit from 'express-rate-limit';

const nodeEnrollLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many enrollment attempts, please try again later' }
});

/**
 * POST /api/nodes/enroll — Enroll a new node
 */
router.post('/enroll', verifyToken, nodeEnrollLimiter, requireRole(['OWNER']), requireDistributedNodes, (req, res) => {
    try {
        const { name, host, port, labels } = req.body;

        if (!name || !host || !port) {
            return res.status(400).json({
                error: 'Missing required fields.',
                required: ['name', 'host', 'port']
            });
        }

        const validHost = ValidationUtils.validateHost(host);
        const validPort = ValidationUtils.validatePort(port);
        const validName = ValidationUtils.validateId(name, 'Node Name');

        const node = nodeRegistryService.enroll(validName, validHost, validPort, labels || []);
        
        auditService.log(req.user.id, 'SYSTEM_SETTINGS_UPDATE', node.id, {
            action: 'NODE_ENROLL',
            name: node.name,
            host: node.host
        }, req.ip);

        res.status(201).json(node);
    } catch (error: any) {
        // Service throws descriptive errors for duplicates, invalid input, etc.
        const message = error?.message || 'Failed to enroll node';
        const isDuplicate = message.includes('already enrolled') || message.includes('already exists');
        const isValidation = message.includes('required') || message.includes('Invalid');
        
        if (isDuplicate) {
            return res.status(409).json({ error: message });
        }
        if (isValidation) {
            return res.status(400).json({ error: message });
        }
        
        logger.error(`[Nodes] Failed to enroll node: ${error}`);
        res.status(500).json({ error: 'Failed to enroll node' });
    }

});

/**
 * POST /api/nodes/enroll-wizard — Pre-enroll a node for Wizard flow (Zero Knowledge)
 */
router.post('/enroll-wizard', verifyToken, requireRole(['OWNER']), requireDistributedNodes, (req, res) => {
    try {
        const { name, mode } = req.body;
        const nodeName = name || (mode === 'lan' ? 'Local Node' : 'Remote VPS');
        
        const result = nodeRegistryService.preEnroll(nodeName);
        res.status(201).json({
            id: result.node.id,
            secret: result.secret,
            token: result.token
        });
    } catch (error: any) {
        if (error.message?.includes('already exists')) {
            return res.status(409).json({ error: error.message });
        }
        logger.error(`[Nodes] Failed to pre-enroll node: ${error}`);
        res.status(500).json({ error: 'Failed to generate enrollment identity' });
    }
});

/**
 * GET /api/nodes/join-command/:id — Generate the one-click join command
 */
router.get('/join-command/:id', verifyToken, requireRole(['OWNER']), requireDistributedNodes, (req, res) => {
    try {
        const token = nodeRegistryService.createJoinToken(req.params.id);
        const protocol = req.secure ? 'https' : 'http';
        const panelUrl = `${protocol}://${req.get('host')}`;
        
        // Return both the raw components and the formatted command
        res.json({
            token,
            panelUrl,
            command: `./run_CraftCommand.sh --join ${panelUrl} ${token}`,
            powershell: `.\\run_CraftCommand.bat --join ${panelUrl} ${token}`
        });
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

/**
 * GET /api/nodes/join-config/:token — Public endpoint for the join script to fetch config
 * No Auth required (guarded by short-lived token)
 */
router.get('/join-config/:token', (req, res) => {
    try {
        const config = nodeRegistryService.consumeJoinToken(req.params.token);
        res.json(config);
    } catch (error: any) {
        res.status(401).json({ error: error.message });
    }
});

/**
 * GET /api/nodes/enroll-wizard/download/:id — Download pre-configured agent ZIP
 */
router.get('/enroll-wizard/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { token } = req.query;

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Download token is required.' });
        }

        // Verify token
        if (!nodeRegistryService.verifyDownloadToken(id, token)) {
            return res.status(401).json({ error: 'Invalid or expired download token.' });
        }

        const node = nodeRegistryService.getNode(id);
        if (!node) return res.status(404).json({ error: 'Node not found.' });

        // Determine Panel URL (used by agent to connect back)
        const protocol = req.secure ? 'https' : 'http';
        const panelUrl = `${protocol}://${req.get('host')}`;

        logger.info(`[Nodes] Generating enrollment package for node "${node.name}" (${id})`);
        
        const zipStream = await nodeEnrollmentService.createEnrollmentPackage(id, token, panelUrl);
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=craftcommand-agent-${node.name.replace(/\s+/g, '-')}.zip`);
        
        zipStream.pipe(res);
    } catch (error: any) {
        logger.error(`[Nodes] Failed to generate enrollment package: ${error}`);
        res.status(500).json({ error: error.message || 'Failed to generate enrollment package' });
    }
});

/**
 * DELETE /api/nodes/:id — Remove a node from the registry
 */
router.delete('/:id', verifyToken, requireRole(['OWNER']), requireDistributedNodes, (req, res) => {
    try {
        const success = nodeRegistryService.remove(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Node not found.' });
        }
        res.json({ message: 'Node removed successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove node' });
    }
});

/**
 * GET /api/nodes/:id — Get a specific node
 */
router.get('/:id', verifyToken, requireRole(['OWNER', 'ADMIN']), requireDistributedNodes, (req, res) => {
    try {
        const node = nodeRegistryService.getNode(req.params.id);
        if (!node) {
            return res.status(404).json({ error: 'Node not found.' });
        }
        res.json(node);
    } catch (error) {
        logger.error(`[Nodes] Failed to get node: ${error}`);
        res.status(500).json({ error: 'Failed to get node' });
    }
});

/**
 * GET /api/nodes/:id/health — Get node health metrics
 */
router.get('/:id/health', verifyToken, requireRole(['OWNER', 'ADMIN']), requireDistributedNodes, (req, res) => {
    try {
        const node = nodeRegistryService.getNode(req.params.id);
        if (!node) {
            return res.status(404).json({ error: 'Node not found.' });
        }
        if (!node.health) {
            return res.json({
                message: 'No health data available. Node may not have sent a heartbeat yet.',
                status: node.status
            });
        }
        res.json({ status: node.status, health: node.health });
    } catch (error) {
        logger.error(`[Nodes] Failed to get node health: ${error}`);
        res.status(500).json({ error: 'Failed to get node health' });
    }
});

/**
 * POST /api/nodes/:id/fix — Trigger a capability fix on the agent
 */
router.post('/:id/fix', verifyToken, requireRole(['OWNER']), requireDistributedNodes, async (req, res) => {
    try {
        const { id } = req.params;
        const { capability } = req.body;

        if (!capability) {
            return res.status(400).json({ error: 'Capability name is required.' });
        }

        const node = nodeRegistryService.getNode(id);
        if (!node) {
            return res.status(404).json({ error: 'Node not found.' });
        }

        if (node.status !== 'ONLINE') {
            return res.status(409).json({ error: 'Node must be ONLINE to apply fixes.' });
        }

        logger.info(`[Nodes] Triggering fix for "${capability}" on node "${node.name}" (${id})`);
        
        // Import sendToAgent dynamically to avoid potential circular dependency issues with routes
        const { sendToAgent } = await import('./NodeAgentHandler');
        
        const response = await sendToAgent(id, 'agent:fix', { capability });
        res.json(response);

        auditService.log(req.user.id, 'SYSTEM_SETTINGS_UPDATE', id, {
            action: 'NODE_CAPABILITY_FIX',
            capability,
            nodeName: node.name
        }, req.ip);

    } catch (error: any) {
        logger.error(`[Nodes] Failed to trigger fix: ${error}`);
        res.status(500).json({ error: error.message || 'Failed to trigger fix' });
    }
});

/**
 * POST /api/nodes/:id/shutdown — Remote shutdown of a node agent
 */
router.post('/:id/shutdown', verifyToken, requireRole(['OWNER']), requireDistributedNodes, async (req, res) => {
    try {
        const { id } = req.params;

        const node = nodeRegistryService.getNode(id);
        if (!node) {
            return res.status(404).json({ error: 'Node not found.' });
        }

        // Hardening: Prevent shutting down the "local" node if it's the host
        if (id === 'local') {
             return res.status(403).json({ error: 'Cannot shutdown the Local Node as it is part of the host system.' });
        }

        if (node.status !== 'ONLINE') {
            return res.status(409).json({ error: 'Node must be ONLINE to be shutdown.' });
        }

        logger.info(`[Nodes] Triggering SHUTDOWN for node "${node.name}" (${id})`);
        
        // Import sendToAgent dynamically
        const { sendToAgent } = await import('./NodeAgentHandler');
        
        await sendToAgent(id, 'agent:shutdown', {});
        
        res.json({ message: 'Shutdown command sent to agent.' });

        auditService.log(req.user.id, 'SYSTEM_SETTINGS_UPDATE', id, {
            action: 'NODE_SHUTDOWN',
            nodeName: node.name
        }, req.ip);

    } catch (error: any) {
        logger.error(`[Nodes] Failed to shutdown node: ${error}`);
        res.status(500).json({ error: error.message || 'Failed to shutdown node' });
    }
});

/**
 * POST /api/nodes/:id/backups/intake — Intake mirrored backup from agent (Phase 11)
 */
router.post('/:id/backups/intake', async (req, res) => {
    try {
        const { id } = req.params;
        const nodeSecret = req.headers['x-node-secret'] as string;
        const serverId = req.headers['x-server-id'] as string;
        const backupId = req.headers['x-backup-id'] as string;

        if (!nodeSecret || !serverId || !backupId) {
            return res.status(400).json({ error: 'Missing required headers (x-node-secret, x-server-id, x-backup-id).' });
        }

        // Verify node exists and secret matches
        const node = nodeRegistryService.getNode(id);
        if (!node) return res.status(404).json({ error: 'Node not found.' });

        if (!nodeRegistryService.verifySecret(id, nodeSecret)) {
            // Audit failed intake attempt
            auditService.log('SYSTEM', 'PERMISSION_DENIED', serverId, { 
                action: 'BACKUP_INTAKE_FAIL', 
                reason: 'INVALID_SECRET',
                nodeId: id
            }, req.ip);
            return res.status(401).json({ error: 'Invalid node secret.' });
        }

        // --- Security Hardening: Node-Server Cross-Validation (Phase 8) ---
        const { serverRepository } = require('../../storage/ServerRepository');
        const server = serverRepository.findById(serverId);
        
        if (!server) {
            return res.status(404).json({ error: 'Target server not found.' });
        }

        // Logic: A node can only intake backups for servers it is actually hosting.
        // If server.nodeId is 'local' or undefined, it belongs to the host.
        const serverNodeId = server.nodeId || 'local';
        const reportingNodeId = id || 'local';

        if (serverNodeId !== reportingNodeId) {
            logger.error(`[Security] Node ${id} attempted to intake backup for server ${serverId} which belongs to node ${serverNodeId}!`);
            auditService.log('SYSTEM', 'PERMISSION_DENIED', serverId, {
                action: 'BACKUP_INTAKE_FAIL',
                reason: 'NODE_MISMATCH',
                expected: serverNodeId,
                actual: reportingNodeId
            }, req.ip);
            return res.status(403).json({ error: 'Access denied: Server is not assigned to this node.' });
        }

        // Store the mirrored backup
        await backupService.storeMirroredBackup(id, serverId, backupId, req);

        res.json({ ok: true, message: 'Backup mirrored successfully.' });

    } catch (error: any) {
        logger.error(`[Nodes] Mirror intake failed: ${error}`);
        res.status(500).json({ error: error.message || 'Mirror intake failed' });
    }
});

import { logger } from '../../utils/logger';
import { auditService } from '../system/AuditService';

export default router;

