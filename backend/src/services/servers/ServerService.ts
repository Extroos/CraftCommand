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
        logger.info(`[ServerService] Orchestrating startup for ${server.name} via StartupManager...`);
        
        await startupManager.startServer(server, (updatedServer) => {
            serverRepository.update(updatedServer.id, updatedServer);
        }, force);

        return { success: true };
    } catch (e: any) {
        logger.error(`[Server:${id}] Startup Manager failed: ${e.message}`);
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
