import express from 'express';
import { importService } from './ImportService';
import { verifyToken, requireRole } from '../../middleware/authMiddleware';
import { auditService } from '../system/AuditService';
import { logger } from '../../utils/logger';

const router = express.Router();

/**
 * @route POST /api/system/import/analyze
 * @desc Analyze a folder or archive before import
 */
router.post('/analyze', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { path: absolutePath, zipPath } = req.body;
    
    try {
        if (zipPath) {
            const analysis = await importService.analyzeArchive(zipPath);
            return res.json(analysis);
        } else if (absolutePath) {
            const analysis = await importService.analyzeFolder(absolutePath);
            return res.json(analysis);
        } else {
            return res.status(400).json({ error: 'Either path or zipPath is required' });
        }
    } catch (e: any) {
        logger.error(`[ImportRoute] Analysis failed: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

/**
 * @route POST /api/system/import/execute
 * @desc Finalize server import
 */
router.post('/execute', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { name, path: absolutePath, zipPath, configOverrides } = req.body;

    try {
        let server;
        if (zipPath) {
            server = await importService.importArchive(name, zipPath, configOverrides);
        } else if (absolutePath) {
            server = await importService.importLocal(name, absolutePath, configOverrides);
        } else {
            return res.status(400).json({ error: 'Either path or zipPath is required' });
        }

        auditService.log(req.user.id, 'SERVER_IMPORT', 'system', { name, path: absolutePath || zipPath });
        res.json(server);
    } catch (e: any) {
        logger.error(`[ImportRoute] Execution failed: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

/**
 * @route POST /api/system/import/undo/:id
 * @desc Rollback a recent import
 */
router.post('/undo/:id', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { id } = req.params;
    
    try {
        await importService.rollbackImport(id);
        auditService.log(req.user.id, 'SERVER_IMPORT_UNDO', 'system', { serverId: id });
        res.json({ success: true });
    } catch (e: any) {
        logger.error(`[ImportRoute] Undo failed: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

export default router;
