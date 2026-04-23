import fs from 'fs-extra';
import path from 'path';
import net from 'net';
import { logger, readLastLines } from '../../utils/logger';
import { javaManager } from '../processes/JavaManager';
import { systemSettingsService } from '../system/SystemSettingsService';
import { processManager } from '../processes/ProcessManager';
import { diagnosisService } from '../diagnosis/DiagnosisService';
import { safetyService } from '../system/SafetyService';
import { systemService } from '../system/SystemService';
import { startupManager } from './StartupManager';
import { NetUtils } from '../../utils/NetUtils';
import { statsRingBuffer } from '../diagnosis/StatsRingBuffer';
import { automaticRepairService } from '../diagnosis/AutomaticRepairService';
import { backupService } from '../backups/BackupService';
import { fileWatcherService } from '../files/FileWatcherService';
import { presenceTracker } from '../../sockets/PresenceTracker';
import { lockingService } from '../../sockets/LockingService';
import { chatRepository } from '../../storage/ChatRepository';
import { activityRepository } from '../../storage/ActivityRepository';

import { serverRepository } from '../../storage/ServerRepository';
import { ServerConfig, ServerStatus } from '@shared/types';
import { DATA_DIR, SERVERS_ROOT } from '../../constants';
import { randomUUID } from 'crypto';

const operationLocks = new Set<string>();
const lastDiagnosisResults = new Map<string, { results: any[], time: number, status: ServerStatus }>();

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

/**
 * Forcefully clears the diagnosis cache for a specific server.
 * Use this after applying a fix or before a critical state change.
 */
export const invalidateDiagnosisCache = (serverId: string) => {
    lastDiagnosisResults.delete(serverId);
    logger.debug(`[ServerService:${serverId}] Diagnosis cache invalidated.`);
};

// Ensure initialization
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(SERVERS_ROOT);

/**
 * Technical Validation Guard
 */
const validateUpdate = (updates: any) => {
    if (updates.port !== undefined && (updates.port < 1024 || updates.port > 65535)) {
        throw new Error('Invalid port range (1024-65535)');
    }
    if (updates.ram !== undefined && (updates.ram < 1 || updates.ram > 256)) {
        throw new Error('Invalid RAM allocation (1-256GB)');
    }
};

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

import { installerService } from '../installer/InstallerService';
import { SafeFileOperation } from '../../utils/fs';

export const deleteServer = async (id: string) => {
    logger.info(`[ServerService] Deleting server ${id}...`);
    acquireLock(id, 'DELETE');

    try {
        // Safety Guard: Prevent deletion of running servers
        if (processManager.isRunning(id)) {
            logger.warn(`[ServerService] Blocked deletion attempt for running server ${id}.`);
            throw new Error('You cannot delete a running server. Please stop it first.');
        }

        const server = getServer(id);
        if (!server) {
            logger.warn(`[ServerService] Server ${id} not found in DB, but proceeding with cleanup.`);
        }

        serverRepository.delete(id);

        if (server && server.workingDirectory) {
            if (await fs.pathExists(server.workingDirectory)) {
                let checks = 0;
                while (processManager.isRunning(id) && checks < 10) {
                    await new Promise(r => setTimeout(r, 1000));
                    checks++;
                }
                if (!processManager.isRunning(id)) {
                    await new Promise(r => setTimeout(r, 2000));
                }

                logger.info(`[ServerService] Removing directory: ${server.workingDirectory}`);
                await SafeFileOperation.remove(server.workingDirectory);
            }
        }

        // Comprehensive Cleanup (State & Memory)
        await purgeServerState(id);
        
        logger.success(`[ServerService] Server ${id} deleted successfully.`);
    } finally {
        releaseLock(id);
    }
};

/**
 * Deep Purge of server existence across all services.
 * Ensures no memory leaks or orphaned files remain.
 */
