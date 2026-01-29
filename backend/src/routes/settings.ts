import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/authMiddleware';
import { systemSettingsService } from '../services/system/SystemSettingsService';

const router = Router();

// GET /api/settings/global - Get global system settings
router.get('/global', verifyToken, requireRole(['OWNER']), async (req, res) => {
    try {
        const settings = systemSettingsService.getSettings();
        res.json(settings);
    } catch (error) {
        console.error('Failed to get global settings:', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

// PUT /api/settings/global - Update global system settings
router.put('/global', verifyToken, requireRole(['OWNER']), async (req, res) => {
    try {
        const updatedSettings = systemSettingsService.updateSettings(req.body);
        res.json(updatedSettings);
    } catch (error) {
        console.error('Failed to update global settings:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

export default router;
