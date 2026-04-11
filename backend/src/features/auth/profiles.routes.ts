import express from 'express';
import { profileService } from './ProfileService';
import { verifyToken } from '../../middleware/authMiddleware';
import { logger } from '../../utils/logger';

const router = express.Router();

// Export a server profile
router.get('/:id/export', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await profileService.exportProfile(id);
        
        // Set headers to prompt download
        res.setHeader('Content-Disposition', `attachment; filename="${profile.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json"`);
        res.setHeader('Content-Type', 'application/json');
        
        res.json(profile);
    } catch (e: any) {
        logger.error(`Profile export failed: ${e}`);
        res.status(500).json({ error: e.message });
    }
});

// Validate a profile (for import preview)
router.post('/validate', verifyToken, (req, res) => {
    try {
        const profile = req.body;
        const validated = profileService.validateProfile(profile);
        res.json({ valid: true, profile: validated });
    } catch (e: any) {
        res.status(400).json({ valid: false, error: e.message });
    }
});

export default router;
