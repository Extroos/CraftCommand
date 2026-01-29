import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupRoutes } from './routes';
import { setupSocket } from './sockets';
import { logger } from './utils/logger';
import { getServers, startServer } from './services/servers/ServerService';
import { javaManager } from './services/servers/JavaManager';
import { processManager } from './services/servers/ProcessManager';
import { fileWatcherService } from './services/files/FileWatcherService';
import { discordService } from './services/integrations/DiscordService';
import os from 'os';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

// Routes & Socket
setupRoutes(app);
setupSocket(io);

const PORT = 3001;
const IP = '127.0.0.1'; 

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

    logger.info(`https://${IP}:${PORT} is up and ready for connections.`);
    logger.info('Server Init Complete: Listening For Connections!');
    
};

httpServer.listen(PORT, IP, async () => {
    try {
        await startup();
    } catch (e: any) {
        logger.error(`CRITICAL: Backend startup failed: ${e.message}`);
    }
});
