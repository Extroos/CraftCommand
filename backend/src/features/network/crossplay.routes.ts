
import { Router, Request, Response } from 'express';
import { crossPlayService } from './CrossPlayService';

const router = Router();

/**
 * POST /api/crossplay/:serverId/enable
 * One-click cross-play enablement.
 */
router.post('/:serverId/enable', async (req: Request, res: Response) => {
    try {
        const { serverId } = req.params;
        const { bedrockPort } = req.body;
        const result = await crossPlayService.enable(serverId, bedrockPort);
        res.json(result);
    } catch (e: any) {
        console.error('[CrossPlay] Enable failed:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * POST /api/crossplay/:serverId/disable
 * Teardown cross-play.
 */
router.post('/:serverId/disable', async (req: Request, res: Response) => {
    try {
        const { serverId } = req.params;
        const result = await crossPlayService.disable(serverId);
        res.json(result);
    } catch (e: any) {
        console.error('[CrossPlay] Disable failed:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * GET /api/crossplay/:serverId/status
 * Cross-play health check.
 */
router.get('/:serverId/status', async (req: Request, res: Response) => {
    try {
        const { serverId } = req.params;
        const status = await crossPlayService.getStatus(serverId);
        res.json(status);
    } catch (e: any) {
        console.error('[CrossPlay] Status check failed:', e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
