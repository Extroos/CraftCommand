import fs from 'fs-extra';
import path from 'path';
import net from 'net';
import { logger } from '../../utils/logger';
import { javaManager } from '../processes/JavaManager';
import { processManager } from '../processes/ProcessManager';
import { diagnosisService } from '../diagnosis/DiagnosisService';
import { safetyService } from '../system/SafetyService';
import { systemService } from '../system/SystemService';
import { startupManager } from './StartupManager';

import { serverRepository } from '../../storage/ServerRepository';
import { ServerConfig, ServerStatus } from '@shared/types';
import { DATA_DIR, SERVERS_ROOT } from '../../constants';
// uuid is available via Node's crypto or we can use a simpler ID for discovery
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
 * Forcefully clears the diagnosis cache for a specific server (v1.12.7)
 * Use this after applying a fix or before a critical state change.
 */
export const invalidateDiagnosisCache = (serverId: string) => {
    lastDiagnosisResults.delete(serverId);
    logger.debug(`[ServerService:${serverId}] Diagnosis cache invalidated.`);
};

// Ensure initialization
fs.ensureDirSync(DATA_DIR);
// servers.json handled by Repository
fs.ensureDirSync(SERVERS_ROOT);

/**
 * Technical Validation Guard (v1.7.11)
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

    // 0. Safety Guard (v1.7.11) - Prevent deletion of running servers
    if (processManager.isRunning(id)) {
        logger.warn(`[ServerService] Blocked deletion attempt for running server ${id}.`);
        throw new Error('You cannot delete a running server. Please stop it first.');
    }

    // 1. Get Data for Cleanup
    const server = getServer(id);
    if (!server) {
        logger.warn(`[ServerService] Server ${id} not found in DB, but proceeding with cleanup.`);
    }

    // 2. Remove from DB
    serverRepository.delete(id);

    // 3. Delete Files (Safe)
    if (server && server.workingDirectory) {
        if (await fs.pathExists(server.workingDirectory)) {
            logger.info(`[ServerService] Removing directory: ${server.workingDirectory}`);
            
            // Use SafeFileOperation to handle Windows EBUSY/EPERM
            await SafeFileOperation.remove(server.workingDirectory);
        }
    }
    
    logger.success(`[ServerService] Server ${id} deleted successfully.`);
};

// Maintain compatibility if something imports removeServer
export const removeServer = deleteServer;

// --- Server Cloning ---
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

    // 1. Copy the entire working directory
    if (!source.workingDirectory || !(await fs.pathExists(source.workingDirectory))) {
        throw new Error('Source server directory not found');
    }

    await fs.copy(source.workingDirectory, cloneDir, {
        overwrite: false,
        errorOnExist: true
    });

    // 2. Find a unique port (original + 1, skip conflicts)
    const allServers = getServers();
    const usedPorts = new Set(allServers.map((s: any) => s.port));
    let clonePort = (source.port || 25565) + 1;
    while (usedPorts.has(clonePort) && clonePort < 65535) {
        clonePort++;
    }
    if (clonePort >= 65535) clonePort = 25565; // Fallback

    // 3. Build the clone config — strip runtime state
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

    // Remove fields that shouldn't carry over
    delete (clone as any).startTime;
    delete (clone as any).linkedProxyId;

    // 4. Register in repository
    saveServer(clone);

    // 5. Start file watcher for the clone
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
 * Bootstrap Discovery Service (v1.11.3)
 * Scans SERVERS_ROOT and re-registers servers missing from metadata.
 */
