import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware';
import { systemSettingsService } from './SystemSettingsService';

const router = Router();

// GET /api/settings/global - Get global system settings
router.get('/global', verifyToken, async (req, res) => {
    try {
        const settings = systemSettingsService.getSettings();
        
        // Data Masking for non-ADMIN/OWNER roles
        const userRole = (req as any).user.role;
        if (userRole !== 'OWNER' && userRole !== 'ADMIN') {
            const maskedSettings = JSON.parse(JSON.stringify(settings));
            
            // Mask Discord secrets
            if (maskedSettings.integrations?.discord) {
                if (maskedSettings.integrations.discord.token) maskedSettings.integrations.discord.token = '********';
                if (maskedSettings.integrations.discord.clientSecret) maskedSettings.integrations.discord.clientSecret = '********';
            }
            
            // Mask other potential secrets if they exist
            if (maskedSettings.app?.distributedNodes?.sharedSecret) {
                maskedSettings.app.distributedNodes.sharedSecret = '********';
            }

            return res.json(maskedSettings);
        }

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
