import express from 'express';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { auditService } from '../../system/AuditService';

import { databaseService } from '../DatabaseService';

const router = express.Router({ mergeParams: true });

router.use(verifyToken);

// Get Server Databases
router.get('/', requirePermission('server.view'), async (req, res) => {
    const { id } = req.params as { id: string };
    try {
        const databases = await databaseService.getDatabases(id);
        res.json(databases);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Provision New Database
router.post('/', requirePermission('server.databases.manage'), async (req, res) => {
    const { id } = req.params as { id: string };
    try {
        const newDb = await databaseService.createDatabase(id, req.body);
        res.json(newDb);
        if (req.user) auditService.log(req.user.id, 'SYSTEM_SETTINGS_UPDATE', id, { detail: 'Provisioned database', name: newDb.name });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Database
router.delete('/:dbId', requirePermission('server.databases.manage'), async (req, res) => {
    const { id, dbId } = req.params as { id: string, dbId: string };
    try {
        await databaseService.deleteDatabase(id, dbId);
        res.json({ success: true });
        if (req.user) auditService.log(req.user.id, 'SYSTEM_SETTINGS_UPDATE', id, { detail: 'Deleted database', dbId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Rotate Database Password
router.post('/:dbId/rotate', requirePermission('server.databases.manage'), async (req, res) => {
    const { id, dbId } = req.params as { id: string, dbId: string };
    try {
        const result = await databaseService.rotateDatabasePassword(id, dbId);
        res.json(result);
        if (req.user) auditService.log(req.user.id, 'SYSTEM_SETTINGS_UPDATE', id, { detail: 'Rotated database password', dbId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
