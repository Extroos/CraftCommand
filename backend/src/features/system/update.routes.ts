import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware';
import { updateService } from './UpdateService';
import { logger } from '../../utils/logger';

const router = Router();

// Get Update Status
router.get('/status', verifyToken, (req, res) => {
    res.json(updateService.getStatus());
});

// Check for updates (Manually)
router.post('/check', verifyToken, requireRole(['OWNER']), async (req, res) => {
    try {
        logger.info(`[API] Manual update check requested by ${req.user?.username}`);
        const result = await updateService.checkForUpdates(true);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Start Download & Verify & Prepare
router.post('/download', verifyToken, requireRole(['OWNER']), async (req, res) => {
    const { version } = req.body;
    if (!version) return res.status(400).json({ error: 'Version is required' });

    try {
        const currentStatus = updateService.getStatus();
        if (currentStatus.status !== 'IDLE' && currentStatus.status !== 'ERROR' && currentStatus.status !== 'READY_TO_INSTALL') {
            return res.status(409).json({ error: 'Update already in progress', status: currentStatus });
        }

        logger.info(`[API] Update process started for v${version} by ${req.user?.username}`);
        
        // Start process in background
        updateService.resetStatus(); // Ensure we reset errors
        updateService.downloadUpdate(version).catch(err => {
            logger.error(`[API] Update background process failed: ${err.message}`);
        });

        res.json({ message: 'Update process started', version });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Restart Backend (Triggers Launcher Loop if update plan exists)
router.post('/restart', verifyToken, requireRole(['OWNER']), (req, res) => {
    logger.warn(`[API] Restart requested by ${req.user?.username}`);
    res.json({ message: 'Server restarting...' });
    
    // Give time for response to flush
    setTimeout(() => {
        process.exit(0); 
    }, 1000);
});

export default router;