export const purgeServerState = async (id: string) => {
    logger.info(`[ServerService] Orchestrating deep purge for server ${id}...`);
    
    // 1. Process & Memory Cleanup
    processManager.cleanupServer(id);
    
    // 2. Diagnosis & Stats Cleanup
    invalidateDiagnosisCache(id);
    diagnosisService.clearResolved(id);
    statsRingBuffer.clear(id);
    
    // 3. Automation Cleanup
    automaticRepairService.clear(id);
    
    // 4. Resource Cleanup (Watchers & Locks)
    fileWatcherService.unwatchServer(id);
    lockingService.releaseAllForServer(id);
    
    // 5. Physical Backup Purge
    try {
        await backupService.cancelActiveBackups(id);
        await backupService.clearAllBackups(id);
        logger.info(`[ServerService] Purged all backup archives and cancelled active tasks for ${id}.`);
    } catch (e: any) {
        logger.warn(`[ServerService] Failed to purge backups for ${id}: ${e.message}`);
    }

    // 6. Collaboration Cleanup (Presence & History)
    presenceTracker.clear(id);
    chatRepository.deleteForServer(id);
    activityRepository.deleteForServer(id);

    // --- LAYER 3: DEEP ARCHITECTURAL PURGE (v1.14.0) ---

    // 7. Scheduling & Task History
    const { scheduleService } = require('../scheduling/ScheduleService');
    await scheduleService.clear(id);

    // 8. Proxy Fabric (Ghost Links)
    const { proxyService } = require('../network/ProxyService');
    await proxyService.unlinkAll(id);

    // 9. Installer Temporary State
    const { installerService } = require('../installer/InstallerService');
    const server = getServer(id) || { workingDirectory: '' };
    await installerService.purgeTempState(id, server.workingDirectory);

    // 10. OS Host Firewall Rules
    const { networkFabricService } = require('../network/NetworkFabricService');
    await networkFabricService.clearRulesForServer(id);

    logger.success(`[ServerService:${id}] Server state cleanup complete. No ghost state remains.`);
};

export const removeServer = deleteServer;

export const cloneServer = async (id: string, newName?: string): Promise<ServerConfig> => {
    const source = getServer(id);
    if (!source) throw new Error('Source server not found');

    if (processManager.isRunning(id)) {
        throw new Error('Cannot clone a running server. Please stop it first.');
    }

    const cloneId = `local-${Date.now()}`;
    const cloneDirName = cloneId;
    const cloneDir = path.join(SERVERS_ROOT, cloneDirName);

    logger.info(`[Clone] Cloning server "${source.name}" (${id}) → ${cloneId}`);

    if (!source.workingDirectory || !(await fs.pathExists(source.workingDirectory))) {
        throw new Error('Source server directory not found');
    }

    await fs.copy(source.workingDirectory, cloneDir, {
        overwrite: false,
        errorOnExist: true
    });

    // Use the shared port finder to avoid collisions and handle overflow safely
    const clonePort = getNextAvailablePort((source.port || 25565) + 1);

    const clone: ServerConfig = {
        ...source,
        id: cloneId,
        name: newName || `${source.name} (Clone)`,
        folderName: cloneDirName,
        workingDirectory: cloneDir,
        port: clonePort,
        status: ServerStatus.OFFLINE,
        startTime: undefined,
        linkedProxyId: undefined,
    };

    delete (clone as any).startTime;
    delete (clone as any).linkedProxyId;

    saveServer(clone);

    try {
        const { fileWatcherService } = await import('../files/FileWatcherService');
        fileWatcherService.watchServer(cloneId, cloneDir);
    } catch (e) {
        logger.warn(`[Clone] Failed to start file watcher for ${cloneId}: ${e}`);
    }

    logger.success(`[Clone] Server "${source.name}" cloned as "${clone.name}" (port ${clonePort})`);
    return clone;
};

/**
 * Directory Scanning
 * Scans SERVERS_ROOT and re-registers servers missing from metadata.
 */
