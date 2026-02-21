import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import https from 'https';
import fs from 'fs';
import { Server } from 'socket.io';
import { setupRoutes } from './routes';
import { setupSocket } from './sockets';

// ... (imports)

// Note: We need to define routes AFTER io is created relative to the original code flow? 
// Actually server.ts calls setupRoutes later.
// But we need to inject IO first.

import { logger } from './utils/logger';
import { getServers, startServer, cleanupInstallState } from './features/servers/ServerService';
import { javaManager } from './features/processes/JavaManager';
import { processManager } from './features/processes/ProcessManager';
import { fileWatcherService } from './features/files/FileWatcherService';
import { discordService } from './features/integrations/DiscordService';
import { systemSettingsService } from './features/system/SystemSettingsService';
import { autoHealingService } from './features/servers/AutoHealingService';
import { updateService } from './features/system/UpdateService';
import { migrationService } from './features/system/MigrationService';
import { errorHandler } from './middleware/errorHandler';
import os from 'os';

import { sslUtils } from './utils/ssl';
import { setSystemStatus, protocol, sslStatus } from './features/system/SystemStatusState';

const app = express();
const settings = systemSettingsService.getSettings();
let httpServer: any;

const initHttpServer = async () => {
    if (settings.app.https?.enabled && settings.app.https.mode !== 'bridge') {
        try {
            const { certPath, keyPath, isSelfSigned } = await sslUtils.getOrCreateCertificates(
                settings.app.https.certPath,
                settings.app.https.keyPath
            );
            
            const key = fs.readFileSync(keyPath);
            const cert = fs.readFileSync(certPath);
            
            httpServer = https.createServer({ 
                key, 
                cert, 
                passphrase: settings.app.https.passphrase 
            }, app);
            
            const currentProtocol = 'https';
            const currentSslStatus = isSelfSigned ? 'SELF_SIGNED' : 'VALID';
            setSystemStatus(currentProtocol, currentSslStatus);
            logger.info(`SECURE MODE: HTTPS Enabled (${currentSslStatus}).`);
        } catch (e: any) {
            logger.error(`HTTPS Failed to start: ${e.message}`);
            logger.warn('Falling back to HTTP.');
            httpServer = createServer(app);
            setSystemStatus('http', 'NONE');
        }
    } else {
        httpServer = createServer(app);
        setSystemStatus('http', 'NONE');
    }
};

import { remoteAccessService } from './features/system/RemoteAccessService';

const PORT = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT) : 3001;
const BIND_IP = remoteAccessService.getBindAddress();

const startup = async () => {
    // Ensure temp dirs
    const { DATA_PATHS } = await import('./constants');
    await import('fs-extra').then(f => f.ensureDir(DATA_PATHS.TEMP_UPLOADS_DIR));
    await import('fs-extra').then(f => f.ensureDir(DATA_PATHS.SERVERS_ROOT));
    await import('fs-extra').then(f => f.ensureDir(DATA_PATHS.BACKGROUNDS_UPLOADS_DIR));

    logger.info('Starting migrations...');
    await migrationService.runMigrations();
    logger.info('Initializing system components...');

    // 0. Self-Healing: Cleanup stuck installation states (Phase 53.3)
    cleanupInstallState();

    try {
        const servers = getServers();
        logger.info(`Discovered ${servers.length} configured server(s).`);
        
        for (const server of servers) {
            logger.info(`>> [${server.id}] ${server.name} (AutoStart: ${server.autoStart})`);
            
            // 1. Start File Watcher
            fileWatcherService.watchServer(server.id, server.workingDirectory);

            // 2. Auto-Start Logic (startDelay is handled internally by StartupManager)
            if (server.autoStart) {
                startServer(server.id).catch(err => {
                    logger.error(`[AutoStart] Failed to boot ${server.name}: ${err.message}`);
                });
            }
        }
    } catch (e: any) {
        logger.warn(`Initial server load failed: ${e.message}`);
    }

    // Initialize Integrations & Auto-Healing
    try {
        await discordService.initialize();
        await remoteAccessService.initialize();
        autoHealingService.initialize();
        updateService.initialize();
        
        // Start Embedded Agent (if enabled)
        const { localAgentManager } = await import('./features/nodes/LocalAgentManager');
        localAgentManager.initialize();
    } catch (e: any) {
        logger.error(`Service initialization failed: ${e.message}`);
    }

    logger.info(`${protocol}://${BIND_IP}:${PORT} is up and ready for connections.`);
    
    // --- Remote Access Visibility Banner ---
    const appSettings = systemSettingsService.getSettings().app;
    if (appSettings.remoteAccess?.enabled) {
        const method = appSettings.remoteAccess.method;
        const nets = os.networkInterfaces();
        let ip = '127.0.0.1';

        for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
                if (net.family === 'IPv4' && !net.internal) {
                    ip = net.address;
                    break;
                }
            }
        }

        console.log('\n==================================================');
        console.log('       REMOTE ACCESS ENABLED                      ');
        console.log('==================================================');
        console.log(` Mode:    ${method?.toUpperCase() || 'UNKNOWN'}`);
        if (method === 'vpn' || method === 'direct') {
             if (appSettings.https?.enabled && appSettings.https.mode === 'bridge' && appSettings.https.domain) {
                console.log(` Connect: https://${appSettings.https.domain}`);
                console.log(` (Internal: http://${ip}:${PORT})`);
             } else {
                console.log(` Connect: ${protocol}://${ip}:${PORT}`);
             }
        } else if (method === 'proxy') {
             console.log(` Local:   ${protocol}://${ip}:${PORT}`);
             console.log(` Action:  Point your Proxy to Port ${PORT}`);
        }
        console.log('==================================================\n');
    }

    logger.info('Server Init Complete: Listening For Connections!');
};

