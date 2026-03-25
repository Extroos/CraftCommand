
import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';

import { processManager } from '../processes/ProcessManager';
import { getSystemStats } from '../system/SystemStats';
import { javaManager } from '../processes/JavaManager';
import { FileSystemManager } from '../files/FileSystemManager';
import { installerService } from '../installer/InstallerService';
import { importService } from '../installer/ImportService';
import { getServers, saveServer, getServer, removeServer, updateServer, diagnoseServer, startServer, stopServer, cloneServer, resetSftpPassword, getServerPorts, assignServerPort, rotateServerPort } from './ServerService';
import { serverConfigService } from './ServerConfigService';
import { AppError } from '../../utils/AppError';
import { auditService } from '../system/AuditService';
import { ServerConfig, ServerStatus } from '@shared/types';
import { DATA_DIR, SERVERS_ROOT, DATA_PATHS } from '../../constants';
import { autoHealingService } from '../diagnosis/AutoHealingService';
import sharp from 'sharp';
import { databaseService } from './DatabaseService';
import { ValidationUtils } from '../../utils/ValidationUtils';
import { serverRepository } from '../../storage/ServerRepository';


const util = require('minecraft-server-util');
import multer from 'multer';
import net from 'net';
import AdmZip from 'adm-zip';

// Configure Multer (Generic storage, destination handled in route or moved after)
import { verifyToken, requirePermission, requireRole, optionalVerifyToken } from '../../middleware/authMiddleware';

const upload = multer({ dest: path.join(path.dirname(DATA_PATHS.SERVERS_ROOT), 'temp_uploads') });

const router = express.Router();
import mapRouter from './map.routes';

router.use('/:id/map', mapRouter);


import { nodeRegistryService } from '../nodes/NodeRegistryService';
import { nodeSchedulerService } from '../nodes/NodeSchedulerService';

// Public/Open Routes (for now, or maybe require login for everything?)
// Let's require login for everything except potentially basic status?
// For Host-Style, everything should require login except maybe a public status page.
// We'll apply verifyToken globally to the router for now, BUT we need to handle the initial fetch?
// Actually, let's just protect the mutation routes first to avoid breaking the frontend immediately until we update it.

// P0: Protect mutations
router.post('*', verifyToken);
router.put('*', verifyToken);
router.delete('*', verifyToken);
router.patch('*', verifyToken);

// --- Helpers ---
const getIconUrl = (server: any) => {
    const iconName = server.software === 'Bedrock' ? 'world_icon.png' : 'server-icon.png';
    const iconPath = path.join(server.workingDirectory, iconName);
    if (fs.existsSync(iconPath)) {
        try {
            const buffer = fs.readFileSync(iconPath);
            return `data:image/png;base64,${buffer.toString('base64')}`;
        } catch (e) {
            console.error(`[IconHelper] Failed to read icon for ${server.id}:`, e);
        }
    }
    return null;
};

