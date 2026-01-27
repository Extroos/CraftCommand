
import express from 'express';
import fs from 'fs-extra';
import path from 'path';

import { processManager } from '../services/ProcessManager';
import { getSystemStats } from '../services/SystemStats';
import { javaManager } from '../services/JavaManager';
import { FileSystemManager } from '../services/FileSystemManager';
import { installerService } from '../services/InstallerService';
import { getServers, saveServer, getServer, removeServer, updateServer, DATA_PATHS } from '../services/ServerService';


const util = require('minecraft-server-util');
import multer from 'multer';
import net from 'net';

// Configure Multer (Generic storage, destination handled in route or moved after)
const upload = multer({ dest: path.join(path.dirname(DATA_PATHS.SERVERS_ROOT), 'temp_uploads') });

const router = express.Router();

import { analyticsService } from '../services/AnalyticsService';

// Query Server Status (Real Ping)
router.get('/:id/stats', async (req, res) => {
    const { id } = req.params;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const stats = await processManager.getServerStats(id);
    const cached = processManager.getCachedStatus(id);
    const logs = processManager.getLogs(id);

    // Prepare metrics for analysis
    const metrics = {
        cpu: stats.cpu || 0,
        memory: stats.memory || 0, // Now returned in MB from ProcessManager
        allocated: (server.ram || 2) * 1024, // GB -> MB
        tps: parseFloat(cached.tps || "20.00"),
        uptime: cached.uptime || 0
    };

    const analysis = analyticsService.analyze(metrics, logs, cached.status || 'OFFLINE');

    res.json({ ...stats, analysis });
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
        status: cached.status || (processManager.isRunning(id) ? 'STARTING' : 'OFFLINE'),
        uptime: processManager.getUptime(id),
        tps: processManager.getTPS(id),
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
                     processManager.updateCachedStatus(id, { online: false, players: 0, status: 'OFFLINE' });
                     
                     // Force persistence correction
                     if (server.status === 'ONLINE') {
                         server.status = 'OFFLINE';
                         saveServer(server);
                     }
                     return; // Abort further checks
                }

                // Standard Status Check
                const status = await util.status('127.0.0.1', server.port, { timeout: 2000 });
                console.log(`[Query Debug] ${id} (Port ${server.port}) -> Online: ${status.players.online}/${status.players.max}`);
                
                // GHOST PREVENTION:
                // If the panel thinks the server is stopped (!isRunning), but we found it online, 
                // it means we lost the process handle (Ghost/Orphan).
                // DO NOT mark it as ONLINE in the panel, otherwise we get "Flapping" (List says Offline, Query says Online).
                // The user must kill the ghost manually (or we need a kill-by-port feature).
                if (!processManager.isRunning(id)) {
                    console.warn(`[Query] ${id} Ghost Detected (Process not tracked but Port ${server.port} active). Keeping status OFFLINE.`);
                    
                    // We can optionally mark it as 'GHOST' if the UI supported it, but for now strict OFFLINE is safer.
                    processManager.updateCachedStatus(id, { online: false, status: 'OFFLINE' });
                    return; 
                }

                processManager.updateCachedStatus(id, {
                    online: true,
                    players: status.players.online,
                    playerList: status.players.sample ? status.players.sample.map((p: any) => p.name) : [], 
                    maxPlayers: status.players.max,
                    latency: status.roundTripLatency,
                    version: status.version.name
                });

                // Reconciliation: If DB thinks it's offline/starting but we found it online
                if (server.status !== 'ONLINE') {
                    server.status = 'ONLINE';
                    saveServer(server);
                }
            } catch (e) {
                // Try UDP Query as secondary
                try {
                    const q = await util.queryFull('127.0.0.1', server.port, { timeout: 1500 });
                    
                    if (!processManager.isRunning(id)) {
                        console.warn(`[Query] ${id} Ghost Detected (UDP). Keeping status OFFLINE.`);
                        processManager.updateCachedStatus(id, { online: false, status: 'OFFLINE' });
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
                        processManager.updateCachedStatus(id, { online: false });
                        
                        // Only mark as OFFLINE if the process is actually dead locally
                        if (!processManager.isRunning(id)) {
                             // CLEAR PERSISTENT START TIME IF GHOST
                            if (server.startTime || server.status !== 'OFFLINE') {
                                delete server.startTime;
                                server.status = 'OFFLINE';
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
router.get('/', (req, res) => {
    const servers = getServers();
    // Enhance with status
    const enhanced = servers.map((s: any) => {
        const isRunning = processManager.isRunning(s.id);
        const cached = processManager.getCachedStatus(s.id);
        return {
            ...s,
            // Trust ProcessManager's state machine (STARTING vs ONLINE)
            status: isRunning ? (cached.status || 'STARTING') : 'OFFLINE' 
        };
    });
    res.json(enhanced);
});

// Get Server Logs
router.get('/:id/logs', async (req, res) => {
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
                 try {
                     const content = await fs.readFile(logPath, 'utf8');
                     // Split by lines and take last 200 to mimic tail
                     const fileLogs = content.split(/\r?\n/);
                     logs = fileLogs.slice(-200);
                 } catch (e) {
                     console.warn(`[API] Failed to read fallback logs for ${id}:`, e);
                 }
             }
        }
    }

    res.json(logs);
});

// Get Crash Report
router.get('/:id/crash-report', (req, res) => {
    const { id } = req.params;
    const logs = processManager.getLogs(id);
    const analysis = analyticsService.analyzeCrash(logs);
    res.json({ analysis, logs: logs.slice(-50) });
});

// Create Server
router.post('/', async (req, res) => {
    const config = req.body;
    const id = `local-${Date.now()}`;
    const serverDir = path.join(DATA_PATHS.SERVERS_ROOT, id);
    
    await fs.ensureDir(serverDir);
    
    const newServer = {
        ...config,
        id,
        workingDirectory: serverDir,
        status: 'OFFLINE'
    };
    
    saveServer(newServer);
    
    // Start File Watcher
    const { fileWatcherService } = await import('../services/FileWatcherService');
    fileWatcherService.watchServer(id, serverDir);

    res.json(newServer);
});


// Start Server
router.post('/:id/start', async (req, res) => {
    const { id } = req.params;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    
    // Respond immediately to prevent timeout
    res.json({ success: true, status: 'STARTING' });

    // Run startup sequence in background
    (async () => {
        try {
            console.log(`[Server:${id}] Initiating startup sequence via StartupManager...`);
            
            const { startupManager } = await import('../services/StartupManager');

            // Record start time for persistence (pre-emptively)
            server.status = 'STARTING';
            server.startTime = Date.now();
            saveServer(server);

            await startupManager.startServer(server, (updatedServer) => {
                 saveServer(updatedServer);
            });

        } catch (e: any) {
            console.error(`[Server:${id}] Startup failed:`, e);
            // Revert status
            server.status = 'OFFLINE';
            delete server.startTime;
            saveServer(server);
        }
    })();
});




// Stop Server
router.post('/:id/stop', (req, res) => {
    const { id } = req.params;
    const { force } = req.body;
    const server = getServer(id);
    
    try {
        processManager.stopServer(id, !!force);
        
        if (server) {
            delete server.startTime;
            server.status = 'OFFLINE'; // Optimistic update, actual status event follows
            saveServer(server);
        }

        res.json({ success: true, status: 'STOPPING' });
    } catch (e: any) {
        if (e.message.includes('Server is initializing')) {
            return res.status(423).json({ // 423 Locked
                error: 'Startup Protection: Server is initializing.',
                message: e.message,
                softError: true // Hint to UI to show "Force Stop" option
            });
        }
        res.status(500).json({ error: e.message });
    }
});

// Delete Server
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    
    // Stop if running
    processManager.killServer(id);
    
    // Remove files
    await fs.remove(server.workingDirectory);
    
    // Remove from DB
    removeServer(id);
    
    // Unwatch Files
    const { fileWatcherService } = await import('../services/FileWatcherService');
    fileWatcherService.unwatchServer(id);

    res.json({ success: true });
});

