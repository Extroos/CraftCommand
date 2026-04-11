import express from 'express';
import { logger } from '../../../utils/logger';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { processManager } from '../../processes/ProcessManager';
import { startServer, stopServer, restartServer } from '../ServerService';
import { AppError } from '../../../utils/AppError';
import { auditService } from '../../system/AuditService';
import { ServerStatus } from '@shared/types';

const router = express.Router({ mergeParams: true });

// Power Routes

// Start Server
router.post('/start', verifyToken, requirePermission('server.start'), async (req, res) => {
    const { id } = req.params;
    const { force } = req.body;
    logger.info(`[Route:Start] Received request for ${id} (force=${!!force})`);
    
    try {
        await startServer(id, !!force);
        res.json({ success: true, status: ServerStatus.STARTING });
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_START', id, { force: !!force }, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
        }
    } catch (e: any) {
        logger.error(`[Server:${id}] Start Route failed: ${e}`);
        if (e instanceof AppError) {
            return res.status(e.statusCode).json({ 
                error: e.message, 
                code: e.errorCode, 
                details: e.details,
                safetyError: !!e.details?.diagnosisId // Map to frontend 'safetyError' flag
            });
        }
        res.status(500).json({ error: e.message });
    }
});

// Stop Server
router.post('/stop', verifyToken, requirePermission('server.stop'), async (req, res) => {
    const { id } = req.params;
    const { force } = req.body;
    
    try {
        await stopServer(id, !!force);
        res.json({ success: true, status: ServerStatus.STOPPING });
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_STOP', id, { force: !!force }, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
        }
    } catch (e: any) {
        logger.error(`[Server:${id}] Stop Route failed: ${e.message} ${e.stack || ''}`);
        if (e.message.includes('Server is initializing')) {
            return res.status(423).json({
                error: 'Startup Protection: Server is initializing.',
                message: e.message,
                softError: true
            });
        }
        if (e.message.includes('already in progress')) {
            return res.status(409).json({
                error: 'Conflict: An operation is already in progress for this server.',
                message: e.message
            });
        }
        res.status(500).json({ error: e.message });
    }
});

// Restart Server
router.post('/restart', verifyToken, requirePermission('server.start'), async (req, res) => {
    const { id } = req.params;
    try {
        await restartServer(id);
        res.json({ success: true, status: ServerStatus.STARTING });
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_RESTART', id, undefined, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Graceful Stop
router.post('/stop/graceful', verifyToken, requirePermission('server.stop'), async (req, res) => {
    const { id } = req.params;
    const { delay } = req.body;
    
    try {
        processManager.gracefulStop(id, delay || 30);
        res.json({ success: true, status: ServerStatus.STOPPING, message: `Graceful shutdown initiated with ${delay || 30}s delay.` });
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_STOP_GRACEFUL', id, { delay: delay || 30 }, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Cancel Graceful Stop
router.post('/stop/cancel', verifyToken, requirePermission('server.stop'), async (req, res) => {
    const { id } = req.params;
    try {
        processManager.cancelGracefulStop(id);
        res.json({ success: true, message: 'Graceful shutdown cancelled.' });
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_STOP_CANCEL', id, undefined, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
