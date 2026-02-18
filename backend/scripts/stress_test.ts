import path from 'path';
import fs from 'fs-extra';
import { serverRepository } from '../src/storage/ServerRepository';
import { processManager } from '../src/features/processes/ProcessManager';
import { logger } from '../src/utils/logger';
import { ServerConfig } from '@shared/types';
import si from 'systeminformation';

const STRESS_DIR = path.join(process.cwd(), 'temp_stress');
const SERVER_COUNT = 12;
const TEST_DURATION_MS = 60000; // 1 minute

async function setup() {
    logger.info('=== Stress Test: Setup ===');
    await fs.ensureDir(STRESS_DIR);
    
    // Create a dummy node script that simulates a server
    const dummyScript = `
const net = require('net');
const port = process.env.SERVER_PORT || 25565;
const server = net.createServer((socket) => {
    socket.write('Hello stress test!\\n');
    socket.end();
});

server.listen(port, () => {
    console.log('Listening on ' + port);
    console.log('Done (0.5s)! For help, type "help"');
});

// Stay alive
setInterval(() => {}, 1000);
    `;
    await fs.writeFile(path.join(STRESS_DIR, 'dummy_server.js'), dummyScript);
    
    // Create server configs
    for (let i = 1; i <= SERVER_COUNT; i++) {
        const id = `stress-server-${i}`;
        const port = 30000 + i;
        const serverDir = path.join(STRESS_DIR, id);
        await fs.ensureDir(serverDir);
        
        const config: any = {
            id,
            name: `Stress Server ${i}`,
            software: 'Java', // Use Java to trigger standard "Done" detection
            version: '1.20',
            port,
            ram: 1,
            autoStart: false,
            status: 'OFFLINE',
            workingDirectory: serverDir,
            executable: 'dummy_server.js',
            executionCommand: `node ${path.join(STRESS_DIR, 'dummy_server.js')}`,
            onlineMode: false,
            maxPlayers: 20,
            motd: `Stress Test Server ${i}`
        };
        
        serverRepository.create(config);
        logger.info(`Created stress server: ${id} on port ${port}`);
    }
}

async function runTest() {
    logger.info('=== Stress Test: Execution ===');
    const servers = serverRepository.findAll().filter(s => s.id.startsWith('stress-server-'));
    
    logger.info(`Mass starting ${servers.length} servers...`);
    const startTime = Date.now();
    
    // Parallel Start
    const startPromises = servers.map(s => {
        return processManager.startServer(s.id, s.executionCommand!, s.workingDirectory, { 
            SERVER_PORT: s.port.toString(),
            executionEngine: 'native'
        });
    });
    
    await Promise.all(startPromises);
    logger.success(`All ${servers.length} start commands issued.`);
    
    // Monitor
    let allOnline = false;
    const monitorInterval = setInterval(async () => {
        const load = await si.currentLoad();
        const mem = process.memoryUsage();
        const onlineCount = servers.filter(s => processManager.getCachedStatus(s.id).status === 'ONLINE').length;
        
        logger.info(`[MONITOR] Online: ${onlineCount}/${servers.length} | Backend RAM: ${Math.round(mem.rss / 1024 / 1024)}MB | System CPU: ${Math.round(load.currentLoad)}%`);
        
        if (onlineCount === servers.length && !allOnline) {
            allOnline = true;
            logger.success(`=== PERFORMANCE MILESTONE: All servers reached ONLINE in ${((Date.now() - startTime) / 1000).toFixed(2)}s ===`);
        }
    }, 2000);
    
    await new Promise(r => setTimeout(r, TEST_DURATION_MS));
    clearInterval(monitorInterval);
}

async function cleanup() {
    logger.info('=== Stress Test: Cleanup ===');
    const servers = serverRepository.findAll().filter(s => s.id.startsWith('stress-server-'));
    
    for (const s of servers) {
        try {
            await processManager.stopServer(s.id, true);
            serverRepository.delete(s.id);
        } catch (e) {
            logger.warn(`Failed to cleanup ${s.id}: ${e}`);
        }
    }
    
    await fs.remove(STRESS_DIR);
    logger.success('Stress test cleanup complete.');
}

async function main() {
    try {
        await setup();
        await runTest();
    } catch (e) {
        logger.error(`Stress test failed: ${e}`);
    } finally {
        await cleanup();
    }
}

main();