// Update Server Config
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    try {
        const updatedServer = await updateServer(id, updates);
        res.json(updatedServer);
    } catch (e: any) {
        if (e.message === 'Server not found') return res.status(404).json({ error: 'Server not found' });
        res.status(500).json({ error: e.message });
    }
});

// Get File Content
router.get('/:id/files/content', async (req, res) => {
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
        res.status(500).json({ error: e.message });
    }
});

// Save File Content
router.post('/:id/files/content', async (req, res) => {
    const { id } = req.params;
    const { path: relativePath, content } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.writeFile(relativePath, content);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create Folder
router.post('/:id/files/folder', async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.createDirectory(relativePath);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get Files
router.get('/:id/files', async (req, res) => {
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

// Delete Files (Accepts array of paths in body)
router.delete('/:id/files', async (req, res) => {
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
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Move Files
router.post('/:id/files/move', async (req, res) => {
    const { id } = req.params;
    const { source, dest } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.move(source, dest);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Copy Files
router.post('/:id/files/copy', async (req, res) => {
    const { id } = req.params;
    const { source, dest } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.copy(source, dest);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Compress Files
router.post('/:id/files/compress', async (req, res) => {
    const { id } = req.params;
    const { paths, name } = req.body; // paths: string[], name: archive filename
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.compress(paths, name);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Download File
router.get('/:id/files/download', async (req, res) => {
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
        } else {
             res.status(404).json({ error: 'File not found' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Upload File to Server Directory
router.post('/:id/files/upload', upload.single('file'), async (req, res) => {
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
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Extract ZIP file
// Extract ZIP file (Smart Extract)
router.post('/:id/files/extract', async (req, res) => {
    const { id } = req.params;
    const { filePath } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!filePath || !filePath.endsWith('.zip')) return res.status(400).json({ error: 'Invalid ZIP file' });

    try {
        const extract = (await import('extract-zip')).default;
        const zipPath = path.join(server.workingDirectory, filePath);
        
        if (!(await fs.pathExists(zipPath))) {
            return res.status(404).json({ error: 'ZIP file not found' });
        }

        // 1. Extract to a temp directory
        const tempDir = path.join(server.workingDirectory, `.temp_extract_${Date.now()}`);
        await fs.ensureDir(tempDir);
        await extract(zipPath, { dir: tempDir });

        // 2. Smart Detection
        const files = await fs.readdir(tempDir);
        const targetDir = path.dirname(zipPath);

        if (files.length === 1) {
             const nestedPath = path.join(tempDir, files[0]);
             const stats = await fs.stat(nestedPath);
             if (stats.isDirectory()) {
                 // Smart: It's a single folder wrapper. Move CONTENTS up.
                 await fs.copy(nestedPath, targetDir, { overwrite: true });
                 console.log(`[SmartExtract] Flattened nested folder: ${files[0]}`);
             } else {
                 // Single file, just move it
                 await fs.move(nestedPath, path.join(targetDir, files[0]), { overwrite: true });
             }
        } else {
             // Standard: Move all items
             await fs.copy(tempDir, targetDir, { overwrite: true });
        }

        // 3. Cleanup
        await fs.remove(tempDir);
        
        res.json({ success: true, message: 'File extracted successfully' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});




// Install Server Software
router.post('/:id/install', async (req, res) => {
    const { id } = req.params;
    const { type, version, build, url } = req.body; // type: 'paper' | 'modpack'
    const server = getServer(id);

    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {

        if (type === 'paper') {
            await installerService.installPaper(server.workingDirectory, version || '1.21.11', build);
        } else if (type === 'purpur') {
            await installerService.installPurpur(server.workingDirectory, version || '1.21.1', build);
        } else if (type === 'vanilla') {
            await installerService.installVanilla(server.workingDirectory, version || '1.21.11');
        } else if (type === 'fabric') {
            await installerService.installFabric(server.workingDirectory, version || '1.21.11');
        } else if (type === 'modpack' && url) {
            await installerService.installModpackFromZip(server.workingDirectory, url);
        } else if (type === 'forge') {
            const executable = await installerService.installForge(server.workingDirectory, version || '1.21.11', (req.body as any).localModpack);
            server.executable = executable;
            saveServer(server);
        } else if (type === 'neoforge') {
            const executable = await installerService.installNeoForge(server.workingDirectory, version || '1.21.1');
            server.executable = executable;
            server.javaVersion = 'Java 21'; // NeoForge usually enforces this
            saveServer(server);
        } else if (type === 'spigot') {
            await installerService.installSpigot(server.workingDirectory, version || '1.21.11');
        } else {
            return res.status(400).json({ error: 'Invalid installation type or missing parameters' });
        }

        // --- Post-Install: Check Advanced Flags ---
        if (server.advancedFlags) {
            if (server.advancedFlags.installSpark) {
                // Spark only works on Spigot/Paper/Fabric/Forge/NeoForge
                // We'll assume the user picked a compatible version or understands it.
                // Currently only downloading Bukkit version (works on Paper/Spigot)
                // TODO: Add Fabric support if needed, but for now just Bukkit.
                // TODO: Add Fabric support if needed, but for now just Bukkit.
                if (type === 'paper' || type === 'purpur' || type === 'spigot') {
                     await installerService.installSpark(server.workingDirectory);
                }
            }

            if (server.advancedFlags.proxySupport) {
                await installerService.configureProxy(server.workingDirectory);
            }
        }

        // --- Post-Install: Online Mode (Crack Server) ---
        // If explicitly set to false, we must update server.properties, otherwise default (true) is fine.
        if (server.onlineMode === false) {
             const propsPath = path.join(server.workingDirectory, 'server.properties');
             // If file doesn't exist (it usually doesn't yet on fresh install unless installPaper etc created it)
             // We create it.
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

        res.json({ success: true, message: 'Installation started' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

import { scheduleService } from '../services/ScheduleService';

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
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== BACKUP ROUTES ====================

import { backupService } from '../services/BackupService';

// Toggle Lock
router.post('/:id/backups/:backupId/lock', async (req, res) => {
    const { id, backupId } = req.params;
    try {
        const isLocked = await backupService.toggleLock(id, backupId);
        res.json({ success: true, locked: isLocked });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create backup
router.post('/:id/backups', async (req, res) => {
    const { id } = req.params;
    const { description } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        const backup = await backupService.createBackup(server.workingDirectory, id, description);
        res.json(backup);
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
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        // Stop server if running
        if (processManager.isRunning(id)) {
            processManager.stopServer(id);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for stop
        }

        await backupService.restoreBackup(server.workingDirectory, id, backupId);
        res.json({ success: true, message: 'Backup restored successfully' });
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

export default router;


// ==================== PLAYER ROUTES ====================

import { playerService } from '../services/PlayerService';

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

// Add Player (Op, Whitelist, Ban)
router.post('/:id/players/:listType', async (req, res) => {
    const { id, listType } = req.params;
    const { identifier } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!identifier) return res.status(400).json({ error: 'Identifier is required' });

    try {
        const result = await playerService.addPlayer(id, listType as any, identifier);
        res.json(result);
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
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Kick Player
router.post('/:id/players/kick', async (req, res) => {
    const { id } = req.params;
    const { name, reason } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    try {
        await playerService.kickPlayer(id, name, reason);
        res.json({ success: true, message: `Kicked ${name}` });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


