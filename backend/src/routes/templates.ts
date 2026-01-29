import express from 'express';
import { templateService } from '../services/servers/TemplateService';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

// Get all available templates
router.get('/', verifyToken, (req, res) => {
    res.json(templateService.getTemplates());
});

// Install a template
router.post('/install', verifyToken, async (req, res) => {
    try {
        const { serverId, templateId } = req.body;
        if (!serverId || !templateId) {
            return res.status(400).json({ error: 'Missing serverId or templateId' });
        }
        await templateService.installTemplate(serverId, templateId);
        res.json({ success: true });
    } catch (e: any) {
        console.error('Template install failed:', e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
