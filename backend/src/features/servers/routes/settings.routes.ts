import express from 'express';
import { logger } from '../../../utils/logger';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { getServer, updateServer, resetSftpPassword, getServerPorts, assignServerPort, rotateServerPort } from '../ServerService';
import { serverConfigService } from '../ServerConfigService';
import { automaticRepairService } from '../../diagnosis/AutomaticRepairService';
import { invalidateDiagnosisCache } from '../ServerService';
import { auditService } from '../../system/AuditService';

const router = express.Router({ mergeParams: true });

// Apply Automatic Repair (Manual Trigger)
router.post('/heal', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params as { id: string };
    const { type, payload } = req.body;
    
    if (!type) {
        return res.status(400).json({ error: 'Fix type is required.' });
    }

    try {
        await automaticRepairService.executeFix(id, type, payload || {});
        invalidateDiagnosisCache(id);
        res.json({ success: true, message: `Successfully applied repair: ${type}` });
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_REPAIR', id, { type, payload }, req.ip);
        }
    } catch (e: any) {
        logger.error(`[Servers] Manual fix failed for ${id}: ${e}`);
        res.status(500).json({ error: e.message || 'Failed to apply automatic fix.' });
    }
});

// Reset Stability/Health Status
router.post('/health/reset', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    try {
        automaticRepairService.resetStabilityMarker(id);
        res.json({ success: true, message: 'Stability marker reset successfully.' });
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_REPAIR_RESET', id, undefined, req.ip);
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Update Server Config
router.patch('/', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    try {
        const updatedServer = await updateServer(id, updates);
        res.json(updatedServer);

        if (req.user) {
            auditService.log(req.user.id, 'SERVER_UPDATE', id, { updates: Object.keys(updates) }, req.ip);
        }
    } catch (e: any) {
        if (e.message === 'Server not found') return res.status(404).json({ error: 'Server not found' });
        res.status(500).json({ error: e.message });
    }
});

// Reset SFTP Password
router.post('/sftp/reset', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await resetSftpPassword(id);
        res.json(result);
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_UPDATE', id, { detail: 'SFTP Password Reset' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get Server Port Mappings
router.get('/ports', verifyToken, requirePermission('server.view'), async (req, res) => {
    const { id } = req.params;
    try {
        const ports = getServerPorts(id);
        res.json(ports);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Allocate Additional Port
router.post('/ports', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    try {
        const newPort = await assignServerPort(id);
        res.json(newPort);
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_UPDATE', id, { detail: 'Allocated additional port', port: newPort.port });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Rotate Additional Port
router.patch('/ports/:portId/rotate', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id, portId } = req.params;
    try {
        const updatedPort = await rotateServerPort(id, portId);
        res.json(updatedPort);
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_UPDATE', id, { detail: 'Rotated additional port', portId, newPort: updatedPort.port });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Check Configuration Drift
router.get('/config/check', verifyToken, async (req, res) => {
    const { id } = req.params as { id: string };
    try {
        const server = getServer(id);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        
        const report = await serverConfigService.verifyConfig(server);
        res.json(report);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Force Sync Configuration to Disk
router.post('/config/sync', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    try {
        const server = getServer(id);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        
        await serverConfigService.enforceConfig(server);
        await updateServer(id, { lastSyncTime: Date.now() });
        
        res.json({ success: true, message: 'Configuration enforced on disk successfully' });
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_UPDATE', id, { detail: 'Forced configuration sync' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