// Import Routes
router.post('/import/local', requirePermission('server.create'), async (req, res) => {
    try {
        const { name, path: absolutePath, config } = req.body;
        if (!name || !absolutePath) return res.status(400).json({ error: 'Name and Path are required.' });
        
        const server = await importService.importLocal(name, absolutePath, config);
        res.json(server);
        
        auditService.log((req as any).user.id, 'SERVER_IMPORT_LOCAL', server.id, { name, path: absolutePath }, req.ip);
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
        
        auditService.log((req as any).user.id, 'SERVER_IMPORT_ARCHIVE', server.id, { name }, req.ip);
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


// Query Server Status (Real Ping)
router.get('/:id/stats', verifyToken, requirePermission('server.view'), async (req, res) => {
    const { id } = req.params;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const stats = await processManager.getServerStats(id);
    const diagnosis = await diagnoseServer(id);
    
    // Map diagnosis to the legacy 'analysis' field for frontend compatibility
    const analysis = {
        status: diagnosis.some(r => r.severity === 'CRITICAL') ? 'CRITICAL' : (diagnosis.length > 0 ? 'WARNING' : 'HEALTHY'),
        issues: diagnosis.map(r => `⚠️ ${r.title}`),
        environment: {}
    };

    res.json({ ...stats, analysis, diagnosis });
});



// Query Server Status (Real Ping)
router.get('/:id/query', async (req, res) => {
    const { id } = req.params;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    // 1. Get current cached stats
    console.log(`[Query] ${id} - Status: ${server.status} | Running: ${processManager.isRunning(id)}`);
    const cached = processManager.getCachedStatus(id);
    
    // ProcessManager now strictly manages 'STARTING' vs 'ONLINE'
    // We trust its state.
    const response = {
        ...cached,
        // Ensure status serves as the source of truth
        status: cached.status || (processManager.isRunning(id) ? ServerStatus.STARTING : ServerStatus.OFFLINE),
        uptime: processManager.getUptime(id),
        tps: await processManager.getTPS(id),
        maxPlayers: server.maxPlayers || 20
    };

    // 2. Respond instantly with cached data
    res.json(response);

    // 3. Background Refresh (Proactive)
    // We probe regardless of processManager.isRunning() to detect orphaned processes
    if (!processManager.isUpdatingStatus(id)) {
        processManager.setUpdatingStatus(id, true);
        (async () => {
            try {
                // Ghost Check: Ensure no OTHER running server owns this port
                const allServers = getServers(); 
                const conflict = allServers.find((s: any) => s.port === server.port && s.id !== id && processManager.isRunning(s.id));
                
                if (conflict) {
                     console.log(`[Query] ${id} Ghost Detected: Port ${server.port} owned by ${conflict.id}. Marking OFFLINE.`);
                     processManager.updateCachedStatus(id, { online: false, players: 0, status: ServerStatus.OFFLINE });
                     
                     // Force persistence correction
                     if (server.status === ServerStatus.ONLINE) {
                         server.status = ServerStatus.OFFLINE;
                         saveServer(server);
                     }
                     return; // Abort further checks
                }

                // Standard Status Check
                let status: any;
                if (server.software === 'Bedrock') {
                    status = await util.statusBedrock('127.0.0.1', server.port, { timeout: 2000 });
                } else {
                    status = await util.status('127.0.0.1', server.port, { timeout: 2000 });
                }
                
                console.log(`[Query Debug] ${id} (Port ${server.port}) -> Online: ${status.players.online}/${status.players.max}`);
                
                // GHOST PREVENTION:
                // If the panel thinks the server is stopped (!isRunning), but we found it online, 
                // it means we lost the process handle (Ghost/Orphan).
                // DO NOT mark it as ONLINE in the panel, otherwise we get "Flapping" (List says Offline, Query says Online).
                // The user must kill the ghost manually (or we need a kill-by-port feature).
                if (!processManager.isRunning(id)) {
                    // Check if maybe it's still starting (unmanaged or race)
                    if (processManager.isStarting(id)) {
                         console.log(`[Query] ${id} Port active during startup lockout. Keeping STARTING.`);
                         return;
                    }

                    console.warn(`[Query] ${id} Ghost Detected (Process not tracked but Port ${server.port} active). Keeping status OFFLINE.`);
                    
                    // We can optionally mark it as 'GHOST' if the UI supported it, but for now strict OFFLINE is safer.
                    processManager.updateCachedStatus(id, { online: false, status: ServerStatus.OFFLINE });
                    return; 
                }

                processManager.updateCachedStatus(id, {
                    online: true,
                    players: status.players.online,
                    playerList: status.players.sample ? status.players.sample.map((p: any) => p.name) : (status.players.list || []), 
                    maxPlayers: status.players.max,
                    latency: status.roundTripLatency,
                    version: server.software === 'Bedrock' ? status.version : status.version.name
                });

                // Reconciliation: If DB thinks it's offline/starting but we found it online
                if (server.status !== ServerStatus.ONLINE) {
                    server.status = ServerStatus.ONLINE;
                    saveServer(server);
                }
            } catch (e) {
                // ... (rest of the catch block follows, we'll keep it as is or slightly adapt)
                // Try UDP Query as secondary
                try {
                    const q = await util.queryFull('127.0.0.1', server.port, { timeout: 1500 });
                    
                    if (!processManager.isRunning(id)) {
                        console.warn(`[Query] ${id} Ghost Detected (UDP). Keeping status OFFLINE.`);
                        processManager.updateCachedStatus(id, { online: false, status: ServerStatus.OFFLINE });
                        return;
                    }

                    processManager.updateCachedStatus(id, {
                        online: true,
                        players: q.players.online,
                        playerList: q.players.list || [],
                        maxPlayers: q.players.max,
                        latency: 1, 
                        version: q.version
                    });
                } catch (qe) {
                    // Check if port is even open
                    const isPortOpen = await new Promise((resolve) => {
                        const socket = new net.Socket();
                        socket.setTimeout(200);
                        socket.on('connect', () => { socket.destroy(); resolve(true); });
                        socket.on('error', () => { socket.destroy(); resolve(false); });
                        socket.on('timeout', () => { socket.destroy(); resolve(false); });
                        socket.connect(server.port, '127.0.0.1');
                    });

                    if (isPortOpen) {
                        processManager.updateCachedStatus(id, { online: true, latency: 1 });
                    } else {
                        processManager.updateCachedStatus(id, { online: false, players: 0, playerList: [] });
                        
                        // Only mark as OFFLINE if the process is actually dead locally
                        if (!processManager.isRunning(id)) {
                             // CLEAR PERSISTENT START TIME IF GHOST
                            if (server.startTime || server.status !== ServerStatus.OFFLINE) {
                                delete server.startTime;
                                server.status = ServerStatus.OFFLINE;
                                saveServer(server);
                            }
                        }
                    }
                }
            } finally {
                processManager.setUpdatingStatus(id, false);
            }
        })();
    }
});


// --- Routes ---

// List Servers
router.get('/', optionalVerifyToken, (req, res) => {
    try {
        const user = (req as any).user;
        const servers = getServers();
        
        // Filter by publicStatus if not authenticated
        const visibleServers = user 
            ? servers 
            : servers.filter((s: any) => s.publicStatus === true);

        // Enhance with status
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
        console.error('[ServersRoute] Failed to list servers:', error);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            message: 'Failed to retrieve servers. Please try again later.',
            details: error.message 
        });
    }
});

// Get Server Logs
router.get('/:id/logs', verifyToken, requirePermission('server.console.read'), async (req, res) => {
    const { id } = req.params;
    let logs = processManager.getLogs(id);

    // Fallback: If no memory logs (e.g. app restart), try reading latest.log from disk
    if (logs.length === 0) {
        const server = getServer(id);
        if (server) {
             const logPath = server.logLocation 
                ? path.resolve(server.workingDirectory, server.logLocation)
                : path.join(server.workingDirectory, 'logs', 'latest.log');
             
             if (await fs.pathExists(logPath)) {
             if (await fs.pathExists(logPath)) {
                 try {
                     // Optimized: Read only the tail
                     const { LogUtils } = require('../../utils/LogUtils');
                     logs = await LogUtils.readLastLines(logPath, 200);
                 } catch (e) {
                     console.warn(`[API] Failed to read fallback logs for ${id}:`, e);
                 }
             }
             }
        }
    }

    res.json(logs);
});

// Get Crash Report
router.get('/:id/crash-report', verifyToken, requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const logs = processManager.getLogs(id);
    
    // Use the core diagnosis engine to analyze the crash
    const diagnosis = await diagnoseServer(id);
    const mainIssue = diagnosis.find(d => d.severity === 'CRITICAL') || diagnosis[0];
    
    const analysis = mainIssue 
        ? `${mainIssue.title} - ${mainIssue.recommendation}`
        : 'Unknown Crash - Please check the console logs for "Exception" or "Error".';

    res.json({ analysis, logs: logs.slice(-50), diagnosis });
});