export const bootstrapDiscovery = async () => {
    logger.info('[Discovery] Running server metadata discovery...');
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
                    
                    // Basic heuristic: check for server.properties or world folders
                    const propsPath = path.join(fullPath, 'server.properties');
                    const isBedrock = await fs.pathExists(path.join(fullPath, 'bedrock_server.exe')) || await fs.pathExists(path.join(fullPath, 'bedrock_server'));
                    
                    // Determine Software
                    let software = 'Vanilla';
                    if (isBedrock) software = 'Bedrock';
                    else if (await fs.pathExists(path.join(fullPath, 'libraries'))) software = 'Forge';
                    else if (await fs.pathExists(path.join(fullPath, 'velocity.toml'))) software = 'Velocity';
                    else if (await fs.pathExists(path.join(fullPath, 'paper.yml')) || await fs.pathExists(path.join(fullPath, 'config', 'paper-global.yml'))) software = 'Paper';
                    else if (await fs.pathExists(path.join(fullPath, 'purpur.yml')) || await fs.pathExists(path.join(fullPath, 'config', 'purpur-global.yml'))) software = 'Purpur';

                    // Scan for port and MOTD in server.properties if available
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
                        motd, // Extracted from server.properties
                        javaVersion: javaManager.getRecommendedJavaVersion('1.21.11'), // Use smart recommended default (v1.21.11 baseline for discovery)
                        executionEngine: 'default',
                        executionCommand: '' // Will be generated by sanitizeServerConfig
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

bootstrapDiscovery(); // Auto-run on load

export const updateServer = async (id: string, updates: any) => {
    // Acquire lock to prevent concurrent updates
    acquireLock(id, 'UPDATE');
    
    try {
        const oldServer = serverRepository.findById(id);
        
        if (!oldServer) throw new Error('Server not found');
        
        const newServer = { ...oldServer, executable: oldServer.executable || 'server.jar', ...updates };

        // 0. Technical Validation
        validateUpdate(updates);

        // --- SIDE EFFECTS ---
        
        // 1. Spark Install
        if (updates.advancedFlags?.installSpark && !oldServer.advancedFlags?.installSpark) {
            console.log(`[Server:${id}] Installing Spark (Side Effect)`);
            if (newServer.workingDirectory) {
                    await installerService.installSpark(newServer.workingDirectory);
            }
        }

        // 2. properties Sync (Online Mode, Port, Gameplay, etc.)
        if (newServer.workingDirectory) {
            try {
                // Use the comprehensive ConfigService to sync all properties to disk
                const { serverConfigService } = require('./ServerConfigService');
                await serverConfigService.enforceConfig(newServer);
                logger.info(`[ServerService] Synchronized server.properties for ${id}`);
            } catch (e) {
                console.error(`[ServerService] Failed to synchronize server.properties: ${e}`);
            }
        }

        // 3. Proxy Relationship Synchronization
        if (newServer.software === 'Velocity' && updates.network?.proxyConfig?.links) {
            const oldLinks = oldServer.network?.proxyConfig?.links || [];
            const newLinks = updates.network.proxyConfig.links;

            const oldRelatedIds = new Set(oldLinks.map((l: any) => l.serverId));
            const newRelatedIds = new Set(newLinks.map((l: any) => l.serverId));

            // Newly Linked: Servers in new but not in old
            for (const sid of [...newRelatedIds].filter(x => !oldRelatedIds.has(x))) {
                const target = serverRepository.findById(sid as string);
                if (target) {
                    serverRepository.update(sid as string, { ...target, linkedProxyId: id });
                    logger.info(`[ServerService] Linked server ${sid} to proxy ${id}`);
                }
            }

            // Unlinked: Servers in old but not in new
            for (const sid of [...oldRelatedIds].filter(x => !newRelatedIds.has(x))) {
                const target = serverRepository.findById(sid as string);
                if (target && target.linkedProxyId === id) {
                    serverRepository.update(sid as string, { ...target, linkedProxyId: undefined });
                    logger.info(`[ServerService] Unlinked server ${sid} from proxy ${id}`);
                }
            }
        }

        serverRepository.update(id, { ...updates, executable: newServer.executable });
        return newServer;
    } finally {
        releaseLock(id);
    }
};

/**
 * Reset any servers stuck in INSTALLING state to OFFLINE.
 * Called on backend startup for stabilization.
 */
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
        logger.info(`[ServerService:${id}] Start requested but server is already running. Returning success (idempotency).`);
        return { success: true, alreadyRunning: true };
    }

    // Clear stale diagnosis before boot to ensure fresh pre-flight checks
    invalidateDiagnosisCache(id);
    diagnosisService.clearResolved(id);

    acquireLock(id, 'START');

    try {
        // 0. specialized Safety Guards (v1.10.1)
        if (server.software === 'Velocity') {
            const linkCount = server.network?.proxyConfig?.links?.length || 0;
            if (linkCount === 0) {
                logger.error(`[Server:${id}] Blocked startup: 0 backend links configured.`);
                throw new Error('Velocity requires at least one linked backend server to start correctly. Please add a server in the Proxy Network tab.');
            }
        }

        logger.info(`[ServerService] Orchestrating startup for ${server.name} via StartupManager...`);
        
        // Mark as started immediately to enable diagnosis for this boot attempt
        if (!server.hasStarted) {
            server.hasStarted = true;
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
        
        // --- STUCK STATUS RECOVERY ---
        // If the process is dead but the status is NOT offline (e.g., CRASHED, STARTING),
        // we force it to OFFLINE so the user can try starting it again.
        const server = getServer(id);
        if (server && server.status !== ServerStatus.OFFLINE) {
            logger.info(`[ServerService] Forcing stuck server ${id} (${server.status}) to ${ServerStatus.OFFLINE}`);
            serverRepository.update(id, { status: ServerStatus.OFFLINE });
            processManager.updateCachedStatus(id, { status: ServerStatus.OFFLINE, online: false });
        }
        return;
    }
    
    acquireLock(id, 'STOP');
    try {
        await processManager.stopServer(id, force);
    } finally {
        // Release slightly after to prevent spam-clicks during shutdown sequence
        // but now we actually AWAIT the shutdown first, so this is much safer.
        setTimeout(() => releaseLock(id), 1000);
    }
};



