import express from 'express';
import { logger } from '../../utils/logger';
import { verifyToken, requirePermission, optionalVerifyToken } from '../../middleware/authMiddleware';
import { getServers, saveServer, removeServer, cloneServer, getNextAvailablePort } from './ServerService';
import { processManager } from '../processes/ProcessManager';
import { auditService } from '../system/AuditService';
import { ServerStatus } from '@shared/types';
import { importService } from '../installer/ImportService';
import { ValidationUtils } from '../../utils/ValidationUtils';
import { nodeSchedulerService } from '../nodes/NodeSchedulerService';
import { nodeRegistryService } from '../nodes/NodeRegistryService';
import { systemSettingsService } from '../system/SystemSettingsService';

import fs from 'fs-extra';
import path from 'path';
import multer from 'multer';
import { DATA_PATHS } from '../../constants';

// Sub-routers
import mapRouter from './map.routes';
import powerRouter from './routes/power.routes';
import monitorRouter from './routes/monitor.routes';
import settingsRouter from './routes/settings.routes';
import filesRouter from './routes/files.routes';
import installRouter from './routes/install.routes';
import schedulesRouter from './routes/schedules.routes';
import backupsRouter from './routes/backups.routes';
import cloudRouter from './routes/cloud.routes';
import membersRouter from './routes/members.routes';
import databasesRouter from './routes/databases.routes';
import playersRouter from './routes/players.routes';

const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;
const upload = multer({ dest: path.join(path.dirname(DATA_PATHS.SERVERS_ROOT), 'temp_uploads'), limits: { fileSize: MAX_UPLOAD_SIZE } });

const router = express.Router();

router.use('/cloud-destinations', cloudRouter);

router.post('*', verifyToken);
router.put('*', verifyToken);
router.delete('*', verifyToken);
router.patch('*', verifyToken);

const getIconUrl = (server: any) => {
    const iconName = server.software === 'Bedrock' ? 'world_icon.png' : 'server-icon.png';
    const iconPath = path.join(server.workingDirectory, iconName);
    if (fs.existsSync(iconPath)) {
        try {
            const buffer = fs.readFileSync(iconPath);
            return `data:image/png;base64,${buffer.toString('base64')}`;
        } catch (e) {
            logger.error(`[IconHelper] Failed to read icon for ${server.id}: ${e}`);
        }
    }
    return null;
};