const startMain = async () => {
    await initHttpServer();

    const io = new Server(httpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] }
    });

    app.use(cors());
    app.use(express.json());

    // Inject IO for routes
    app.use((req, res, next) => {
        (req as any).io = io;
        next();
    });
    
    // Serve Static Uploads
    const { DATA_PATHS } = require('./constants');
    app.use('/uploads', express.static(DATA_PATHS.UPLOADS_ROOT));

    // --- Added: System Health/Status Endpoint ---
    app.get('/api/system/status', (req, res) => {
        res.json({
            protocol,
            sslStatus,
            port: PORT,
            uptime: process.uptime(),
            platform: process.platform,
            arch: process.arch
        });
    });

    setupRoutes(app);

    // Serve Web Dashboard (SPA)
    const { WEB_ROOT } = require('./constants');
    if (fs.existsSync(WEB_ROOT) && fs.existsSync(path.join(WEB_ROOT, 'index.html'))) {
        logger.info(`[Server] Serving Web Dashboard from: ${WEB_ROOT}`);
        app.use(express.static(WEB_ROOT));
        app.get('*', (req, res) => {
            res.sendFile(path.join(WEB_ROOT, 'index.html'));
        });
    } else {
        if (process.env.NODE_ENV !== 'development') {
            logger.warn('[Server] Web Dashboard index.html not found. Serving Recovery UI.');
        }
        app.get('*', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>CraftCommand Recovery</title>
                    <style>
                        body { font-family: sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .card { background: #1e293b; padding: 2rem; border-radius: 1rem; text-align: center; border: 1px solid #334155; max-width: 400px; }
                        h1 { color: #f43f5e; }
                        button { background: #3b82f6; border: none; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-weight: bold; }
                        button:hover { background: #2563eb; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>UI Component Missing</h1>
                        <p>The Web Dashboard assets (v1.11.3) were not found or are currently being updated.</p>
                        <p>This usually occurs after a partial update or a manual file deletion.</p>
                        <button onclick="runUpdate()">Repair Installation</button>
                        <p id="status" style="margin-top: 1rem; font-size: 0.9rem; color: #94a3b8;"></p>
                    </div>
                    <script>
                        async function runUpdate() {
                             const btn = document.querySelector('button');
                             const status = document.getElementById('status');
                             btn.disabled = true;
                             status.innerText = 'Initializing Repair...';
                             
                             // We recommend running the local launcher for total integrity
                             status.innerText = 'Please run "run_CraftCommand.bat" or "apply_update.ps1" to restore full system integrity.';
                        }
                    </script>
                </body>
                </html>
            `);
        });
    }

    // Global Error Handler
    app.use(errorHandler);

    setupSocket(io);

    httpServer.listen(PORT, BIND_IP, async () => {
        try {
            await startup();
        } catch (e: any) {
            logger.error(`CRITICAL: Backend startup failed: ${e.message}`);
        }
    });

    // --- GRACEFUL SHUTDOWN LOGIC ---
    const shutdown = async (signal: string) => {
        logger.info(`\n[System] Received ${signal}. Initiating graceful shutdown...`);
        
        try {
            // 1. Stop accepting new connections (if we had a way to stop express, but httpServer.close is async)
            if (httpServer) {
                httpServer.close(() => {
                    logger.info('[System] HTTP server closed.');
                });
            }

            // 2. Stop Integration Services
            await discordService.shutdown();
            
            // 3. Stop internal loops/watchers
            updateService.shutdown();
            fileWatcherService.shutdown();

            // 4. Kill Child Processes (Critical: Minecraft Servers)
            await processManager.shutdown();

            logger.success('[System] Shutdown complete. Goodbye!');
            process.exit(0);
        } catch (e: any) {
            logger.error(`[System] Error during shutdown: ${e.message}`);
            process.exit(1);
        }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startMain();