export const diagnoseServer = async (id: string, force = false) => {
    const server = getServer(id);
    if (!server) throw new Error('Server not found');

    const now = Date.now();
    const last = lastDiagnosisResults.get(id);
    const statusChanged = !last || last.status !== server.status;
    const isErrorState = last?.results.some(r => r.severity === 'CRITICAL');
    
    // Throttling Logic (v1.12.5)
    // 1. Always scan if status changed (e.g. OFFLINE -> STARTING)
    // 2. Always scan if forced
    // 3. Scan every 1 minute if previously in error state (proactive recovery check)
    // 4. Scan every 10 minutes if stable and healthy
    const throttleTime = isErrorState ? 60000 : 600000;
    const shouldSkip = !force && !statusChanged && last && (now - last.time < throttleTime);

    if (shouldSkip) {
        return last.results;
    }

    // 1. Get Logs
    let recentLogs = processManager.getLogs(id) || []; 
    
    if (recentLogs.length === 0) {
        const logPath = server.logLocation 
            ? path.resolve(server.workingDirectory, server.logLocation)
            : path.join(server.workingDirectory, 'logs', 'latest.log');
            
        if (await fs.pathExists(logPath)) {
            try {
                const { LogUtils } = require('../../utils/LogUtils');
                // Check if file is likely binary (first few bytes) before reading to avoid TS1490 error spam
                const buffer = Buffer.alloc(4);
                const fd = await fs.open(logPath, 'r');
                await fs.read(fd, buffer, 0, 4, 0);
                await fs.close(fd);
                
                const isBinary = buffer.some(b => b === 0);
                if (!isBinary) {
                    recentLogs = await LogUtils.readLastLines(logPath, 500);
                }
            } catch (e) {
                // Silent fail for binary/missing logs to prevent console spam
            }
        }
    }

    const stats = await systemService.getSystemStats();
    const results = await diagnosisService.diagnose(server, recentLogs);

    lastDiagnosisResults.set(id, { results, time: now, status: server.status as ServerStatus });
    return results;
};

// --- Connectivity & Networking Extensions (Phase 108) ---

/** Generates a random alphanumeric password of specified length */
const generateRandomPassword = (length: number = 16) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
    let pass = '';
    for (let i = 0; i < length; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
};

/** Finds the next available port starting from a base value */
export const getNextAvailablePort = (startPort: number): number => {
    const servers = getServers();
    const usedPorts = new Set<number>();
    
    // Collect all primary and additional ports
    servers.forEach(s => {
        if (s.port) usedPorts.add(Number(s.port));
        s.additionalPorts?.forEach(ap => usedPorts.add(Number(ap.port)));
    });

    let port = startPort;
    while (usedPorts.has(port)) {
        port++;
    }
    return port;
};

/** Finds a random available port between 10000 and 30000 */
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
    
    logger.info(`[ServerService:${id}] SFTP Password has been reset.`);
    return { success: true };
};

export const getServerPorts = (id: string) => {
    const server = getServer(id);
    if (!server) throw new Error('Server not found');
    
    // Return primary port + additional ports as requested by Connectivity UI
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
        status: 'Listening', // Mocking active for now
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
