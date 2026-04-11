import express from 'express';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { backupService } from '../../backups/BackupService';

const router = express.Router();

router.use(verifyToken);
router.use(requirePermission('server.settings'));

// List cloud destinations
router.get('/', async (_req, res) => {
    try {
        const destinations = await backupService.getCloudDestinations();
        res.json(destinations);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Add cloud destination
router.post('/', async (req, res) => {
    try {
        const destinations = await backupService.addCloudDestination(req.body);
        res.json(destinations);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Test cloud destination
router.post('/test', async (req, res) => {
    try {
        const result = await backupService.testCloudDestination(req.body);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Remove cloud destination
router.delete('/:name', async (req, res) => {
    try {
        const remaining = await backupService.removeCloudDestination(req.params.name);
        res.json(remaining);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
