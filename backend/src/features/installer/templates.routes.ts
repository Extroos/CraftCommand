import express from 'express';
import { templateService } from './TemplateService';
import { verifyToken, requireRole } from '../../middleware/authMiddleware';

const router = express.Router();

// Get all available templates
router.get('/', verifyToken, (req, res) => {
    res.json(templateService.getTemplates());
});

// Install a template
router.post('/install', verifyToken, async (req, res) => {
    try {
        const { serverId, templateId, options } = req.body;
        if (!serverId || !templateId) {
            return res.status(400).json({ error: 'Missing serverId or templateId' });
        }
        await templateService.installTemplate(serverId, templateId, options);
        res.json({ success: true });
    } catch (e: any) {
        console.error('Template install failed:', e);
        res.status(500).json({ error: e.message });
    }
});

// Create a custom template from an existing server
router.post('/create-from-server', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        const { serverId, name, description } = req.body;
        if (!serverId || !name) {
            return res.status(400).json({ error: 'Missing serverId or name' });
        }
        const template = await templateService.createFromServer(serverId, name, description);
        res.json({ success: true, template });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete a custom template
router.delete('/:id', verifyToken, requireRole(['OWNER', 'ADMIN']), (req, res) => {
    try {
        const deleted = templateService.deleteTemplate(req.params.id);
        res.json({ success: deleted });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
