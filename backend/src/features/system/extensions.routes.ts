import express from 'express';
import { webhookService } from '../integrations/WebhookService';
import { verifyToken } from '../../middleware/authMiddleware';

const router = express.Router();

// --- Webhooks ---

// Get webhooks for a specific server
router.get('/servers/:serverId', verifyToken, (req, res) => {
    res.json(webhookService.getWebhooksByServer(req.params.serverId));
});

// Create webhook for a specific server
router.post('/servers/:serverId', verifyToken, async (req, res) => {
    try {
        const config = req.body;
        if (!config.url || !config.name || !config.triggers) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Ensure serverId is attached
        config.serverId = req.params.serverId;

        const newWebhook = await webhookService.addWebhook(config);
        res.json(newWebhook);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', verifyToken, async (req, res) => {
    try {
        await webhookService.updateWebhook(req.params.id, req.body);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', verifyToken, async (req, res) => {
    try {
        await webhookService.removeWebhook(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:id/test', verifyToken, async (req, res) => {
    try {
        await webhookService.testWebhook(req.params.id);
        res.json({ success: true, status: 200 });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
