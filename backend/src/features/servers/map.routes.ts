import { Router } from 'express';
import { mapService } from './MapService';
import { verifyToken, requirePermission } from '../../middleware/authMiddleware';
import { auditService } from '../system/AuditService';

const router = Router({ mergeParams: true });

// GET /api/servers/:id/map/status -> /status
router.get('/status', verifyToken, requirePermission('server.map.view'), async (req, res) => {
    try {
        const status = await mapService.getMapStatus(req.params.id);
        res.json(status);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/servers/:id/map/verify -> /verify
router.post('/verify', verifyToken, requirePermission('server.map.manage'), async (req, res) => {
    try {
        const result = await mapService.verifyHealth(req.params.id);
        res.json(result);
        auditService.log(req.user.id, 'MAP_VERIFY', req.params.id);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/servers/:id/map/install -> /install
router.post('/install', verifyToken, requirePermission('server.map.manage'), async (req, res) => {
    try {
        const result = await mapService.installDynmap(req.params.id);
        res.json(result);
        auditService.log(req.user.id, 'MAP_INSTALL', req.params.id);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/servers/:id/map/render -> /render
router.post('/render', verifyToken, requirePermission('server.map.manage'), async (req, res) => {
    try {
        const { mode, radius } = req.body;
        const result = await mapService.renderWorld(req.params.id, mode, radius);
        res.json(result);
        auditService.log(req.user.id, 'MAP_RENDER', req.params.id, { mode, radius });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
