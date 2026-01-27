import fs from 'fs-extra';
import path from 'path';
import net from 'net';
import { logger } from '../utils/logger';
import { javaManager } from './JavaManager';
import { processManager } from './ProcessManager';

const DATA_DIR = path.join(__dirname, '../../data');
const SERVERS_FILE = path.join(DATA_DIR, 'servers.json');
const SERVERS_ROOT = path.join(process.cwd(), 'minecraft_servers');

const operationLocks = new Set<string>();

const acquireLock = (serverId: string, operation: string) => {
    if (operationLocks.has(serverId)) {
        throw new Error(`An operation is already in progress for this server.`);
    }
    operationLocks.add(serverId);
    logger.info(`[Lock] Acquired for ${serverId} (${operation})`);
};

const releaseLock = (serverId: string) => {
    operationLocks.delete(serverId);
    logger.info(`[Lock] Released for ${serverId}`);
};

// Ensure initialization
fs.ensureDirSync(DATA_DIR);
if (!fs.existsSync(SERVERS_FILE)) {
    fs.writeJSONSync(SERVERS_FILE, []);
}
fs.ensureDirSync(SERVERS_ROOT);

export const getServers = () => {
    try {
        const data = fs.readJSONSync(SERVERS_FILE);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error('Failed to read servers.json:', e);
        return [];
    }
};

export const getServer = (id: string) => {
    const servers = getServers();
    return servers.find((s: any) => s.id === id);
};

export const saveServer = (server: any) => {
    const servers = getServers();
    const index = servers.findIndex((s: any) => s.id === server.id);
    
    if (index !== -1) {
        servers[index] = server;
    } else {
        servers.push(server);
    }
    
    fs.writeJSONSync(SERVERS_FILE, servers);
};

import { installerService } from './InstallerService';

export const removeServer = (id: string) => {
    const servers = getServers();
    const filtered = servers.filter((s: any) => s.id !== id);
    fs.writeJSONSync(SERVERS_FILE, filtered);
};

export const updateServer = async (id: string, updates: any) => {
    let servers = getServers();
    const index = servers.findIndex((s: any) => s.id === id);
    
    if (index === -1) throw new Error('Server not found');
    
    const oldServer = servers[index];
    const newServer = { ...oldServer, ...updates };

    // --- SIDE EFFECTS ---
    // Check for Advanced Flag Toggles
    if (updates.advancedFlags) {
        
        // 1. Proxy Support Enabled
        if (!oldServer.advancedFlags?.proxySupport && newServer.advancedFlags.proxySupport) {
            console.log(`[Server:${id}] Enabling Proxy Support (Side Effect)`);
            await installerService.configureProxy(newServer.workingDirectory);
        }
        
        // 2. Proxy Support Disabled (Rollback attempt)
        if (oldServer.advancedFlags?.proxySupport && !newServer.advancedFlags.proxySupport) {
            console.log(`[Server:${id}] Disabling Proxy Support (Side Effect)`);
             await installerService.disableProxy(newServer.workingDirectory);
        }

        // 3. Spark Install
        if (!oldServer.advancedFlags?.installSpark && newServer.advancedFlags.installSpark) {
            console.log(`[Server:${id}] Installing Spark (Side Effect)`);
            await installerService.installSpark(newServer.workingDirectory);
        }
    }

    // 4. Online Mode Toggle
    if (updates.onlineMode !== undefined && updates.onlineMode !== oldServer.onlineMode) {
        console.log(`[Server:${id}] Toggling Online Mode to ${updates.onlineMode}`);
        const propsPath = path.join(newServer.workingDirectory, 'server.properties');
        if (await fs.pathExists(propsPath)) {
            let content = await fs.readFile(propsPath, 'utf8');
            const modeStr = `online-mode=${updates.onlineMode}`;
            if (content.includes('online-mode=')) {
                content = content.replace(/online-mode=(true|false)/, modeStr);
            } else {
                content += `\n${modeStr}`;
            }
            await fs.writeFile(propsPath, content);
        }
    }

    servers[index] = newServer;
    fs.writeJSONSync(SERVERS_FILE, servers);
    return newServer;
};

export const startServer = async (id: string, force: boolean = false) => {
    const server = getServer(id);
    if (!server) throw new Error('Server not found');

    if (processManager.isRunning(id) && !force) {
        throw new Error('Server is already running');
    }

    acquireLock(id, 'START');

    try {
        const { port, workingDirectory, javaVersion, ram, executable, advancedFlags } = server;
        
        // 1. Check if port is in use (by an external process)
        const isPortInUse = await new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(200);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('error', () => { socket.destroy(); resolve(false); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
            socket.connect(port, '127.0.0.1');
        });

        if (isPortInUse) {
            const cleaned = await processManager.findAndKillGhostProcess(port, workingDirectory);
            if (!cleaned) {
                throw new Error(`Port ${port} is already in use by another application. Please verify no orphaned Java processes are running.`);
            }
            // Wait a moment for OS to release port
            await new Promise(r => setTimeout(r, 1000));
        }

        // 2. Resolve Java
        const javaPath = await javaManager.ensureJava(javaVersion || 'Java 17');
        const jarFile = executable || 'server.jar';
        
        // 3. Build Command
        let cmd;
        if (jarFile.endsWith('.bat')) {
            cmd = `cmd /c "${path.join(workingDirectory, jarFile)}" nogui`;
        } else if (jarFile.endsWith('.sh')) {
            cmd = path.join(workingDirectory, jarFile);
        } else {
            // JVM Flags
            let flags = `-Xmx${ram}G`;
            if (advancedFlags?.aikarFlags) {
                flags += " -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1";
            }
            cmd = `"${javaPath}" ${flags} -jar ${jarFile} nogui`;
        }
        
        logger.success(`[Server:${id}] Booting ${server.name}...`);
        processManager.startServer(id, cmd, workingDirectory);

        return { success: true };
    } catch (e: any) {
        logger.error(`[Server:${id}] Failed to start: ${e.message}`);
        throw e;
    } finally {
        releaseLock(id);
    }
};

export const stopServer = async (id: string, force: boolean = false) => {
    if (!processManager.isRunning(id)) return;
    
    acquireLock(id, 'STOP');
    try {
        processManager.stopServer(id, force);
    } finally {
        // Release slightly after to prevent spam-clicks during shutdown sequence
        setTimeout(() => releaseLock(id), 1000);
    }
};

export const DATA_PATHS = {
    SERVERS_ROOT
};
