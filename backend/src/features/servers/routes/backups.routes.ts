import express from 'express';
import { logger } from '../../../utils/logger';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { getServer } from '../ServerService';
import { processManager } from '../../processes/ProcessManager';
import { serverConfigService } from '../ServerConfigService';
import { auditService } from '../../system/AuditService';
import { startServer } from '../ServerService';
import { backupService } from '../../backups/BackupService';

const router = express.Router({ mergeParams: true });

// Protect all backup routes
router.use(verifyToken);
// router.use(requirePermission('server.settings')); // Assuming backups fall under settings or specific permission

// Toggle Lock
router.post('/:backupId/lock', async (req, res) => {
    const { id, backupId } = req.params as { id: string, backupId: string };
    try {
        const isLocked = await backupService.toggleLock(id, backupId);
        res.json({ success: true, locked: isLocked });
        if (req.user) {
            auditService.log(req.user.id, isLocked ? 'BACKUP_LOCK' : 'BACKUP_UNLOCK', id, { backupId });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create backup
router.post('/', async (req, res) => {
    const { id } = req.params as { id: string };
    const { description, worldOnly } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        if (processManager.isRunning(id)) {
            logger.info(`[Backups] Flushing saves for online server ${id}...`);
            processManager.sendCommand(id, 'save-all');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const backup = await processManager.createBackup(id, server.workingDirectory, description, worldOnly);
        res.json(backup);
        if (req.user) {
            auditService.log(req.user.id, 'BACKUP_CREATE', id, { backupId: backup.id, description, worldOnly });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// List backups
router.get('/', async (req, res) => {
    const { id } = req.params as { id: string };
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        const backups = await backupService.listBackups(id);
        res.json(backups);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Restore backup
router.post('/:backupId/restore', async (req, res) => {
    const { id, backupId } = req.params as { id: string, backupId: string };
    const { worldOnly } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        if (processManager.isRunning(id)) {
            logger.info(`[Backups] Stopping server ${id} for restoration...`);
            processManager.stopServer(id);
            const stopped = await processManager.waitForClose(id, 30000); 
            
            if (!stopped) {
                logger.warn(`[Backups] Server ${id} did not stop gracefully. Force killing to proceed with restore.`);
                processManager.killServer(id);
                await new Promise(resolve => setTimeout(resolve, 1000)); 
            }
        }

        await processManager.restoreBackup(id, server.workingDirectory, backupId, worldOnly);
        
        if (!worldOnly) {
             await serverConfigService.enforceConfig(server);
        }

        await startServer(id);
        res.json({ success: true, message: 'Backup restored successfully' });
        
        if (req.user) {
            auditService.log(req.user.id, 'SERVER_RESTORE', id, { backupId, worldOnly: !!worldOnly });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete backup
router.delete('/:backupId', async (req, res) => {
    const { id, backupId } = req.params as { id: string, backupId: string };
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        await backupService.deleteBackup(id, backupId);
        res.json({ success: true, message: 'Backup deleted' });
        if (req.user) {
            auditService.log(req.user.id, 'BACKUP_DELETE', id, { backupId });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Download backup
router.get('/:backupId/download', async (req, res) => {
    const { id, backupId } = req.params as { id: string, backupId: string };
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        const filePath = await backupService.getBackupPath(id, backupId);
        res.download(filePath);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