// Run Diagnosis
// Run Diagnosis
router.get('/:id/diagnosis', verifyToken, requirePermission('server.view'), async (req, res) => {
    const { id } = req.params;
    try {
        const results = await diagnoseServer(id);
        logger.info(`[DEBUG_DIAGNOSIS] Returning for ${id}: ${JSON.stringify(results, null, 2)}`);
        res.json(results);
    } catch (e: any) {
        logger.error(`[DEBUG_DIAGNOSIS] Error for ${id}: ${e}`);
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id/test-diagnosis', async (req, res) => {
    const { id } = req.params;
    try {
        const results = await diagnoseServer(id);
        console.log(`[LOCAL_TEST] Returning for ${id}: ${JSON.stringify(results, null, 2)}`);
        res.json(results);
    } catch (e: any) {
        console.error(`[LOCAL_TEST] Error for ${id}: ${e}`);
        res.status(500).json({ error: e.message });
    }
});

// Apply Automatic Fix (Manual Trigger)
router.post('/:id/heal', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    const { type, payload } = req.body;
    
    if (!type) {
        return res.status(400).json({ error: 'Fix type is required.' });
    }

    try {
        await autoHealingService.executeFix(id, type, payload || {});
        res.json({ success: true, message: `Successfully applied fix: ${type}` });
        
        auditService.log((req as any).user.id, 'SERVER_HEAL', id, { type, payload }, req.ip);
    } catch (e: any) {
        console.error(`[Servers] Manual fix failed for ${id}:`, e);
        res.status(500).json({ error: e.message || 'Failed to apply automatic fix.' });
    }
});

