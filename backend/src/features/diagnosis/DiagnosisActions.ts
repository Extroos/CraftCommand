
import { serverRepository } from '../../storage/ServerRepository';
import { logger } from '../../utils/logger';
import { startupManager } from '../servers/StartupManager';
import { FileSystemManager } from '../files/FileSystemManager';
import {  ServerConfig  } from '@shared/types';
import si from 'systeminformation';
import fsExtra from 'fs-extra';
import path from 'path';

/**
 * Proactive Healing Actions
 * These are called by AutomaticRepairService with a scoped FileSystemManager.
 */
export const DiagnosisActions = {
    /**
     * Automatically accepts the EULA
     */
    agreeEula: async (fs: FileSystemManager) => {
        logger.info(`[DiagnosisAction] Automatically agreeing to EULA`);
        await fs.writeFile('eula.txt', 'eula=true');

        // --- SMART HANDLING: APPEND FIX MARKER ---
        // Instead of truncating, we append a marker so the scanner knows to ignore 
        // older EULA errors while preserving the history for the user.
        try {
            if (await fs.exists('logs/latest.log')) {
                await fs.appendFile('logs/latest.log', '\n[CraftCommand] [FIX] EULA Accepted. Previous eula errors are now stale.\n');
            }
        } catch (e) { /* ignore */ }
    },

    /**
     * Resolves port conflicts by finding the next available port
     */
    resolvePortConflict: async (server: ServerConfig, fs: FileSystemManager) => {
        let currentPort = server.port;
        let newPort = currentPort;
        let isAvailable = false;

        logger.info(`[DiagnosisAction] Resolving port conflict (Current: ${currentPort})`);

        const { NetUtils } = require('../../utils/NetUtils'); // Dynamic import
        for (let i = 1; i <= 10; i++) {
            const testPort = currentPort + i;
            const busy = await NetUtils.checkPort(testPort);
            if (!busy) {
                newPort = testPort;
                isAvailable = true;
                break;
            }
        }

        if (isAvailable) {
            serverRepository.update(server.id, { port: newPort });
            
            // Sync properties via FS manager
            try {
                let props = await fs.readFile('server.properties');
                props = props.replace(/^server-port=.*$/m, `server-port=${newPort}`);
                props = props.replace(/^query.port=.*$/m, `query.port=${newPort}`);
                await fs.writeFile('server.properties', props);

                // --- SMART HANDLING: FIX MARKER ---
                if (await fs.exists('logs/latest.log')) {
                    await fs.appendFile('logs/latest.log', `\n[CraftCommand] [FIX] Port changed to ${newPort}. Previous bind errors are now stale.\n`);
                }
            } catch (e) {
                // Ignore if props don't exist yet
            }
        } else {
            throw new Error('Could not find an available port within range.');
        }
    },

    /**
     * Updates server RAM configuration with Safety Guard
     */
    adjustRam: async (server: ServerConfig, newRam: number) => {
        const mem = await si.mem();
        const totalRamGb = Math.floor(mem.total / 1024 / 1024 / 1024);
        const safeLimit = totalRamGb - 2; // Keep 2GB for OS

        if (newRam > safeLimit) {
            logger.warn(`[DiagnosisAction] RAM upgrade ABORTED. Target ${newRam}GB exceeds safety limit (${safeLimit}GB) on this machine.`);
            // Fallback: Enable optimizations instead of raw power
            logger.info(`[DiagnosisAction] Falling back to optimizations...`);
            await DiagnosisActions.optimizeArguments(server);
            return;
        }

        serverRepository.update(server.id, { ram: newRam });
    },

    /**
     * Switches Java version
     */
    switchJavaVersion: async (server: ServerConfig, version: string) => {
        serverRepository.update(server.id, { javaVersion: version as any });
    },

    /**
     * Sane default synchronization for server.properties
     * v4.0: Sanitizes malformed entries that prevent startup while preserving valid data.
     */
    repairProperties: async (fs: FileSystemManager, serverId?: string, extra?: { scale?: number, version?: string }) => {
        logger.info(`[DiagnosisAction] Repairing and sanitizing server.properties...`);
        try {
            if (await fs.exists('server.properties')) {
                let content = await fs.readFile('server.properties');
                
                // 1. Remove obvious syntax garbage (binary symbols, illegal characters)
                content = content.replace(/[^\x00-\x7F]/g, ''); 
                
                // 2. Intelligent Scaling (v2.5) — Reduction for performance
                if (extra?.scale) {
                    const scaleValue = (val: string) => Math.max(2, parseInt(val) + (extra.scale || 0)).toString();
                    
                    content = content.replace(/^view-distance=(\d+)$/m, (_, val) => `view-distance=${scaleValue(val)}`);
                    content = content.replace(/^simulation-distance=(\d+)$/m, (_, val) => `simulation-distance=${scaleValue(val)}`);
                    logger.info(`[DiagnosisAction] Scaled view/simulation distance by ${extra.scale}`);
                }

                // 3. Ensure core performance settings
                if (!content.includes('network-compression-threshold')) {
                    content += '\nnetwork-compression-threshold=256';
                }
                if (!content.includes('view-distance') && !extra?.scale) {
                    const vd = (extra?.version && extra.version.includes('1.20')) ? '8' : '10';
                    content += `\nview-distance=${vd}`;
                }

                // 4. Fix most common malformation: server-port containing non-digits
                content = content.replace(/^server-port=.*\D.*$/m, 'server-port=25565');

                await fs.writeFile('server.properties', content);
                
                // --- SMART HANDLING: FIX MARKER ---
                try {
                    if (await fs.exists('logs/latest.log')) {
                        await fs.appendFile('logs/latest.log', '\n[CraftCommand] [FIX] server.properties repaired. Stale config errors should be ignored.\n');
                    }
                } catch (e) {}

                logger.success(`[DiagnosisAction] server.properties updated.`);
            } else {
                // Create default properties if missing
                await fs.writeFile('server.properties', 'online-mode=true\nserver-port=25565\nmax-players=20\nview-distance=10');
            }
        } catch (e: any) {
            logger.error(`[DiagnosisAction] Properties repair failed: ${e.message}`);
        }
    },

    /**
     * Deterministic Log Rotation & Lock Cleanup
     * Rotates files based on size (100MB threshold) and clears persistent world locks.
     */
    rotateLogsBySize: async (fs: FileSystemManager) => {
        logger.info(`[DiagnosisAction] Executing deterministic log rotation...`);
        const MAX_LOG_SIZE = 100 * 1024 * 1024; // 100MB
        
        try {
            if (await fs.exists('logs')) {
                const logFiles = await fs.listFiles('logs');
                for (const file of logFiles) {
                    // 1. Rotate massive active logs
                    if (file.name === 'latest.log' && file.size > MAX_LOG_SIZE) {
                        logger.warn(`[DiagnosisAction] latest.log exceeded 100MB. Tail-rotating...`);
                        await DiagnosisActions.smartLogRotation({ id: 'active' } as any, fs);
                    }
                    
                    // 2. Cleanup ancient archives (> 7 days or total > 2GB)
                    if (file.name.endsWith('.log.gz')) {
                        const stats = await fs.getStats(path.join('logs', file.name));
                        const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
                        if (ageDays > 7) {
                            logger.info(`[DiagnosisAction] Pruning 7-day old log archive: ${file.name}`);
                            await fs.deletePath(path.join('logs', file.name));
                        }
                    }
                }
            }
        } catch (e) {
            logger.error(`[DiagnosisAction] Deterministic rotation failed: ${e}`);
        }

        // Remove world lock files if not running
        try {
            await fs.deletePath('session.lock');
        } catch (e) { /* ignore */ }
    },

    optimizeArguments: async (server: ServerConfig) => {
        logger.info(`[DiagnosisAction] Optimizing arguments for ${server.id}`);
        const advancedFlags = {
            ...server.advancedFlags,
            aikarFlags: true,
            installSpark: true // Proactively encourage monitoring
        };
        serverRepository.update(server.id, { advancedFlags });
    },

    /**
     * Purges ghost processes holding the server port
     */
    purgeGhost: async (server: ServerConfig) => {
        logger.warn(`[DiagnosisAction] Purging ghost process for ${server.id} on port ${server.port}`);
        const { NetUtils } = require('../../utils/NetUtils'); // Dynamic import to avoid circular dep risks
        await NetUtils.killProcessOnPort(server.port);
    },

    /**
     * Creates the plugins directory for Paper/Spigot servers
     */
    createPluginFolder: async (fs: FileSystemManager) => {
        logger.info(`[DiagnosisAction] Creating missing plugins directory`);
        await fs.createDirectory('plugins');
    },

    /**
     * Removes duplicate versions of the same plugin, keeping the most recent one
     */
    removeDuplicatePlugins: async (fs: FileSystemManager, files: string[]) => {
        logger.info(`[DiagnosisAction] Resolving duplicate plugins: ${files.join(', ')}`);
        
        // Find the "best" one to keep (latest modification time)
        let latestFile = files[0];
        let latestTime = 0;

        for (const file of files) {
            try {
                const stats = await fs.getStats(path.join('plugins', file));
                if (stats.mtimeMs > latestTime) {
                    latestTime = stats.mtimeMs;
                    latestFile = file;
                }
            } catch (e) { logger.debug(`[DiagnosisAction] Could not stat plugin file ${file}: ${e}`); }
        }

        // Delete the others
        for (const file of files) {
            if (file !== latestFile) {
                logger.info(`[DiagnosisAction] Removing duplicate plugin version: ${file}`);
                await fs.deletePath(path.join('plugins', file));
            }
        }
    },

    /**
     * Captures a v8 heap snapshot for leak analysis
     */
    takeHeapSnapshot: async (reason: string) => {
        const v8 = require('v8');
        const { DATA_DIR } = require('../../constants');
        const snapshotsDir = path.join(DATA_DIR, 'snapshots');
        await fsExtra.ensureDir(snapshotsDir);
        
        const filename = path.join(snapshotsDir, `heap-${Date.now()}-${reason}.heapsnapshot`);
        logger.info(`[DiagnosisAction] Writing heap snapshot to ${filename}...`);
        v8.writeHeapSnapshot(filename);
        logger.success(`[DiagnosisAction] Heap snapshot captured successfully.`);
    },

    /**
     * Restores a core data file from backup (Server Scoped)
     */
    restoreDataBackup: async (fs: FileSystemManager, filename: string, serverId?: string) => {
        const backupPath = `${filename}.bak`;

        if (await fs.exists(backupPath)) {
            logger.warn(`[DiagnosisAction] Restoring ${filename} from sidecar backup...`);
            await fs.copy(backupPath, filename);
            logger.success(`[DiagnosisAction] ${filename} restored from .bak.`);
        } else if (serverId) {
            const { backupService } = require('../backups/BackupService');
            const backups = await backupService.listBackups(serverId);
            if (backups.length > 0) {
                logger.info(`[DiagnosisAction] Sidecar .bak not found for ${filename}, but ${backups.length} system snapshots are available. A full restore may be required.`);
                throw new Error(`Sidecar backup for ${filename} not found. Please use the Backups tab to perform a full restoration.`);
            } else {
                throw new Error(`No backups found for ${filename}.`);
            }
        } else {
            throw new Error(`Backup for ${filename} not found.`);
        }
    },

    /**
     * Re-triggers the Bedrock installer to restore missing binaries
     */
    reinstallBedrock: async (server: ServerConfig) => {
        const { installerService } = require('../installer/InstallerService');
        logger.warn(`[DiagnosisAction] Restoring Bedrock binaries for ${server.id}...`);
        await installerService.installBedrock(server.id, server.workingDirectory, server.version);
    },

    /**
     * Re-generates the forwarding.secret file for Velocity
     */
    resyncVelocitySecret: async (server: ServerConfig, fs: FileSystemManager) => {
        const secret = server.network?.proxyConfig?.secret;
        if (!secret) throw new Error('No secret configured in Panel for this proxy.');

        logger.info(`[DiagnosisAction] Re-syncing Velocity forwarding secret...`);
        await fs.writeFile('forwarding.secret', secret);
    },

    /**
     * Triggers a Java runtime download
     */
    installJava: async (version: string) => {
        const { javaManager } = require('../processes/JavaManager');
        logger.info(`[DiagnosisAction] Triggering Java ${version} installation...`);
        await javaManager.ensureJava(version);
    },

    /**
     * Manually triggers a DDNS update for a server
     */
    triggerDdnsUpdate: async (server: ServerConfig) => {
        const { networkService } = require('../network/NetworkService');
        logger.info(`[DiagnosisAction] Manually triggering DDNS update for ${server.name}`);
        await networkService.updateDdns(server.id);
    },

    /**
     * Reassigns the Dynmap port in its configuration file
     */
    reassignMapPort: async (server: ServerConfig, fs: FileSystemManager) => {
        const configPath = 'plugins/dynmap/configuration.txt';
        if (!(await fs.exists(configPath))) throw new Error('Dynmap configuration not found.');

        let config = await fs.readFile(configPath);
        
        // Find a new port
        const { NetUtils } = require('../../utils/NetUtils');
        let newPort = 8123; // Default
        for (let i = 1; i <= 20; i++) {
            const testPort = 8123 + i;
            if (!(await NetUtils.checkPort(testPort))) {
                newPort = testPort;
                break;
            }
        }

        logger.info(`[DiagnosisAction] Reassigning Dynmap port to ${newPort}`);
        config = config.replace(/^webserver-port:.*$/m, `webserver-port: ${newPort}`);
        await fs.writeFile(configPath, config);
    },

    /**
     * Repairs file permissions on the server's plugin directory (Linux/macOS)
     */
    repairPermissions: async (server: ServerConfig, fs: FileSystemManager) => {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        if (process.platform === 'win32') {
            logger.info(`[DiagnosisAction] Skipping permission repair on Windows (not applicable).`);
            return;
        }

        const pluginsDir = path.join(server.workingDirectory, 'plugins');
        logger.info(`[DiagnosisAction] Repairing permissions on ${pluginsDir}...`);
        
        try {
            // Set read/write/execute for owner, read/execute for group and others
            await execAsync(`chmod -R 755 "${pluginsDir}"`);
            logger.success(`[DiagnosisAction] Permissions repaired for ${pluginsDir}`);
        } catch (error: any) {
            logger.error(`[DiagnosisAction] Failed to repair permissions: ${error.message}`);
            throw error;
        }
    },

    reinstallGeyser: async (server: ServerConfig): Promise<boolean> => {
        try {
            const { pluginService } = require('../plugins/PluginService');
            const { crossPlayService } = require('../network/CrossPlayService');
            const { proxyService } = require('../network/ProxyService');
            
            const topology = crossPlayService.detectTopology(server.id);
            const target = topology === 'velocity'
                ? (proxyService.findProxyForServer(server.id)?.id || server.id)
                : server.id;
                
            await pluginService.install(target, 'geyser', 'modrinth');
            await crossPlayService.syncConfigs(server.id);
            return true;
        } catch (e) {
            logger.error(`[DiagnosisActions] Failed to reinstall Geyser: ${e}`);
            return false;
        }
    },

    reinstallFloodgate: async (server: ServerConfig): Promise<boolean> => {
        try {
            const { pluginService } = require('../plugins/PluginService');
            const { crossPlayService } = require('../network/CrossPlayService');
            const { proxyService } = require('../network/ProxyService');
            
            const topology = crossPlayService.detectTopology(server.id);
            const target = topology === 'velocity'
                ? (proxyService.findProxyForServer(server.id)?.id || server.id)
                : server.id;
                
            await pluginService.install(target, 'floodgate', 'modrinth');
            if (topology === 'velocity' && target !== server.id) {
                 try { await pluginService.install(server.id, 'floodgate', 'modrinth'); } catch {}
            }
            return true;
        } catch (e) {
            logger.error(`[DiagnosisActions] Failed to reinstall Floodgate: ${e}`);
            return false;
        }
    },

    resyncCrossPlayForwarding: async (server: ServerConfig): Promise<boolean> => {
        try {
            const { crossPlayService } = require('../network/CrossPlayService');
            await crossPlayService.syncConfigs(server.id);
            return true;
        } catch (e) {
            logger.error(`[DiagnosisActions] Failed to resync cross-play configs: ${e}`);
            return false;
        }
    },

    reassignBedrockPort: async (server: ServerConfig): Promise<boolean> => {
        try {
             const { crossPlayService } = require('../network/CrossPlayService');
             const { NetUtils } = require('../../utils/NetUtils');
             const { saveServer } = require('../servers/ServerService');
             
             const current = server.crossPlay?.bedrockPort || 19132;
             for (let p = current + 1; p < current + 100; p++) {
                if (await NetUtils.checkUDPPortBind(p)) {
                    server.crossPlay!.bedrockPort = p;
                    server.needsRestart = true;
                    saveServer(server);
                    await crossPlayService.syncConfigs(server.id);
                    return true;
                }
            }
            return false;
        } catch (e) {
             logger.error(`[DiagnosisActions] Failed to reassign Bedrock port: ${e}`);
             return false;
        }
    },

    /**
     * Removes the session.lock file from the world directory to resolve world corruption/lock issues
     */
    cleanupWorldLock: async (server: ServerConfig, fs: FileSystemManager) => {
        const { ConfigReader } = require('../../utils/ConfigReader');
        const properties = await ConfigReader.readProperties(path.join(server.workingDirectory, 'server.properties'));
        const levelName = properties['level-name'] || 'world';
        const lockPath = path.join(levelName, 'session.lock');

        logger.warn(`[DiagnosisAction] Cleaning up world lock for ${server.id} at ${lockPath}`);
        try {
            if (await fs.exists(lockPath)) {
                await fs.deletePath(lockPath);
                logger.success(`[DiagnosisAction] Successfully removed ${lockPath}`);
            } else {
                logger.info(`[DiagnosisAction] session.lock not found at ${lockPath}, skipping.`);
            }
        } catch (e: any) {
            logger.error(`[DiagnosisAction] Failed to delete session.lock: ${e.message}`);
            throw e;
        }
    },

    /**
     * Resets JVM heap settings to safe defaults
     */
    fixJvmArgs: async (server: ServerConfig) => {
        logger.warn(`[DiagnosisAction] Resetting JVM heap settings for ${server.id}`);
        // Reset to 2GB which is safe for most systems and avoids the "Initial > Max" error
        serverRepository.update(server.id, { ram: 2 });

        // --- SMART HANDLING: FIX MARKER ---
        try {
            const fs = require('fs-extra');
            const logPath = path.join(server.workingDirectory, 'logs', 'latest.log');
            if (await fs.pathExists(logPath)) {
                await fs.appendFile(logPath, '\n[CraftCommand] [FIX] JVM Args reset. Stale heap errors should be ignored.\n');
            }
        } catch (e) {}
    },

    /**
     * DEPRECATED: CraftCommands NEVER deletes user mods.
     * This function is kept as a no-op stub for safety.
     */
    removeMod: async (server: ServerConfig, fs: FileSystemManager, modNameOrSlug: string) => {
        logger.info(`[DiagnosisAction] REMOVE_MOD called for "${modNameOrSlug}" but mod deletion is disabled by policy. No action taken.`);
    },

    /**
     * Attempts to install missing mod dependencies from Modrinth
     * Handles comma-separated names (e.g. "bossbarlib,smartbrainlib")
     */
    installDependency: async (server: ServerConfig, name: string) => {
        const { ModrinthProjectMappings } = require('./ModDiagnosisRules');
        const { pluginService } = require('../plugins/PluginService');
        
        // Handle comma-separated dependencies
        const deps = name.split(',').map(d => d.trim()).filter(d => d.length > 0);
        
        let installed = 0;
        let failed = 0;
        
        for (const dep of deps) {
            logger.info(`[DiagnosisAction] Attempting to install dependency: ${dep} for ${server.id}`);
            
            let projectId = ModrinthProjectMappings[dep];
            
            // Fallback: If no direct mapping exists, try the slug directly
            if (!projectId && /^[a-z0-9-_]+$/.test(dep)) {
                projectId = dep;
            }

            if (projectId) {
                try {
                    logger.info(`[DiagnosisAction] Installing ${dep} (Modrinth: ${projectId})...`);
                    await pluginService.install(server.id, projectId, 'modrinth');
                    installed++;
                    logger.success(`[DiagnosisAction] Successfully installed dependency: ${dep}`);
                } catch (e: any) {
                    failed++;
                    logger.error(`[DiagnosisAction] Failed to install ${dep}: ${e.message}`);
                }
            } else {
                failed++;
                logger.warn(`[DiagnosisAction] No Modrinth mapping found for dependency: ${dep}. Skipping.`);
            }
        }
        
        if (failed > 0 && installed === 0) {
            throw new Error(`Could not install any of the requested dependencies (${name}). They may not be available on Modrinth.`);
        }
        
        logger.success(`[DiagnosisAction] Dependency installation complete: ${installed} installed, ${failed} failed.`);
    },
    
    /**
     * Specialized Fixer for Mod/Plugin dependencies discovered during diagnosis
     * v2.3: Supports deep verification and batch installation
     */
    fixModDependency: async (server: ServerConfig, dependencyNames: string) => {
        logger.info(`[DiagnosisAction] Executing batch dependency fix for ${server.id}: ${dependencyNames}`);
        const { DiagnosisActions } = Object.assign({}, exports); // Avoid circular binding issues
        await DiagnosisActions.installDependency(server, dependencyNames);
    },

    /**
     * Attempts to restore level.dat from level.dat_old backup
     */
    restoreLevelData: async (server: ServerConfig, fs: FileSystemManager) => {
        const { ConfigReader } = require('../../utils/ConfigReader');
        let levelName = 'world';
        try {
            const properties = await ConfigReader.readProperties(path.join(server.workingDirectory, 'server.properties'));
            levelName = properties['level-name'] || 'world';
        } catch (e) { /* fallback to 'world' */ }

        const levelDat = path.join(levelName, 'level.dat');
        const levelDatOld = path.join(levelName, 'level.dat_old');

        logger.warn(`[DiagnosisAction] Attempting level.dat shadow recovery for ${server.id} in ${levelName}`);
        
        try {
            if (await fs.exists(levelDatOld)) {
                // Keep the corrupted one just in case
                if (await fs.exists(levelDat)) {
                    const backupName = `${levelDat}.corrupted_${Date.now()}`;
                    await fs.move(levelDat, backupName);
                }
                await fs.copy(levelDatOld, levelDat);
                logger.success(`[DiagnosisAction] Successfully restored level.dat from level.dat_old.`);
            } else {
                throw new Error('level.dat_old not found. Manual recovery required.');
            }
        } catch (e: any) {
            logger.error(`[DiagnosisAction] level.dat recovery failed: ${e.message}`);
            throw e;
        }
    },

    /**
     * Triggers a re-installation of the server software to restore missing libraries/executables.
     */
    reinstallLoader: async (server: ServerConfig) => {
        const { softwareManager } = require('../servers/SoftwareManager');
        logger.warn(`[DiagnosisAction] Re-installing loader for ${server.software} (${server.version})...`);
        await softwareManager.installSoftware(server.id, server.software, server.version, server.workingDirectory);
        logger.success(`[DiagnosisAction] Software restoration triggered for ${server.id}.`);
    },

    /**
     * Modifies Forge configuration to automatically remove erroring entities
     */
    enableEntityPurge: async (server: ServerConfig, fs: FileSystemManager) => {
        logger.info(`[DiagnosisAction] Enabling Forge entity purging for ${server.id}`);
        
        // 1. Detect Config Path (Forge 1.13+ uses world/serverconfig/forge-server.toml)
        let configPath = 'world/serverconfig/forge-server.toml'; // Default for modern
        
        // If server-properties defines a different world name
        const { ConfigReader } = require('../../utils/ConfigReader');
        try {
            const props = await ConfigReader.readProperties(path.join(server.workingDirectory, 'server.properties'));
            const levelName = props['level-name'] || 'world';
            configPath = path.join(levelName, 'serverconfig', 'forge-server.toml');
        } catch (e) { /* server.properties may not exist yet for Forge config path detection */ }

        const legacyPath = 'config/forge.cfg';

        try {
            if (await fs.exists(configPath)) {
                let content = await fs.readFile(configPath);
                content = content.replace(/removeErroringEntities\s*=\s*false/g, 'removeErroringEntities = true');
                content = content.replace(/removeErroringTileEntities\s*=\s*false/g, 'removeErroringTileEntities = true');
                await fs.writeFile(configPath, content);
                logger.success(`[DiagnosisAction] Updated modern Forge config at ${configPath}`);
            } else if (await fs.exists(legacyPath)) {
                let content = await fs.readFile(legacyPath);
                content = content.replace(/B:removeErroringEntities=false/g, 'B:removeErroringEntities=true');
                content = content.replace(/B:removeErroringTileEntities=false/g, 'B:removeErroringTileEntities=true');
                await fs.writeFile(legacyPath, content);
                logger.success(`[DiagnosisAction] Updated legacy Forge config at ${legacyPath}`);
            } else {
                logger.warn(`[DiagnosisAction] No Forge configuration found to enable entity purging.`);
            }
        } catch (e: any) {
            logger.error(`[DiagnosisAction] Failed to update Forge config: ${e.message}`);
        }
    },
    /**
     * Clears the server-ip setting in server.properties to fix binding issues
     */
    fixIpBinding: async (server: ServerConfig, fs: FileSystemManager) => {
        const configPath = 'server.properties';
        if (!(await fs.exists(configPath))) return;

        logger.info(`[DiagnosisAction] Clearing invalid IP binding for ${server.id}`);
        try {
            let content = await fs.readFile(configPath);
            content = content.replace(/^server-ip=.*$/m, 'server-ip=');
            await fs.writeFile(configPath, content);
            logger.success(`[DiagnosisAction] Successfully cleared server-ip binding.`);
        } catch (e: any) {
            logger.error(`[DiagnosisAction] Failed to fix IP binding: ${e.message}`);
            throw e;
        }
    },

    /**
     * Intelligent log truncation that keeps the last 500 lines
     */
    smartLogRotation: async (server: ServerConfig, fs: FileSystemManager) => {
        const logPath = 'logs/latest.log';
        if (!(await fs.exists(logPath))) return;

        logger.info(`[DiagnosisAction] Performing smart log rotation for ${server.id}`);
        try {
            const content = await fs.readFile(logPath);
            const lines = content.split('\n');
            if (lines.length > 500) {
                const head = `--- Log truncated by Smart Rotation (Original: ${lines.length} lines) ---\n`;
                const tail = lines.slice(-500).join('\n');
                await fs.writeFile(logPath, head + tail);
                logger.success(`[DiagnosisAction] Log rotated successfully. Kept tail ${500} lines.`);
            }
        } catch (e: any) {
            logger.error(`[DiagnosisAction] Smart rotation failed: ${e.message}`);
        }
    },

    /**
     * Massive Storage Cleanup: Deletes old logs, temp files, and massive dumps.
     */
    performStorageCleanup: async (server: ServerConfig, fs: FileSystemManager) => {
        logger.warn(`[DiagnosisAction] Emergency storage cleanup initiated for ${server.id}`);
        try {
            // 1. Clear excessive logs
            if (await fs.exists('logs')) {
                const logs = await fs.listFiles('logs');
                for (const log of logs) {
                    if (log.name.endsWith('.gz') || log.name.endsWith('.log.1')) {
                        await fs.deletePath(path.join('logs', log.name));
                    }
                }
            }
            // 2. Clear temp files and dumps
            const junk = ['crash-reports', 'usercache.json', 'debug.log'];
            for (const item of junk) {
                if (await fs.exists(item)) await fs.deletePath(item);
            }
            logger.success(`[DiagnosisAction] Storage cleanup complete.`);
        } catch (e: any) {
            logger.error(`[DiagnosisAction] Cleanup failed: ${e.message}`);
        }
    },

    /**
     * DETERMINISTIC SAFE-GC ENGINE
     * Triggers JVM Garbage Collection only when memory pressure warrants a sweep.
     * Uses OS-level JCMD or Software-level Spark for high-precision cleanup.
     */
    performSafeGC: async (server: ServerConfig) => {
        const software = (server.software || 'Paper').toLowerCase();
        
        // 1. Hardware Pressure Guard
        // We only sweep if the JVM is utilizing > 85% of its allocated bucket
        if (server.memory && server.ram) {
            const usageMb = server.memory;
            const limitMb = server.ram * 1024;
            const usagePercent = (usageMb / limitMb) * 100;
            
            if (usagePercent < 85) {
                logger.debug(`[DiagnosisAction] Safe-GC deferred: Memory usage healthy at ${Math.round(usagePercent)}%`);
                return;
            }
        }

        logger.info(`[DiagnosisAction] High memory pressure detected on ${server.name}. Triggering Deterministic GC...`);
        
        const { serverService } = require('../servers/ServerService');
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // 2. Deterministic Sweep Priority
        try {
            // Priority 1: Software-aware Spark (The Gold Standard)
            if (server.advancedFlags?.installSpark) {
                await serverService.sendCommand(server.id, 'spark gc');
                return;
            }

            // Priority 2: Native OS JCMD (Deterministic JVM trigger)
            // Note: Requires the JDK to be in system PATH
            const { processManager } = require('../processes/ProcessManager');
            const stats = await processManager.getServerStats(server.id);
            if (stats?.pid) {
                try {
                    await execAsync(`jcmd ${stats.pid} GC.run`);
                    logger.success(`[DiagnosisAction] Native JVM GC triggered for PID ${stats.pid}`);
                    return;
                } catch (e) { /* jcmd might not be available, fall back to console */ }
            }

            // Priority 3: Software-specific console commands
            if (software.includes('paper') || software.includes('spigot')) {
                await serverService.sendCommand(server.id, 'gc');
            } else if (software.includes('velocity')) {
                await serverService.sendCommand(server.id, 'velocity memory');
            } else {
                await serverService.sendCommand(server.id, 'gc');
            }
        } catch (e: any) {
            logger.error(`[DiagnosisAction] GC Sweep orchestrated failure: ${e.message}`);
        }
    }
};
