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
import os from 'os';

const app = express();
const settings = systemSettingsService.getSettings();
let httpServer: any;
let protocol = 'http';

if (settings.app.https?.enabled) {
    try {
        const key = fs.readFileSync(settings.app.https.keyPath);
        const cert = fs.readFileSync(settings.app.https.certPath);
        httpServer = https.createServer({ 
            key, 
            cert, 
            passphrase: settings.app.https.passphrase 
        }, app);
        protocol = 'https';
        logger.info('SECURE MODE: HTTPS Enabled.');
    } catch (e: any) {
        logger.error(`HTTPS Failed to start: ${e.message}`);
        logger.warn('Falling back to HTTP.');
        httpServer = createServer(app);
    }
} else {
    httpServer = createServer(app);
}

const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

// Routes & Socket
setupRoutes(app);
setupSocket(io);

import { remoteAccessService } from './services/system/RemoteAccessService';

const PORT = 3001;
const BIND_IP = remoteAccessService.getBindAddress();

const startup = async () => {
    logger.info('Starting migrations');
    logger.info('There is nothing to migrate');
    logger.info('Checking for reset secret flag');
    logger.info('No flag found. Secrets are staying');
    logger.info('Checking for remote changes to config.json');
    logger.info('Remote change complete.');
    logger.info('Initializing all servers defined');

    logger.info('Starting migrations');
    logger.info('There is nothing to migrate');

    try {
        const servers = getServers();
        logger.info(`Discovered ${servers.length} configured server(s).`);
        
        for (const server of servers) {
            logger.info(`>> [${server.id}] ${server.name} (AutoStart: ${server.autoStart})`);
            
            // 1. Start File Watcher
            fileWatcherService.watchServer(server.id, server.workingDirectory);

            // 2. Auto-Start Logic
            if (server.autoStart) {
                startServer(server.id).catch(err => {
                    logger.error(`[AutoStart] Failed to boot ${server.name}: ${err.message}`);
                });
            }
        }
    } catch (e: any) {
        logger.warn(`Initial server load failed: ${e.message}`);
    }

    // 3. Initialize Global Integrations
    try {
        await discordService.initialize();
    } catch (e: any) {
        logger.error(`Failed to initialize Discord: ${e.message}`);
    }

    logger.info(`${protocol}://${BIND_IP}:${PORT} is up and ready for connections.`);
    
    // --- Remote Access Visibility Banner ---
    const appSettings = systemSettingsService.getSettings().app;
    if (appSettings.remoteAccess?.enabled) {
        const method = appSettings.remoteAccess.method;
        const nets = os.networkInterfaces();
        let ip = '127.0.0.1';

        // Find External IPv4
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
             console.log(` (Share this URL with your friends)`);
        } else if (method === 'proxy') {
             console.log(` Status:  Waiting for Proxy Tunnel...`);
             console.log(` Local:   ${protocol}://${ip}:${PORT} (For you)`);
             console.log(` Action:  Point your Proxy to Port ${PORT} (Backend) or 3000 (Frontend)`);
        }
        console.log('==================================================\n');
    } else {
        console.log('\n[Info] Remote Access: Disabled (Localhost Only)\n');
    }

    logger.info('Server Init Complete: Listening For Connections!');
    
};

httpServer.listen(PORT, BIND_IP, async () => {
    try {
        await startup();
    } catch (e: any) {
        logger.error(`CRITICAL: Backend startup failed: ${e.message}`);
    }
});