// Reset Stability/Health Status
router.post('/:id/health/reset', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    try {
        const { autoHealingService } = require('../diagnosis/AutoHealingService');
        autoHealingService.resetStabilityMarker(id);
        res.json({ success: true, message: 'Stability marker reset successfully.' });
        auditService.log((req as any).user.id, 'SERVER_HEAL_RESET', id, undefined, req.ip);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// Create Server
// Import at top (assumed added in previous step or handled by imports logic, but I'll add the logic inline or rely on auto-import)
import { validateFolderName } from '../../utils/validation';

// ... (in the route)

// router.post('/', requirePermission('server.create'), async (req, res) => {
router.post('/', requirePermission('server.create'), async (req, res) => {
    const config = req.body;
    
    // Phase 4: Handle Automatic Node Selection
    if (config.nodeId === 'auto') {
        const ramGB = ValidationUtils.validateRam(config.ram || 2);
        const result = nodeSchedulerService.findBestNode(ramGB);
        
        if (!result.selectedNode) {
            // Safety Fallback: If scheduler fails but it was 'auto', try local if it exists
            const localNode = nodeRegistryService.getNode('local');
            if (localNode) {
                console.warn(`[Servers] Scheduler failed for 'auto', falling back to "Local Node"`);
                config.nodeId = 'local';
            } else {
                return res.status(409).json({ 
                    error: 'No suitable nodes available for automatic deployment.',
                    reason: result.reason 
                });
            }
        } else {
            config.nodeId = result.selectedNode.id;
            console.log(`[Servers] Scheduler selected node "${result.selectedNode.name}" (${config.nodeId}) for new server.`);
        }
    }

    // Phase 23: Enforce Distributed Node Capacity & Resolution
    if (!config.nodeId || config.nodeId === '') {
        logger.warn('[Servers] No nodeId provided. Defaulting to "local".');
        config.nodeId = 'local';
    }

    let node = nodeRegistryService.getNode(config.nodeId);
    
    // Safety Fallback: If specific node not found, but we CAN fallback to local
    if (!node && config.nodeId !== 'local') {
        logger.warn(`[Servers] Selected node "${config.nodeId}" not found. Falling back to "local" node.`);
        config.nodeId = 'local';
        node = nodeRegistryService.getNode('local');
    }

    if (!node) {
         logger.error(`[Servers] Terminal Error: Node "${config.nodeId}" still not found after fallback.`);
         return res.status(404).json({ error: 'Selected node not found.' });
    }
        if (node.status !== 'ONLINE') {
             return res.status(409).json({ error: 'Selected node is offline.' });
        }
        
        // Strict Capacity Check (Prevent Overcommit)
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
    
    // Custom Folder Name Logic
    let dirName = ValidationUtils.validateId(id, 'Server ID');
    if (config.folderName) {
        if (!validateFolderName(config.folderName)) {
            throw new AppError(400, 'INVALID_FOLDER', 'Folder name must be alphanumeric and cannot be a reserved system name.');
        }
        dirName = config.folderName;
    }

    const serverDir = path.join(DATA_PATHS.SERVERS_ROOT, dirName);
    
    try {
        // Atomic creation: Fails if exists. 
        // Note: DATA_PATHS.SERVERS_ROOT must exist. logic below ensures the ROOT exists first.
        await fs.ensureDir(DATA_PATHS.SERVERS_ROOT); 
        await fs.promises.mkdir(serverDir); // Default recursive: false matches requirements (fail if exists)
    } catch (e: any) {
        if (e.code === 'EEXIST') {
             return res.status(409).json({ error: `Server folder '${dirName}' already exists.` });
        }
        throw e;
    }
    
    const isBedrock = config.software === 'Bedrock';
    const defaultExecutable = isBedrock ? (process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server') : 'server.jar';
    const defaultCommand = isBedrock ? (process.platform === 'win32' ? 'bedrock_server.exe' : './bedrock_server') : 'server.jar';

    const newServer = {
        ...config,
        id,
        folderName: dirName !== id ? dirName : undefined,
        workingDirectory: serverDir,
        executable: config.executable || defaultExecutable,
        executionCommand: config.executionCommand || defaultCommand,
        status: ServerStatus.OFFLINE
    };
    
    saveServer(newServer);
    
    // Start File Watcher
    const { fileWatcherService } = await import('../files/FileWatcherService');
    fileWatcherService.watchServer(id, serverDir);

    auditService.log((req as any).user.id, 'SERVER_CREATE', id, { name: config.name }, req.ip);

    res.json(newServer);
});


// Start Server
router.post('/:id/start', requirePermission('server.start'), async (req, res) => {
    const { id } = req.params;
    const { force } = req.body;
    console.log(`[Route:Start] Received request for ${id} (force=${!!force})`);
    
    try {
        await startServer(id, !!force);
        res.json({ success: true, status: ServerStatus.STARTING });
        auditService.log((req as any).user.id, 'SERVER_START', id, { force: !!force }, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
    } catch (e: any) {
        console.error(`[Server:${id}] Start Route failed:`, e);
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
router.post('/:id/stop', requirePermission('server.stop'), async (req, res) => {
    const { id } = req.params;
    const { force } = req.body;
    
    try {
        await stopServer(id, !!force);
        res.json({ success: true, status: ServerStatus.STOPPING });
        auditService.log((req as any).user.id, 'SERVER_STOP', id, { force: !!force }, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
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

// Graceful Stop
router.post('/:id/stop/graceful', requirePermission('server.stop'), async (req, res) => {
    const { id } = req.params;
    const { delay } = req.body;
    
    try {
        processManager.gracefulStop(id, delay || 30);
        res.json({ success: true, status: ServerStatus.STOPPING, message: `Graceful shutdown initiated with ${delay || 30}s delay.` });
        auditService.log((req as any).user.id, 'SERVER_STOP_GRACEFUL', id, { delay: delay || 30 }, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Cancel Graceful Stop
router.post('/:id/stop/cancel', requirePermission('server.stop'), async (req, res) => {
    const { id } = req.params;
    try {
        processManager.cancelGracefulStop(id);
        res.json({ success: true, message: 'Graceful shutdown cancelled.' });
        auditService.log((req as any).user.id, 'SERVER_STOP_CANCEL', id, undefined, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Server
router.delete('/:id', requirePermission('server.delete'), async (req, res) => {
    const { id } = req.params;
    
    try {
        await removeServer(id);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'SERVER_DELETE', id, undefined, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Clone Server
router.post('/:id/clone', requirePermission('server.create'), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    
    try {
        const clone = await cloneServer(id, name);
        res.json(clone);
        auditService.log((req as any).user.id, 'SERVER_CREATE', clone.id, { clonedFrom: id, name: clone.name }, req.ip).catch(e => logger.error(`[Audit] Failed: ${e.message}`));
    } catch (e: any) {
        logger.error(`[Clone] Failed for ${id}: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Update Server Config
router.patch('/:id', requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    try {
        const updatedServer = await updateServer(id, updates);
        res.json(updatedServer);

        auditService.log((req as any).user.id, 'SERVER_UPDATE', id, { updates: Object.keys(updates) }, req.ip);
    } catch (e: any) {
        if (e.message === 'Server not found') return res.status(404).json({ error: 'Server not found' });
        res.status(500).json({ error: e.message });
    }
});

// --- Connectivity & Networking Extensions (Phase 108) ---

// Reset SFTP Password
router.post('/:id/sftp/reset', requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await resetSftpPassword(id);
        res.json(result);
        auditService.log((req as any).user.id, 'SERVER_UPDATE', id, { detail: 'SFTP Password Reset' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get Server Port Mappings
router.get('/:id/ports', verifyToken, requirePermission('server.view'), async (req, res) => {
    const { id } = req.params;
    try {
        const ports = getServerPorts(id);
        res.json(ports);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Allocate Additional Port
router.post('/:id/ports', requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    try {
        const newPort = await assignServerPort(id);
        res.json(newPort);
        auditService.log((req as any).user.id, 'SERVER_UPDATE', id, { detail: 'Allocated additional port', port: newPort.port });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Rotate Additional Port
router.patch('/:id/ports/:portId/rotate', requirePermission('server.settings'), async (req, res) => {
    const { id, portId } = req.params;
    try {
        const updatedPort = await rotateServerPort(id, portId);
        res.json(updatedPort);
        auditService.log((req as any).user.id, 'SERVER_UPDATE', id, { detail: 'Rotated additional port', portId, newPort: updatedPort.port });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- Phase 54.3: Configuration Drift Detection ---

// Check Configuration Drift
router.get('/:id/config/check', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const server = getServer(id);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        
        const report = await serverConfigService.verifyConfig(server);
        res.json(report);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Force Sync Configuration to Disk
router.post('/:id/config/sync', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    try {
        const server = getServer(id);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        
        await serverConfigService.enforceConfig(server);
        
        // Update lastSyncTime in DB
        await updateServer(id, { lastSyncTime: Date.now() });
        
        res.json({ success: true, message: 'Configuration enforced on disk successfully' });
        auditService.log((req as any).user.id, 'SERVER_UPDATE', id, { detail: 'Forced configuration sync' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Server Icon Upload
router.post('/:id/icon', requirePermission('server.settings'), upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const server = getServer(id);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });

        const iconName = server.software === 'Bedrock' ? 'world_icon.png' : 'server-icon.png';
        const targetPath = path.join(server.workingDirectory, iconName);

        // Stabilize Icon: Resize to 64x64 and convert to PNG
        try {
            await sharp(req.file.path)
                .resize(64, 64, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toFile(targetPath);
            
            // Clean up the temp file
            await fs.remove(req.file.path);
            
            logger.info(`[IconUpload] Stabilized & Updated icon for ${id} (${server.software}) at ${targetPath}`);
            res.json({ success: true, iconName });

            auditService.log((req as any).user.id, 'SERVER_ICON_UPDATE', server.id, { iconName });
        } catch (sharpError: any) {
            logger.error(`[IconUpload] Sharp processing failed: ${sharpError.message}`);
            // Fallback: move the file as-is if possible, or error out
            throw new Error(`Icon stabilization failed: ${sharpError.message}`);
        }
    } catch (e: any) {
        logger.error(`[IconUpload] Failed for ${req.params.id}: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Check File Exists (Silent)
router.get('/:id/files/exists', verifyToken, requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath || typeof relativePath !== 'string') return res.status(400).json({ error: 'Path is required' });

    try {
        const targetPath = path.resolve(server.workingDirectory, relativePath);
        if (!targetPath.startsWith(server.workingDirectory)) {
            return res.json({ exists: false });
        }
        const exists = await fs.pathExists(targetPath);
        res.json({ exists });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get File Content
router.get('/:id/files/content', verifyToken, requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        const content = await fsManager.readFile(relativePath as string);
        res.json({ content });
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            return res.status(404).json({ error: 'File not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Save File Content
router.post('/:id/files/content', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath, content } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.writeFile(relativePath, content);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'FILE_EDIT', id, { path: relativePath });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create Folder
router.post('/:id/files/folder', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.createDirectory(relativePath);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'FOLDER_CREATE', id, { path: relativePath });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get Files
router.get('/:id/files', verifyToken, requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    
    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        const files = await fsManager.listFiles((relativePath as string) || '.');
        res.json(files);

    } catch (e: any) {
        res.status(403).json({ error: e.message });
    }
});

// Search Files
router.get('/:id/files/search', verifyToken, requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { query, dir } = req.query;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!query || typeof query !== 'string' || query.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
    }

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        const searchContent = req.query.content === 'true';
        const results = await fsManager.searchFiles(query, (dir as string) || '.', 100, searchContent);
        res.json(results);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Files (Accepts array of paths in body)
router.delete('/:id/files', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { paths } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!Array.isArray(paths)) return res.status(400).json({ error: 'Invalid paths' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        for (const p of paths) {
            await fsManager.deletePath(p);
        }
        res.json({ success: true });
        auditService.log((req as any).user.id, 'FILE_DELETE_BULK', id, { paths, count: paths.length });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Move Files
router.post('/:id/files/move', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { source, dest } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.move(source, dest);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'FILE_MOVE', id, { source, dest });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Copy Files
router.post('/:id/files/copy', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { source, dest } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.copy(source, dest);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'FILE_COPY', id, { source, dest });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Compress Files
router.post('/:id/files/compress', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { paths, name } = req.body; // paths: string[], name: archive filename
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.compress(paths, name);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'FILE_COMPRESS', id, { paths, count: paths.length, archive: name });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Download File
router.get('/:id/files/download', verifyToken, requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    try {
        const filePath = path.join(server.workingDirectory, relativePath as string);
        if (!filePath.startsWith(server.workingDirectory)) {
             return res.status(403).json({ error: 'Access denied' });
        }
        
        if (await fs.pathExists(filePath)) {
             res.download(filePath);
             auditService.log((req as any).user.id, 'FILE_DOWNLOAD', id, { path: relativePath });
        } else {
             res.status(404).json({ error: 'File not found' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Upload File to Server Directory
// router.post('/:id/files/upload', requirePermission('server.files.write'), upload.single('file'), async (req, res) => {
router.post('/:id/files/upload', requirePermission('server.files.write'), upload.single('file'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query; // Support ?path=plugins
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const rootDir = server.workingDirectory;
        // Resolve target directory
        let targetDir = rootDir;
        if (relativePath && typeof relativePath === 'string') {
            const resolved = path.resolve(rootDir, relativePath);
            if (!resolved.startsWith(rootDir)) {
                return res.status(403).json({ error: 'Access denied: Path traversal detected' });
            }
            targetDir = resolved;
        }

        await fs.ensureDir(targetDir);
        const targetPath = path.join(targetDir, req.file.originalname);
        
        await fs.move(req.file.path, targetPath, { overwrite: true });
        
        res.json({ success: true, filename: req.file.originalname, path: relativePath || '/' });
        auditService.log((req as any).user.id, 'FILE_UPLOAD', id, { filename: req.file.originalname, path: relativePath || '/' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Extract ZIP file
// Extract ZIP file (Smart Extract)
router.post('/:id/files/extract', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { filePath } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!filePath || !filePath.endsWith('.zip')) return res.status(400).json({ error: 'Invalid ZIP file' });

    try {
        console.log(`[Extract] Request for server ${id}, file: ${filePath}`);
        const zipPath = path.join(server.workingDirectory, filePath);
        
        if (!(await fs.pathExists(zipPath))) {
            console.error(`[Extract] Zip file not found: ${zipPath}`);
            return res.status(404).json({ error: 'ZIP file not found' });
        }

        // 1. Extract to a temp directory
        const tempDir = path.join(server.workingDirectory, `.temp_extract_${Date.now()}`);
        await fs.ensureDir(tempDir);
        console.log(`[Extract] Extracting to ${tempDir}...`);
        
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tempDir, true);
        console.log(`[Extract] Extraction complete.`);

        // 2. Smart Detection
        const files = await fs.readdir(tempDir);
        const targetDir = path.dirname(zipPath);
        console.log(`[Extract] Detected ${files.length} items in zip root.`);

        if (files.length === 1) {
             const nestedPath = path.join(tempDir, files[0]);
             const stats = await fs.stat(nestedPath);
             if (stats.isDirectory()) {
                 // Smart: It's a single folder wrapper. Move CONTENTS up.
                 console.log(`[Extract] Flattening nested folder: ${files[0]}`);
                 await fs.copy(nestedPath, targetDir, { overwrite: true });
             } else {
                 // Single file, just move it
                 console.log(`[Extract] Moving single file: ${files[0]}`);
                 await fs.move(nestedPath, path.join(targetDir, files[0]), { overwrite: true });
             }
        } else {
             // Standard: Move all items
             console.log(`[Extract] Moving all items to ${targetDir}`);
             await fs.copy(tempDir, targetDir, { overwrite: true });
        }

        // 3. Cleanup
        await fs.remove(tempDir);
        console.log(`[Extract] Cleanup complete.`);
        
        res.json({ success: true, message: 'File extracted successfully' });
        auditService.log((req as any).user.id, 'FILE_EXTRACT', id, { path: filePath });
    } catch (e: any) {
        console.error(`[Extract] Error:`, e);
        res.status(500).json({ error: e.message });
    }
});




// Install Server Software
router.post('/:id/install', requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    const { type, version, build, url } = req.body; // type: 'paper' | 'modpack'
    const server = getServer(id);

    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        console.log(`[Installation] Request for server ${id} | Type: ${type} | Version: ${version}`);

        // Centralized Progress Callback
        const onProgress = (msg: string, percent: number = -1) => {
            if ((req as any).io) {
                (req as any).io.emit('install:progress', {
                    serverId: id,
                    phase: 'installing',
                    message: msg,
                    percent
                });
            }
        };

        // Set status to INSTALLING
        const s = getServer(id);
        if (s) {
            s.status = ServerStatus.INSTALLING;
            saveServer(s);
        }

        if (type === 'paper') {
            await installerService.installPaper(id, server.workingDirectory, version || '1.21.1', build, onProgress);
        } else if (type === 'purpur') {
            await installerService.installPurpur(id, server.workingDirectory, version || '1.21.1', build, onProgress);
        } else if (type === 'vanilla') {
            await installerService.installVanilla(id, server.workingDirectory, version || '1.21.1', onProgress);
        } else if (type === 'fabric') {
            await installerService.installFabric(id, server.workingDirectory, version || '1.21.1', onProgress);
        } else if (type === 'modpack' && url) {
            await installerService.installModpackFromZip(id, server.workingDirectory, url, version, onProgress, server.software);
        } else if (type === 'forge') {
            console.log(`[Installation] Starting Async Forge Install for ${id}`);
            installerService.installForge(id, server.workingDirectory, version || '1.21.1', (req.body as any).localModpack, build, onProgress)
                .then(executable => {
                    const s = getServer(id);
                    if (s) {
                        s.executable = executable;
                        s.status = ServerStatus.OFFLINE;
                        saveServer(s);
                    }
                })
                .catch(err => {
                    console.error(`[Installation] Forge Install Failed: ${err.message}`);
                    const s = getServer(id);
                    if (s) {
                        s.status = ServerStatus.OFFLINE;
                        saveServer(s);
                    }
                });
            
            res.json({ success: true, message: 'Installation started in background.' });
            return; 
        } else if (type === 'neoforge') {
            const executable = await installerService.installNeoForge(id, server.workingDirectory, version || '1.21.1', build, onProgress);
            server.executable = executable;
            server.javaVersion = 'Java 21';
            saveServer(server);
        } else if (type === 'spigot') {
            await installerService.installSpigot(id, server.workingDirectory, version || '1.21.1', onProgress);
        } else if (type === 'velocity') {
            await installerService.installVelocity(id, server.workingDirectory, { version: version || '3.4.0-SNAPSHOT', build }, onProgress);
            const s = getServer(id);
            if (s) {
                s.executable = 'velocity.jar';
                saveServer(s);
            }
        } else if (type === 'bedrock') {
            const bVersion = version || '1.26.0.2';
            await installerService.installBedrock(id, server.workingDirectory, bVersion, onProgress);
            const s = getServer(id);
            if (s) {
                const exe = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
                s.executable = exe;
                s.executionCommand = process.platform === 'win32' ? exe : `./${exe}`;
                s.version = bVersion;
                s.status = ServerStatus.OFFLINE;
                saveServer(s);
            }
        } else {
            console.error(`[Installation] Rejected: Invalid type "${type}" or missing parameters.`);
            return res.status(400).json({ 
                error: 'Invalid installation type or missing parameters',
                details: { receivedType: type, supported: ['paper', 'purpur', 'vanilla', 'fabric', 'modpack', 'forge', 'neoforge', 'spigot', 'velocity', 'bedrock'] }
            });
        }

        // --- Post-Install: Check Advanced Flags ---
        if (server.advancedFlags) {
            if (server.advancedFlags.installSpark) {
                if (type === 'paper' || type === 'purpur' || type === 'spigot') {
                     await installerService.installSpark(server.workingDirectory);
                }
            }
        }

        // --- Post-Install: Online Mode (Crack Server) ---
        if (server.onlineMode === false) {
             const propsPath = path.join(server.workingDirectory, 'server.properties');
             if (!await fs.pathExists(propsPath)) {
                 await fs.writeFile(propsPath, 'online-mode=false\n');
             } else {
                 let content = await fs.readFile(propsPath, 'utf8');
                 if (content.includes('online-mode=')) {
                     content = content.replace(/online-mode=(true|false)/, 'online-mode=false');
                 } else {
                     content += '\nonline-mode=false';
                 }
                 await fs.writeFile(propsPath, content);
             }
        }

        const finalS = getServer(id);
        if (finalS && finalS.status === ServerStatus.INSTALLING) {
            finalS.status = ServerStatus.OFFLINE;
            saveServer(finalS);
        }

        res.json({ success: true, message: 'Installation complete' });
        auditService.log((req as any).user.id, 'TEMPLATE_INSTALL', id, { type, version });

    } catch (e: any) {
        console.error(`[Installation] Fatal error during ${type} install for ${id}:`, e);
        const s = getServer(id);
        if (s) {
            s.status = ServerStatus.OFFLINE;
            saveServer(s);
        }
        res.status(500).json({ error: e.message });
    }
});

import { scheduleService } from '../scheduling/ScheduleService';

// ==================== SCHEDULE ROUTES ====================

// Get Schedules
router.get('/:id/schedules', async (req, res) => {
    const { id } = req.params;
    try {
        const schedules = await scheduleService.getSchedules(id);
        res.json(schedules);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get Schedule History
router.get('/:id/schedules/history', async (req, res) => {
    const { id } = req.params;
    try {
        const history = await scheduleService.getHistory(id);
        res.json(history);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create Schedule
router.post('/:id/schedules', async (req, res) => {
    const { id } = req.params;
    const task = req.body;
    try {
        await scheduleService.addTask(id, task);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'SCHEDULE_CREATE', id, { taskName: task.name, type: task.type });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Update Schedule
router.put('/:id/schedules/:taskId', async (req, res) => {
    const { id } = req.params;
    const task = req.body;
    try {
        await scheduleService.updateTask(id, task);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'SCHEDULE_UPDATE', id, { taskId: task.id, taskName: task.name });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Schedule
router.delete('/:id/schedules/:taskId', async (req, res) => {
    const { id, taskId } = req.params;
    try {
        await scheduleService.removeTask(id, taskId);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'SCHEDULE_DELETE', id, { taskId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Run Schedule Now (Manual Trigger)
router.post('/:id/schedules/:taskId/run', async (req, res) => {
    const { id, taskId } = req.params;
    try {
        await scheduleService.runTaskNow(id, taskId);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'SCHEDULE_RUN_NOW' as any, id, { taskId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== BACKUP ROUTES ====================

import { backupService } from '../backups/BackupService';

// Toggle Lock
router.post('/:id/backups/:backupId/lock', async (req, res) => {
    const { id, backupId } = req.params;
    try {
        const isLocked = await backupService.toggleLock(id, backupId);
        res.json({ success: true, locked: isLocked });
        auditService.log((req as any).user.id, isLocked ? 'BACKUP_LOCK' : 'BACKUP_UNLOCK', id, { backupId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create backup
router.post('/:id/backups', async (req, res) => {
    const { id } = req.params;
    const { description, worldOnly } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        // If server is online, flush saves
        if (processManager.isRunning(id)) {
            console.log(`[Backups] Flushing saves for online server ${id}...`);
            processManager.sendCommand(id, 'save-all');
            // Give it 2 seconds to write to disk
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const backup = await processManager.createBackup(id, server.workingDirectory, description, worldOnly);
        res.json(backup);
        auditService.log((req as any).user.id, 'BACKUP_CREATE', id, { backupId: backup.id, description, worldOnly });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// List backups
router.get('/:id/backups', async (req, res) => {
    const { id } = req.params;
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
router.post('/:id/backups/:backupId/restore', async (req, res) => {
    const { id, backupId } = req.params;
    const { worldOnly } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        // Stop server if running
        if (processManager.isRunning(id)) {
            console.log(`[Backups] Stopping server ${id} for restoration...`);
            processManager.stopServer(id);
            const stopped = await processManager.waitForClose(id, 30000); // Wait up to 30s
            
            if (!stopped) {
                console.warn(`[Backups] Server ${id} did not stop gracefully. Force killing to proceed with restore.`);
                processManager.killServer(id);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Short breather after kill
            }
        }

        await processManager.restoreBackup(id, server.workingDirectory, backupId, worldOnly);
        
        // Re-sync config if full restore took place
        if (!worldOnly) {
             await serverConfigService.enforceConfig(server);
        }

        await startServer(id);
        res.json({ success: true, message: 'Backup restored successfully' });
        
        auditService.log((req as any).user.id, 'SERVER_RESTORE', id, { backupId, worldOnly: !!worldOnly });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete backup
router.delete('/:id/backups/:backupId', async (req, res) => {
    const { id, backupId } = req.params;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        await backupService.deleteBackup(id, backupId);
        res.json({ success: true, message: 'Backup deleted' });
        auditService.log((req as any).user.id, 'BACKUP_DELETE', id, { backupId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Download backup
router.get('/:id/backups/:backupId/download', async (req, res) => {
    const { id, backupId } = req.params;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        const filePath = await backupService.getBackupPath(id, backupId);
        res.download(filePath);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});





// ==================== CLOUD BACKUP DESTINATIONS ====================

// List cloud destinations
router.get('/cloud-destinations', verifyToken, requirePermission('server.settings'), async (_req, res) => {
    try {
        const destinations = await backupService.getCloudDestinations();
        res.json(destinations);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Add cloud destination
router.post('/cloud-destinations', requirePermission('server.settings'), async (req, res) => {
    try {
        const destinations = await backupService.addCloudDestination(req.body);
        res.json(destinations);
        auditService.log((req as any).user.id, 'BACKUP_CLOUD_ADD', undefined, { provider: req.body.provider, name: req.body.name });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Test cloud destination
router.post('/cloud-destinations/test', requirePermission('server.settings'), async (req, res) => {
    try {
        const result = await backupService.testCloudDestination(req.body);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Remove cloud destination
router.delete('/cloud-destinations/:name', requirePermission('server.settings'), async (req, res) => {
    try {
        const destinations = await backupService.removeCloudDestination(req.params.name);
        res.json(destinations);
        auditService.log((req as any).user.id, 'BACKUP_CLOUD_REMOVE', undefined, { name: req.params.name });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// ==================== MEMBER ROUTES ====================

// Get Server Members
router.get('/:id/members', verifyToken, requirePermission('server.view'), async (req, res) => {
    const { id } = req.params;
    try {
        const members = await serverRepository.getMembers(id);
        res.json(members);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Add Server Member
router.post('/:id/members', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    const { email, role } = req.body;
    try {
        await serverRepository.addMember(id, email, role);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'USER_UPDATE', id, { action: 'MEMBER_ADD', email, role });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Remove Server Member
router.delete('/:id/members/:userId', verifyToken, requirePermission('server.settings'), async (req, res) => {
    const { id, userId } = req.params;
    try {
        await serverRepository.removeMember(id, userId);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'USER_UPDATE', id, { action: 'MEMBER_REMOVE', userId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== DATABASE ROUTES ====================

// Get Server Databases
router.get('/:id/databases', verifyToken, requirePermission('server.view'), async (req, res) => {
    const { id } = req.params;
    try {
        const databases = await databaseService.getDatabases(id);
        res.json(databases);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Provision New Database
router.post('/:id/databases', verifyToken, requirePermission('server.databases.manage'), async (req, res) => {
    const { id } = req.params;
    try {
        const newDb = await databaseService.createDatabase(id, req.body);
        res.json(newDb);
        auditService.log((req as any).user.id, 'SYSTEM_SETTINGS_UPDATE', id, { detail: 'Provisioned database', name: newDb.name });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Database
router.delete('/:id/databases/:dbId', verifyToken, requirePermission('server.databases.manage'), async (req, res) => {
    const { id, dbId } = req.params;
    try {
        await databaseService.deleteDatabase(id, dbId);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'SYSTEM_SETTINGS_UPDATE', id, { detail: 'Deleted database', dbId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Rotate Database Password
router.post('/:id/databases/:dbId/rotate', verifyToken, requirePermission('server.databases.manage'), async (req, res) => {
    const { id, dbId } = req.params;
    try {
        const result = await databaseService.rotateDatabasePassword(id, dbId);
        res.json(result);
        auditService.log((req as any).user.id, 'SYSTEM_SETTINGS_UPDATE', id, { detail: 'Rotated database password', dbId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Health & Auto-Healing Routes
router.post('/:id/health/reset', requirePermission('server.manage'), async (req, res) => {
    const { id } = req.params;
    try {
        await autoHealingService.resetStabilityMarker(id);
        auditService.log((req as any).user.id, 'SERVER_HEAL_RESET', id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== PLAYER ROUTES ====================

import { playerService } from './PlayerService';

// Get Player List
router.get('/:id/players/:listType', async (req, res) => {
    const { id, listType } = req.params;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        const list = await playerService.getPlayerList(id, listType as any);
        res.json(list);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Kick Player
router.post('/:id/kick-player', async (req, res) => {
    console.log('[API] Hit /kick-player route');
    const { id } = req.params;
    const { name, reason } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        await playerService.kickPlayer(id, name, reason);
        res.json({ success: true, message: `Kicked ${name}` });
        auditService.log((req as any).user.id, 'PLAYER_KICK', id, { playerName: name, reason });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Add Player (Op, Whitelist, Ban)
router.post('/:id/players/:listType', async (req, res) => {
    const { id, listType } = req.params;
    console.log(`[API] Hit /players/${listType} route (Generic)`);
    const { identifier } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!identifier) return res.status(400).json({ error: 'Identifier is required' });

    try {
        const result = await playerService.addPlayer(id, listType as any, identifier);
        res.json(result);
        
        const actionMap: any = { 'ops': 'PLAYER_OP', 'banned-players': 'PLAYER_BAN', 'whitelist': 'PLAYER_WHITELIST_ADD' };
        const action = actionMap[listType] || 'USER_UPDATE';
        auditService.log((req as any).user.id, action as any, id, { playerName: identifier });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Remove Player
router.delete('/:id/players/:listType/:identifier', async (req, res) => {
    const { id, listType, identifier } = req.params;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        const result = await playerService.removePlayer(id, listType as any, identifier);
        res.json(result);

        const actionMap: any = { 'ops': 'PLAYER_DEOP', 'banned-players': 'PLAYER_PARDON', 'whitelist': 'PLAYER_WHITELIST_REMOVE' };
        const action = actionMap[listType] || 'USER_UPDATE';
        auditService.log((req as any).user.id, action as any, id, { playerName: identifier });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get Player Activity History
router.get('/:id/activity', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const history = processManager.getActivityHistory(id);
        res.json(history);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;