router.get('/next-port', verifyToken, async (req, res) => {
    try {
        const base = parseInt(req.query.base as string) || 25565;
        const port = getNextAvailablePort(base);
        res.json({ port });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Import Routes
router.post('/import/local', requirePermission('server.create'), async (req, res) => {
    try {
        const { name, path: absolutePath, config } = req.body;
        if (!name || !absolutePath) return res.status(400).json({ error: 'Name and Path are required.' });
        
        const server = await importService.importLocal(name, absolutePath, config);
        res.json(server);
        if (req.user) auditService.log(req.user.id, 'SERVER_IMPORT_LOCAL', server.id, { name, path: absolutePath }, req.ip);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/import/analyze-local', requirePermission('server.create'), async (req, res) => {
    try {
        const { path: absolutePath } = req.body;
        if (!absolutePath) return res.status(400).json({ error: 'Path is required.' });
        
        const analysis = await importService.analyzeFolder(absolutePath);
        res.json(analysis);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/import/archive', requirePermission('server.create'), upload.single('file'), async (req, res) => {
    try {
        const { name, config } = req.body;
        if (!req.file) return res.status(400).json({ error: 'No archive file uploaded.' });

        const server = await importService.importArchive(name, req.file.path, config ? JSON.parse(config) : {});
        res.json(server);
        if (req.user) auditService.log(req.user.id, 'SERVER_IMPORT_ARCHIVE', server.id, { name }, req.ip);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/import/analyze-archive', requirePermission('server.create'), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No archive file uploaded.' });

        const analysis = await importService.analyzeArchive(req.file.path);
        res.json(analysis);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/', optionalVerifyToken, (req, res) => {
    try {
        const servers = getServers();
        const visibleServers = req.user 
            ? servers 
            : servers.filter((s: any) => s.publicStatus === true);

        const enhanced = visibleServers.map((s: any) => {
            const isRunning = processManager.isRunning(s.id);
            const isStarting = processManager.isStarting(s.id);
            const cached = processManager.getCachedStatus(s.id);
            
            let status = s.status;
            if (isRunning) {
                status = cached?.status || ServerStatus.STARTING;
            } else if (isStarting) {
                status = ServerStatus.STARTING;
            } else if (s.status !== ServerStatus.CRASHED) {
                status = ServerStatus.OFFLINE;
            }

            return {
                ...s,
                ...cached,
                status,
                iconUrl: getIconUrl(s)
            };
        });
        res.json(enhanced);
    } catch (error: any) {
        logger.error(`[ServersRoute] Failed to list servers: ${error}`);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/', requirePermission('server.create'), async (req, res) => {
    const config = req.body;
    
    if (config.nodeId === 'auto') {
        const ramGB = ValidationUtils.validateRam(config.ram || 2);
        const result = nodeSchedulerService.findBestNode(ramGB);
        
        if (!result.selectedNode) {
            const localNode = nodeRegistryService.getNode('local');
            if (localNode) {
                config.nodeId = 'local';
            } else {
                return res.status(409).json({ 
                    error: 'No suitable nodes available for automatic deployment.',
                    reason: result.reason 
                });
            }
        } else {
            config.nodeId = result.selectedNode.id;
        }
    }

    if (!config.nodeId || config.nodeId === '') {
        config.nodeId = 'local';
    }

    let node = nodeRegistryService.getNode(config.nodeId);
    
    if (!node && config.nodeId !== 'local') {
        config.nodeId = 'local';
        node = nodeRegistryService.getNode('local');
    }

    if (!node) {
         return res.status(404).json({ error: 'Selected node not found.' });
    }
    if (node.status !== 'ONLINE') {
         return res.status(409).json({ error: 'Selected node is offline.' });
    }
        
    if (node.health) {
         const ramRequiredGB = config.ram || 2;
         const memoryFreeBytes = node.health.memoryTotal - node.health.memoryUsed;
         const memoryRequiredBytes = ramRequiredGB * 1024 * 1024 * 1024;
         
         if (memoryFreeBytes < memoryRequiredBytes) {
              return res.status(409).json({ 
                  error: `Insufficient memory on node "${node.name}".`,
                  details: `Available: ${Math.round(memoryFreeBytes/1024/1024)}MB, Required: ${ramRequiredGB * 1024}MB`
              });
         }
    }

    const id = `local-${Date.now()}`;
    let dirName = ValidationUtils.validateId(id, 'Server ID');
    if (config.folderName) {
        if (!ValidationUtils.validateFolderName(config.folderName)) {
            return res.status(400).json({ error: 'Folder name must be alphanumeric and cannot be a reserved system name.' });
        }
        dirName = config.folderName;
    }

    const serverDir = path.join(DATA_PATHS.SERVERS_ROOT, dirName);
    
    try {
        await fs.ensureDir(DATA_PATHS.SERVERS_ROOT); 
        await fs.promises.mkdir(serverDir); 
    } catch (e: any) {
        if (e.code === 'EEXIST') {
             return res.status(409).json({ error: `Server folder '${dirName}' already exists.` });
        }
        throw e;
    }
    
    const isBedrock = config.software === 'Bedrock';
    const defaultExecutable = isBedrock ? (process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server') : 'server.jar';
    const defaultCommand = isBedrock ? (process.platform === 'win32' ? 'bedrock_server.exe' : './bedrock_server') : 'server.jar';

    const defaultEngine = systemSettingsService.getSettings()?.app?.defaultExecutionEngine || 'native';
    
    const newServer = {
        ...config,
        id,
        folderName: dirName !== id ? dirName : undefined,
        workingDirectory: serverDir,
        executable: config.executable || defaultExecutable,
        executionCommand: config.executionCommand || defaultCommand,
        executionEngine: config.executionEngine || defaultEngine,
        status: ServerStatus.OFFLINE,
        hasStarted: false
    };
    
    saveServer(newServer);
    
    // Phase 66: Birth Grace Period (v3.2)
    // Notify Repair Service to grant immunity during installation
    const { automaticRepairService } = require('../diagnosis/AutomaticRepairService');
    automaticRepairService.trackCreation(id);

    const { fileWatcherService } = await import('../files/FileWatcherService');
    fileWatcherService.watchServer(id, serverDir);

    if (req.user) auditService.log(req.user.id, 'SERVER_CREATE', id, { name: config.name }, req.ip);

    res.json(newServer);
});

router.delete('/:id', requirePermission('server.delete'), async (req, res) => {
    const { id } = req.params;
    try {
        await removeServer(id);
        res.json({ success: true });
        if (req.user) auditService.log(req.user.id, 'SERVER_DELETE', id, undefined, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:id/clone', requirePermission('server.create'), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        const clone = await cloneServer(id, name);
        res.json(clone);
        if (req.user) auditService.log(req.user.id, 'SERVER_CREATE', clone.id, { clonedFrom: id, name: clone.name }, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Map sub-routers
// 1. MONITOR FIRST (Has public routes like /query)
router.use('/:id', monitorRouter);

// 2. OTHER PROTECTED ROUTERS
router.use('/:id', powerRouter);
router.use('/:id', settingsRouter);
router.use('/:id', installRouter);
router.use('/:id', playersRouter);

// 3. PREFIXED PROTECTED ROUTERS
router.use('/:id/map', mapRouter);
router.use('/:id/files', filesRouter);
router.use('/:id/schedules', schedulesRouter);
router.use('/:id/backups', backupsRouter);
router.use('/:id/members', membersRouter);
router.use('/:id/databases', databasesRouter);

export default router;
