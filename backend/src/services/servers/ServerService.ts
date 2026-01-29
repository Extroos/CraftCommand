import fs from 'fs-extra';
import path from 'path';
import net from 'net';
import { logger } from '../../utils/logger';
import { javaManager } from './JavaManager';
import { processManager } from './ProcessManager';
import { diagnosisService } from '../diagnosis/DiagnosisService';
import { safetyService } from '../system/SafetyService';
import { systemService } from '../system/SystemService';
import { startupManager } from './StartupManager';

import { serverRepository } from '../../storage/ServerRepository';
import { ServerConfig } from '../../../../shared/types';
import { DATA_DIR, SERVERS_ROOT } from '../../constants';

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
// servers.json handled by Repository
fs.ensureDirSync(SERVERS_ROOT);

export const getServers = () => {
    return serverRepository.findAll();
};

export const getServer = (id: string) => {
    return serverRepository.findById(id);
};

export const saveServer = (server: ServerConfig) => {
    const existing = serverRepository.findById(server.id);
    if (existing) {
        serverRepository.update(server.id, server);
    } else {
        serverRepository.create(server);
    }
};

import { installerService } from './InstallerService';

export const deleteServer = async (id: string) => {
    logger.info(`[ServerService] Deleting server ${id}...`);
    
    // 1. Force Stop Process
    if (processManager.isRunning(id)) {
        logger.info(`[ServerService] Stopping process for ${id} before deletion...`);
        // Force stop logic is handled by processManager, but we need to ensure it's triggered
        // processManager.stopServer doesn't await the exit, it just signals. we must poll.
        processManager.stopServer(id, true); 
        
        // Wait for shutdown (max 5s)
        let attempts = 0;
        while (processManager.isRunning(id) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (processManager.isRunning(id)) {
            logger.warn(`[ServerService] Process ${id} still running. Sending SIGKILL...`);
            processManager.killServer(id);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // 2. Get Data for Cleanup
    const server = getServer(id);
    if (!server) {
        logger.warn(`[ServerService] Server ${id} not found in DB, but proceeding with cleanup.`);
    }

    // 3. Remove from DB
    serverRepository.delete(id);

    // 4. Delete Files (Safe)
    if (server && server.workingDirectory) {
        if (await fs.pathExists(server.workingDirectory)) {
            logger.info(`[ServerService] Removing directory: ${server.workingDirectory}`);
            // Retry logic for EBUSY (Windows file locks)
            try {
                await fs.remove(server.workingDirectory);
            } catch (e: any) {
                console.warn(`[ServerService] Deletion Error: ${e.code}. waiting...`);
                if (e.code === 'EBUSY' || e.code === 'EPERM') {
                    logger.warn(`[ServerService] EBUSY encountered. Waiting 2s and retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    // Try one more time
                    await fs.remove(server.workingDirectory);
                } else {
                    throw e;
                }
            }
        }
    }
    
    logger.success(`[ServerService] Server ${id} deleted successfully.`);
};

// Maintain compatibility if something imports removeServer
export const removeServer = deleteServer;

export const updateServer = async (id: string, updates: any) => {
    // Acquire lock to prevent concurrent updates
    acquireLock(id, 'UPDATE');
    
    try {
        const oldServer = serverRepository.findById(id);
        
        if (!oldServer) throw new Error('Server not found');
        
        const newServer = { ...oldServer, ...updates };

        // --- SIDE EFFECTS ---
        
        // 1. Spark Install
        if (updates.advancedFlags?.installSpark && !oldServer.advancedFlags?.installSpark) {
            console.log(`[Server:${id}] Installing Spark (Side Effect)`);
            if (newServer.workingDirectory) {
                    await installerService.installSpark(newServer.workingDirectory);
            }
        }

        // 2. properties Sync (Online Mode, Port)
        if (newServer.workingDirectory && (updates.onlineMode !== undefined || updates.port !== undefined)) {
            const propsFile = path.join(newServer.workingDirectory, 'server.properties');
            try {
                if (await fs.pathExists(propsFile)) {
                    let props = await fs.readFile(propsFile, 'utf-8');
                    let changed = false;

                    if (updates.onlineMode !== undefined && updates.onlineMode !== oldServer.onlineMode) {
                        props = props.replace(/^online-mode=.*$/m, `online-mode=${updates.onlineMode}`);
                        changed = true;
                    }
                    
                    if (updates.port !== undefined && updates.port !== oldServer.port) {
                        props = props.replace(/^server-port=.*$/m, `server-port=${updates.port}`);
                        changed = true;
                    }

                    if (changed) {
                        await fs.writeFile(propsFile, props);
                        logger.info(`[ServerService] Updated server.properties for ${id}`);
                    }
                }
            } catch (e) {
                console.error(`[ServerService] Failed to update server.properties: ${e}`);
            }
        }

        serverRepository.update(id, updates);
        return newServer;
    } finally {
        releaseLock(id);
    }
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

        // 0. Safety Checks (Skip if forced)
        if (!force) {
            await safetyService.validateServer(server);
        }

        // S2: Stabilization - Enforce Config Sync before start
        // This prevents the "Dashboard says 25565, server.properties says 25577" bug
        logger.info(`[ServerService] Verifying config sync for ${id}...`);
        import('./ServerConfigService').then(async ({ serverConfigService }) => {
            const report = await serverConfigService.verifyConfig(server);
            if (!report.synchronized) {
                logger.warn(`[ServerService] Config mismatch detected. enforcing DB source of truth.`);
                await serverConfigService.enforceConfig(server);
            }
        });
        
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
        const isWin = process.platform === 'win32';
        let cmd = '';

        if (isWin) {
            let priorityFlag = '/NORMAL';
            if (server.cpuPriority === 'high') priorityFlag = '/HIGH';
            if (server.cpuPriority === 'realtime') priorityFlag = '/REALTIME';

            if (jarFile.endsWith('.bat')) {
                cmd = `start /B ${priorityFlag} "MinecraftServer" cmd /c "${path.join(workingDirectory, jarFile)}" nogui`;
            } else {
                // JVM Flags
                let flags = `-Xmx${ram}G`;
                if (advancedFlags?.aikarFlags) {
                    flags += " -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1";
                }
                const javaCmd = `"${javaPath}" ${flags} -jar ${jarFile} nogui`;
                cmd = `start /B ${priorityFlag} "MinecraftServer" ${javaCmd}`;
            }
        } else {
            // Linux / Unix Logic
            let nicePrefix = '';
            if (server.cpuPriority === 'high') nicePrefix = 'nice -n -5 '; 
            if (server.cpuPriority === 'realtime') nicePrefix = 'nice -n -10 '; // Require root/cap_sys_nice usually

            if (jarFile.endsWith('.sh')) {
                 cmd = `${nicePrefix}"${path.join(workingDirectory, jarFile)}"`;
            } else {
                let flags = `-Xmx${ram}G`;
                 if (advancedFlags?.aikarFlags) {
                    flags += " -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1";
                }
                cmd = `${nicePrefix}"${javaPath}" ${flags} -jar ${jarFile} nogui`;
            }
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



export const diagnoseServer = async (id: string) => {
    const server = getServer(id);
    if (!server) throw new Error('Server not found');

    // 1. Get Logs
    // Using in-memory LogBuffer from ProcessManager (Cyclic buffer of last 1000 lines)
    const recentLogs = processManager.getLogs(id) || []; 

    // 2. Get System Stats
    const stats = await systemService.getSystemStats();

    // 3. Run Diagnosis
    return diagnosisService.diagnose(server, recentLogs, {
        totalMemory: stats.mem.total,
        freeMemory: stats.mem.free,
        javaVersion: 'unknown' // Placeholder for Phase 2
    });
};
