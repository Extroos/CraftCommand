
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
 * These are called by AutoHealingManager with a scoped FileSystemManager.
 */
export const DiagnosisActions = {
    /**
     * Automatically accepts the EULA
     */
    agreeEula: async (fs: FileSystemManager) => {
        logger.info(`[DiagnosisAction] Automatically agreeing to EULA`);
        await fs.writeFile('eula.txt', 'eula=true');
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
     * Advanced: Deep-merges properties with sane defaults
     */
    repairProperties: async (fs: FileSystemManager, version: string) => {
        logger.info(`[DiagnosisAction] Repairing server.properties...`);
        try {
            let content = await fs.readFile('server.properties');
            // Ensure core performance settings
            if (!content.includes('network-compression-threshold')) {
                content += '\nnetwork-compression-threshold=256';
            }
            if (!content.includes('view-distance')) {
                content += '\nview-distance=10';
            }
            await fs.writeFile('server.properties', content);
        } catch (e) {
            // Create default properties if missing
            await fs.writeFile('server.properties', 'online-mode=true\nserver-port=25565\nmax-players=20');
        }
    },

    /**
     * Advanced: Truncates massive logs and clears locks
     */
    cleanupTelemetry: async (fs: FileSystemManager) => {
        logger.info(`[DiagnosisAction] Cleaning up telemetry...`);
        
        // Truncate latest.log if it exists
        try {
            await fs.writeFile('logs/latest.log', '--- Log truncated by Auto-Healing ---');
        } catch (e) {}

        // Remove lock files
        try {
            await fs.deletePath('session.lock');
        } catch (e) {}
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
            } catch (e) {}
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
    restoreDataBackup: async (fs: FileSystemManager, filename: string) => {
        const backupPath = `${filename}.bak`;

        if (await fs.exists(backupPath)) {
            logger.warn(`[DiagnosisAction] Restoring ${filename} from backup...`);
            await fs.copy(backupPath, filename);
            logger.success(`[DiagnosisAction] ${filename} restored.`);
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
    }
};
