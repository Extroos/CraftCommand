import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import https from 'https';
import fs from 'fs';
import { Server } from 'socket.io';
import { setupRoutes } from './routes';
import { setupSocket } from './sockets';
import { logger } from './utils/logger';
import { getServers, startServer } from './services/servers/ServerService';
import { javaManager } from './services/servers/JavaManager';
import { processManager } from './services/servers/ProcessManager';
import { fileWatcherService } from './services/files/FileWatcherService';
import { discordService } from './services/integrations/DiscordService';
import { systemSettingsService } from './services/system/SystemSettingsService';
import { autoHealingService } from './services/servers/AutoHealingService';
import os from 'os';

import { sslUtils } from './utils/ssl';

const app = express();
const settings = systemSettingsService.getSettings();
let httpServer: any;
let protocol = 'http';
let sslStatus: 'VALID' | 'SELF_SIGNED' | 'NONE' = 'NONE';

const initHttpServer = async () => {
    if (settings.app.https?.enabled) {
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
            
            protocol = 'https';
            sslStatus = isSelfSigned ? 'SELF_SIGNED' : 'VALID';
            logger.info(`SECURE MODE: HTTPS Enabled (${sslStatus}).`);
        } catch (e: any) {
            logger.error(`HTTPS Failed to start: ${e.message}`);
            logger.warn('Falling back to HTTP.');
            httpServer = createServer(app);
            sslStatus = 'NONE';
        }
    } else {
        httpServer = createServer(app);
    }
};

import { remoteAccessService } from './services/system/RemoteAccessService';

const PORT = 3001;
const BIND_IP = remoteAccessService.getBindAddress();

const startup = async () => {
    logger.info('Starting migrations...');
    logger.info('Initializing system components...');

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
        autoHealingService.initialize();
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
             console.log(` Connect: ${protocol}://${ip}:${PORT}`);
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
    setupSocket(io);

    httpServer.listen(PORT, BIND_IP, async () => {
        try {
            await startup();
        } catch (e: any) {
            logger.error(`CRITICAL: Backend startup failed: ${e.message}`);
        }
    });
};

startMain();