export const bootstrapDiscovery = async () => {
    logger.info('[Discovery] Running server directory scan...');
    try {
        await fs.ensureDir(SERVERS_ROOT);
        const entries = await fs.readdir(SERVERS_ROOT);
        const existingServers = serverRepository.findAll();
        const existingPaths = new Set(existingServers.map(s => path.resolve(s.workingDirectory)));

        let discoveredCount = 0;

        for (const entry of entries) {
            const fullPath = path.join(SERVERS_ROOT, entry);
            const stats = await fs.stat(fullPath);

            if (stats.isDirectory() && entry.startsWith('local-')) {
                const resolvedPath = path.resolve(fullPath);
                
                if (!existingPaths.has(resolvedPath)) {
                    logger.info(`[Discovery] Found unregistered server directory: ${entry}`);
                    
                    const propsPath = path.join(fullPath, 'server.properties');
                    const isBedrock = await fs.pathExists(path.join(fullPath, 'bedrock_server.exe')) || await fs.pathExists(path.join(fullPath, 'bedrock_server'));
                    
                    let software = 'Vanilla';
                    if (isBedrock) software = 'Bedrock';
                    else if (await fs.pathExists(path.join(fullPath, 'libraries'))) software = 'Forge';
                    else if (await fs.pathExists(path.join(fullPath, 'velocity.toml'))) software = 'Velocity';
                    else if (await fs.pathExists(path.join(fullPath, 'paper.yml')) || await fs.pathExists(path.join(fullPath, 'config', 'paper-global.yml'))) software = 'Paper';
                    else if (await fs.pathExists(path.join(fullPath, 'purpur.yml')) || await fs.pathExists(path.join(fullPath, 'config', 'purpur-global.yml'))) software = 'Purpur';

                    let port = 25565;
                    let motd = 'A Minecraft Server';
                    
                    if (await fs.pathExists(propsPath)) {
                        try {
                            const { ServerConfigService } = require('./ServerConfigService');
                            const props = await ServerConfigService.parseProperties(propsPath);
                            
                            if (props['server-port']) port = parseInt(props['server-port']);
                            if (props['motd']) motd = props['motd'];
                        } catch (e) {
                            logger.warn(`[Discovery] Failed to parse properties for ${entry}: ${e}`);
                        }
                    } else if (software === 'Velocity') {
                        const velocityPath = path.join(fullPath, 'velocity.toml');
                        const velo = await fs.readFile(velocityPath, 'utf8');
                        const bindMatch = velo.match(/^bind\s*=\s*".*?:(\d+)"/m);
                        if (bindMatch) port = parseInt(bindMatch[1]);
                    }

                    const newServer: ServerConfig = {
                        id: entry.replace('local-', '') || randomUUID(),
                        name: `Discovered: ${entry.split('-').slice(1).join('-') || entry}`,
                        software: software as any,
                        version: 'Auto-Detected',
                        port,
                        ip: '127.0.0.1',
                        status: ServerStatus.OFFLINE,
                        workingDirectory: resolvedPath,
                        executable: isBedrock ? (process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server') : 'server.jar',
                        ram: 4,
                        motd,
                        javaVersion: javaManager.getRecommendedJavaVersion('1.21.11'),
                        executionEngine: systemSettingsService.getSettings()?.app?.defaultExecutionEngine || 'native',
                        executionCommand: ''
                    };

                    serverRepository.create(newServer);
                    discoveredCount++;
                }
            }
        }

        if (discoveredCount > 0) {
            logger.success(`[Discovery] Successfully recovered ${discoveredCount} servers.`);
        } else {
            logger.info('[Discovery] No new servers found in physical storage.');
        }
    } catch (e) {
        logger.error(`[Discovery] Failed to run discovery: ${e instanceof Error ? e.message : String(e)}`);
    }
};

const runBootstrap = async () => {
    await bootstrapDiscovery();
    try {
        const { importService } = await import('../installer/ImportService');
        await importService.cleanupTempDirectories();
    } catch (e) {
        logger.error(`[Bootstrap] Failed to run temp cleanup: ${e}`);
    }
};

runBootstrap();

export const updateServer = async (id: string, updates: any) => {
    acquireLock(id, 'UPDATE');
    
    try {
        const oldServer = serverRepository.findById(id);
        if (!oldServer) throw new Error('Server not found');
        
        // --- DEEP MERGE LOGIC (Phase 66) ---
        // Ensure nested objects like 'network' are merged rather than overwritten
        const newNetwork = updates.network ? { 
            ...(oldServer.network || {}), 
            ...updates.network 
        } : oldServer.network;

        const newServer = { 
            ...oldServer, 
            ...updates,
            executable: updates.executable || oldServer.executable || 'server.jar',
            network: newNetwork
        };

        validateUpdate(updates);

        if (updates.advancedFlags?.installSpark && !oldServer.advancedFlags?.installSpark) {
            logger.info(`[Server:${id}] Installing Spark`);
            if (newServer.workingDirectory) {
                await installerService.installSpark(newServer.workingDirectory);
            }
        }

        if (newServer.workingDirectory) {
            try {
                const { serverConfigService } = require('./ServerConfigService');
                await serverConfigService.enforceConfig(newServer);
                logger.info(`[ServerService] Synchronized server.properties for ${id}`);
            } catch (e) {
                logger.error(`[ServerService] Failed to synchronize server.properties: ${e}`);
            }
        }

        if (newServer.software === 'Velocity' && updates.network?.proxyConfig?.links) {
            const oldLinks = oldServer.network?.proxyConfig?.links || [];
            const newLinks = updates.network.proxyConfig.links;

            const oldRelatedIds = new Set(oldLinks.map((l: any) => l.serverId));
            const newRelatedIds = new Set(newLinks.map((l: any) => l.serverId));

            for (const sid of [...newRelatedIds].filter(x => !oldRelatedIds.has(x))) {
                const target = serverRepository.findById(sid as string);
                if (target) {
                    serverRepository.update(sid as string, { ...target, linkedProxyId: id });
                    logger.info(`[ServerService] Linked server ${sid} to proxy ${id}`);
                }
            }

            for (const sid of [...oldRelatedIds].filter(x => !newRelatedIds.has(x))) {
                const target = serverRepository.findById(sid as string);
                if (target && target.linkedProxyId === id) {
                    serverRepository.update(sid as string, { ...target, linkedProxyId: undefined });
                    logger.info(`[ServerService] Unlinked server ${sid} from proxy ${id}`);
                }
            }
        }

        // --- PERSISTENCE (Final state) ---
        serverRepository.update(id, newServer);
        return newServer;
    } finally {
        releaseLock(id);
    }
};

export const cleanupInstallState = () => {
    logger.info(`[ServerService] Running installation state cleanup...`);
    const servers = serverRepository.findAll();
    let count = 0;
    for (const server of servers) {
        if (server.status === ServerStatus.INSTALLING) {
            serverRepository.update(server.id, { ...server, status: ServerStatus.OFFLINE });
            count++;
        }
    }
    if (count > 0) {
        logger.warn(`[ServerService] Cleaned up ${count} servers stuck in INSTALLING state.`);
    }
};

export const startServer = async (id: string, force: boolean = false) => {
    const server = getServer(id);
    if (!server) throw new Error('Server not found');

    if (processManager.isRunning(id) && !force) {
        logger.info(`[ServerService:${id}] Start requested but server is already running.`);
        return { success: true, alreadyRunning: true };
    }

    invalidateDiagnosisCache(id);
    diagnosisService.clearResolved(id);

    acquireLock(id, 'START');

    try {
        if (server.software === 'Velocity') {
            const linkCount = server.network?.proxyConfig?.links?.length || 0;
            if (linkCount === 0) {
                logger.error(`[Server:${id}] Blocked startup: 0 backend links.`);
                throw new Error('Velocity requires at least one linked backend server to start correctly.');
            }
        }

        logger.info(`[ServerService] Orchestrating startup for ${server.name}...`);

        // --- Phase 68: Zero-Conflict Startup (PortShield) ---
        // Ensure the port is actually free before we try to bind a new process.
        // This clears any "Zombies" left behind by previous crashes.
        if (server.port) {
            await NetUtils.killProcessOnPort(server.port);
        }
        
        if (!server.hasStarted) {
            server.hasStarted = true;
            server.status = ServerStatus.STARTING; // v4.6: Atomic status sync to prevent diagnosis race
            serverRepository.update(id, server);
        }

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
    diagnosisService.clearResolved(id);
    if (!processManager.isRunning(id)) {
        logger.info(`[ServerService] Stop requested for server ${id} but it is not running.`);
        const server = getServer(id);
        if (server && server.status !== ServerStatus.OFFLINE) {
            logger.info(`[ServerService] Forcing stuck server ${id} (${server.status}) to OFFLINE`);
            serverRepository.update(id, { status: ServerStatus.OFFLINE });
            processManager.updateCachedStatus(id, { status: ServerStatus.OFFLINE, online: false });
        }
        return;
    }
    
    acquireLock(id, 'STOP');
    try {
        await processManager.stopServer(id, force);
    } finally {
        setTimeout(() => releaseLock(id), 1000);
    }
};

export const restartServer = async (id: string) => {
    logger.info(`[ServerService] Restarting server ${id}...`);
    
    const server = getServer(id);
    if (!server) throw new Error('Server not found');

    // 1. Stop the server
    await stopServer(id, false);
    
    // 2. Wait for the STOP lock to release (polls instead of fixed delay for reliability under load)
    const maxLockWait = 30; // 15 seconds max
    let lockAttempts = 0;
    while (operationLocks.has(id) && lockAttempts < maxLockWait) {
        await new Promise(r => setTimeout(r, 500));
        lockAttempts++;
    }

    // 3. Port Release Verification Loop (Stops "Port in use" race conditions)
    const port = server.port || 25565;
    const isBedrock = server.software === 'Bedrock';
    let portBusy = true;
    let attempts = 0;
    const maxPortWait = 10; // 5 seconds total

    logger.debug(`[ServerService:${id}] Verifying port ${port} release...`);
    
    while (portBusy && attempts < maxPortWait) {
        if (isBedrock) {
            portBusy = await NetUtils.checkUDPPortBind(port);
        } else {
            portBusy = await NetUtils.checkPortBind(port);
        }

        if (portBusy) {
            attempts++;
            await new Promise(r => setTimeout(r, 500));
        }
    }

    if (portBusy) {
        logger.warn(`[ServerService:${id}] Port ${port} still busy after 5s. Proceeding with START (SafetyService will catch if critical).`);
    } else {
        logger.debug(`[ServerService:${id}] Port ${port} is clear.`);
    }
    
    return startServer(id);
};

export const diagnoseServer = async (id: string, force = false) => {
    const server = getServer(id);
    if (!server) throw new Error('Server not found');

    const now = Date.now();
    const last = lastDiagnosisResults.get(id);
    const statusChanged = !last || last.status !== server.status;
    const isErrorState = last?.results.some(r => r.severity === 'CRITICAL');
    
    // Phase 66: Reactive Throttling
    // Critical issues refresh every 5s, normal states every 30s.
    const throttleTime = isErrorState ? 5000 : 30000;
    const shouldSkip = !force && !statusChanged && last && (now - last.time < throttleTime);

    if (shouldSkip) {
        return last.results;
    }

    let recentLogs = processManager.getLogs(id) || []; 
    
    if (recentLogs.length === 0) {
        const logPath = server.logLocation 
            ? path.resolve(server.workingDirectory, server.logLocation)
            : path.join(server.workingDirectory, 'logs', 'latest.log');
            
        if (await fs.pathExists(logPath)) {
            try {
                const buffer = Buffer.alloc(4);
                const fd = await fs.open(logPath, 'r');
                await fs.read(fd, buffer, 0, 4, 0);
                await fs.close(fd);
                
                const isBinary = buffer.some(b => b === 0);
                if (!isBinary) {
                    recentLogs = await readLastLines(logPath, 500);
                }
            } catch (e) { logger.debug(`[ServerService:${id}] Could not read log file for diagnosis: ${e}`); }
        }
    }

    const results = await diagnosisService.diagnose(server, recentLogs);
    lastDiagnosisResults.set(id, { results, time: now, status: server.status as ServerStatus });
    return results;
};

// --- Connectivity & Networking ---

const generateRandomPassword = (length: number = 16) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
    let pass = '';
    for (let i = 0; i < length; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
};

export const getNextAvailablePort = (startPort: number): number => {
    const servers = getServers();
    const usedPorts = new Set<number>();
    
    servers.forEach(s => {
        if (s.port) usedPorts.add(Number(s.port));
        s.additionalPorts?.forEach(ap => usedPorts.add(Number(ap.port)));
    });

    let port = startPort;
    while (usedPorts.has(port) && port < 65535) {
        port++;
    }
    // If we overflowed, wrap around and search from the beginning
    if (port >= 65535) {
        port = 25565;
        while (usedPorts.has(port) && port < startPort) {
            port++;
        }
    }
    return port;
};

const findAvailablePort = async (min = 10000, max = 30000): Promise<number> => {
    const servers = getServers();
    const usedPorts = new Set<number>();
    
    servers.forEach(s => {
        if (s.port) usedPorts.add(Number(s.port));
        s.additionalPorts?.forEach(ap => usedPorts.add(Number(ap.port)));
    });

    for (let i = 0; i < 50; i++) {
        const p = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!usedPorts.has(p)) return p;
    }
    return getNextAvailablePort(min);
};

export const resetSftpPassword = async (id: string) => {
    const server = getServer(id);
    if (!server) throw new Error('Server not found');
    
    const newPass = generateRandomPassword();
    serverRepository.update(id, { sftpPassword: newPass });
    
    logger.info(`[ServerService:${id}] SFTP Password reset.`);
    return { success: true };
};

export const getServerPorts = (id: string) => {
    const server = getServer(id);
    if (!server) throw new Error('Server not found');
    
    const primary: any = {
        id: 'primary',
        name: 'Primary Instance (Game)',
        port: server.port,
        status: processManager.isRunning(id) ? 'Listening' : 'Closed',
        isImmutable: true
    };
    
    return [primary, ...(server.additionalPorts || [])];
};

export const assignServerPort = async (id: string) => {
    const server = getServer(id);
    if (!server) throw new Error('Server not found');
    
    const port = await findAvailablePort();
    const newPort: any = {
        id: randomUUID(),
        name: `Additional Node ${((server.additionalPorts?.length || 0) + 1)}`,
        port: port,
        status: 'Listening',
        isImmutable: false
    };
    
    const additionalPorts = [...(server.additionalPorts || []), newPort];
    serverRepository.update(id, { additionalPorts });
    
    logger.info(`[ServerService:${id}] Assigned additional port: ${port}`);
    return newPort;
};

export const rotateServerPort = async (serverId: string, portId: string) => {
    const server = getServer(serverId);
    if (!server) throw new Error('Server not found');
    
    const index = (server.additionalPorts || []).findIndex(p => p.id === portId);
    if (index === -1) throw new Error('Port mapping not found');
    
    const newPortVal = await findAvailablePort();
    const ports = [...(server.additionalPorts || [])];
    ports[index] = { ...ports[index], port: newPortVal, status: 'Listening' };
    
    serverRepository.update(serverId, { additionalPorts: ports });
    
    logger.info(`[ServerService:${serverId}] Rotated port for ${portId} -> ${newPortVal}`);
    return ports[index];
};
