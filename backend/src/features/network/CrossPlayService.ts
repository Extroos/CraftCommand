
import { ServerConfig } from '@shared/types';
import { pluginService } from '../plugins/PluginService';
import { proxyService } from './ProxyService';
import { serverRepository } from '../../storage/ServerRepository';
import { getServer, saveServer, getServers } from '../servers/ServerService';
import { NetUtils } from '../../utils/NetUtils';
import { logger } from '../../utils/logger';
import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';

/** Software types that support Geyser/Floodgate cross-play */
const COMPATIBLE_SOFTWARE = ['Paper', 'Spigot', 'Purpur', 'Fabric', 'Velocity', 'Folia'];
const DEFAULT_BEDROCK_PORT = 19132;

/** Modrinth project slugs */
const GEYSER_SLUG = 'geyser';
const FLOODGATE_SLUG = 'floodgate';

export interface CrossPlayStatus {
    enabled: boolean;
    compatible: boolean;
    incompatibleReason?: string;
    topology: 'standalone' | 'velocity' | 'unknown';
    bedrockPort: number;
    geyserInstalled: boolean;
    floodgateInstalled: boolean;
    bedrockPortAvailable?: boolean;
    geyserVersion?: string;
    floodgateVersion?: string;
}

export class CrossPlayService {

    /**
     * Detect whether the server is standalone or behind a Velocity proxy.
     */
    public detectTopology(serverId: string): 'standalone' | 'velocity' {
        const server = getServer(serverId);
        if (!server) return 'standalone';

        // Check if this server is itself a Velocity proxy
        if (server.software === 'Velocity') return 'standalone';

        // Check if any Velocity proxy has this server linked
        const proxy = proxyService.findProxyForServer(serverId);
        return proxy ? 'velocity' : 'standalone';
    }

    /**
     * Validate whether the server software supports cross-play.
     */
    public validateCompatibility(serverId: string): { compatible: boolean; reason?: string } {
        const server = getServer(serverId);
        if (!server) return { compatible: false, reason: 'Server not found' };

        if (!COMPATIBLE_SOFTWARE.includes(server.software)) {
            return {
                compatible: false,
                reason: `${server.software} does not support Geyser/Floodgate. Compatible: ${COMPATIBLE_SOFTWARE.join(', ')}`
            };
        }

        if (server.software === 'Fabric') {
            return {
                compatible: true,
                reason: 'Fabric requires Geyser-Fabric mod variant — will be installed automatically.'
            };
        }

        return { compatible: true };
    }

    /**
     * One-click cross-play enablement.
     * Installs Geyser + Floodgate, writes configs, syncs forwarding.
     */
    public async enable(serverId: string, bedrockPort?: number): Promise<{
        success: boolean;
        message: string;
        needsRestart: boolean;
        topology: 'standalone' | 'velocity';
    }> {
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        // 1. Validate
        const compat = this.validateCompatibility(serverId);
        if (!compat.compatible) {
            return { success: false, message: compat.reason!, needsRestart: false, topology: 'standalone' };
        }

        // 2. Detect topology
        const topology = this.detectTopology(serverId);
        const targetPort = bedrockPort || DEFAULT_BEDROCK_PORT;

        logger.info(`[CrossPlay] Enabling for ${server.name} (${server.software}, topology: ${topology}, bedrock port: ${targetPort})`);

        // 3. Determine install target
        // In velocity topology: Geyser goes on the PROXY, Floodgate on BOTH proxy and backends
        let geyserTarget = serverId;
        let floodgateTarget = serverId;

        if (topology === 'velocity') {
            const proxy = proxyService.findProxyForServer(serverId);
            if (proxy) {
                geyserTarget = proxy.id;
                floodgateTarget = proxy.id; // Floodgate on proxy
                logger.info(`[CrossPlay] Velocity topology: installing on proxy ${proxy.name} (${proxy.id})`);
            }
        }

        // 4. Install Geyser
        try {
            logger.info(`[CrossPlay] Installing Geyser on ${geyserTarget}...`);
            await pluginService.install(geyserTarget, GEYSER_SLUG, 'modrinth');
            logger.success(`[CrossPlay] Geyser installed.`);
        } catch (e: any) {
            // May already be installed
            if (e.message?.includes('already installed') || e.message?.includes('already exists')) {
                logger.info(`[CrossPlay] Geyser already installed on ${geyserTarget}.`);
            } else {
                logger.error(`[CrossPlay] Failed to install Geyser: ${e.message}`);
                return { success: false, message: `Failed to install Geyser: ${e.message}`, needsRestart: false, topology };
            }
        }

        // 5. Install Floodgate
        try {
            logger.info(`[CrossPlay] Installing Floodgate on ${floodgateTarget}...`);
            
            // Fix: Modrinth lacks Spigot tags, Spiget ID is unreliable. Use Official GeyserMC API.
            const fgTargetServer = getServer(floodgateTarget);
            const isFabric = fgTargetServer?.software === 'Fabric' || fgTargetServer?.software === 'Forge';
            
            if (isFabric) {
                await pluginService.install(floodgateTarget, FLOODGATE_SLUG, 'modrinth');
            } else {
                // Direct download from GeyserMC Build Server
                const geyserApiUrl = 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot';
                // Use pipe syntax to force filename
                await pluginService.install(floodgateTarget, `${geyserApiUrl}|floodgate-spigot.jar`, 'direct');
            }
            logger.success(`[CrossPlay] Floodgate installed.`);
        } catch (e: any) {
            if (e.message?.includes('already installed') || e.message?.includes('already exists')) {
                logger.info(`[CrossPlay] Floodgate already installed on ${floodgateTarget}.`);
            } else {
                logger.warn(`[CrossPlay] Failed to install Floodgate: ${e.message}`);
                // Floodgate is optional — Geyser works without it (just no prefix-based linkage)
            }
        }

        // 6. If velocity topology, install Floodgate on the backend too
        if (topology === 'velocity' && floodgateTarget !== serverId) {
            try {
                // Backend is likely Paper/Spigot/Folia -> Use Official API
                const backendServer = getServer(serverId);
                const isFabric = backendServer?.software === 'Fabric' || backendServer?.software === 'Forge';
                
                if (isFabric) {
                    await pluginService.install(serverId, FLOODGATE_SLUG, 'modrinth');
                } else {
                    const geyserApiUrl = 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot';
                    await pluginService.install(serverId, `${geyserApiUrl}|floodgate-spigot.jar`, 'direct');
                }

                logger.success(`[CrossPlay] Floodgate installed on backend ${server.name}.`);
            } catch (e: any) {
                if (!e.message?.includes('already')) {
                    logger.warn(`[CrossPlay] Could not install Floodgate on backend: ${e.message}`);
                }
            }
        }

        // 7. Write Geyser config
        const geyserTargetServer = getServer(geyserTarget);
        if (geyserTargetServer) {
            await this.writeGeyserConfig(geyserTargetServer, targetPort, topology);
        }

        // 8. Sync Velocity forwarding if applicable
        if (topology === 'velocity') {
            const proxy = proxyService.findProxyForServer(serverId);
            if (proxy) {
                await proxyService.syncForwarding(proxy.id);
                logger.info(`[CrossPlay] Velocity forwarding synced.`);
            }
        }

        // 9. Check UDP port availability
        const isPortBusy = await NetUtils.checkUDPPortBind(targetPort);
        if (isPortBusy) {
            logger.warn(`[CrossPlay] UDP port ${targetPort} may be in use. Bedrock clients might not connect.`);
        }

        // 10. Update server config
        server.crossPlay = {
            enabled: true,
            bedrockPort: targetPort,
            geyserMode: 'plugin',
            topology,
            installedAt: Date.now()
        };
        server.needsRestart = true;
        saveServer(server);

        const portWarning = isPortBusy ? ` Warning: UDP port ${targetPort} may already be in use.` : '';
        return {
            success: true,
            message: `Cross-play enabled! Geyser + Floodgate installed (${topology} mode). Restart required.${portWarning}`,
            needsRestart: true,
            topology
        };
    }

    /**
     * Disable cross-play and clean up plugins.
     */
    public async disable(serverId: string): Promise<{ success: boolean; message: string }> {
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        logger.info(`[CrossPlay] Disabling for ${server.name}`);

        // Uninstall Geyser and Floodgate from this server
        const installed = pluginService.getInstalled(serverId);

        for (const plugin of installed) {
            const name = (plugin.name || '').toLowerCase();
            if (name.includes('geyser') || name.includes('floodgate')) {
                try {
                    await pluginService.uninstall(serverId, plugin.id);
                    logger.info(`[CrossPlay] Uninstalled ${plugin.name}`);
                } catch (e: any) {
                    logger.warn(`[CrossPlay] Failed to uninstall ${plugin.name}: ${e.message}`);
                }
            }
        }

        // If velocity topology, also clean proxy
        if (server.crossPlay?.topology === 'velocity') {
            const proxy = proxyService.findProxyForServer(serverId);
            if (proxy) {
                const proxyPlugins = pluginService.getInstalled(proxy.id);
                for (const plugin of proxyPlugins) {
                    const name = (plugin.name || '').toLowerCase();
                    if (name.includes('geyser') || name.includes('floodgate')) {
                        try {
                            await pluginService.uninstall(proxy.id, plugin.id);
                            logger.info(`[CrossPlay] Uninstalled ${plugin.name} from proxy ${proxy.name}`);
                        } catch (e: any) {
                            logger.warn(`[CrossPlay] Failed to uninstall ${plugin.name} from proxy: ${e.message}`);
                        }
                    }
                }
            }
        }

        // Clear config - explicitly set to undefined to ensure overwrite during merge
        server.crossPlay = undefined;
        server.needsRestart = true;
        saveServer(server);

        return { success: true, message: 'Cross-play disabled. Geyser and Floodgate removed. Restart required.' };
    }

    /**
     * Get detailed cross-play status for a server.
     */
    public async getStatus(serverId: string): Promise<CrossPlayStatus> {
        const server = getServer(serverId);
        if (!server) {
            return {
                enabled: false, compatible: false, incompatibleReason: 'Server not found',
                topology: 'unknown', bedrockPort: DEFAULT_BEDROCK_PORT,
                geyserInstalled: false, floodgateInstalled: false
            };
        }

        const compat = this.validateCompatibility(serverId);
        const topology = this.detectTopology(serverId);
        const bedrockPort = server.crossPlay?.bedrockPort || DEFAULT_BEDROCK_PORT;

        // Check installed plugins
        const checkTarget = topology === 'velocity'
            ? (proxyService.findProxyForServer(serverId)?.id || serverId)
            : serverId;

        const installed = pluginService.getInstalled(checkTarget);
        const geyserPlugin = installed.find(p => (p.name || '').toLowerCase().includes('geyser'));
        const floodgatePlugin = installed.find(p => (p.name || '').toLowerCase().includes('floodgate'));

        // UDP port check
        let bedrockPortAvailable: boolean | undefined;
        if (server.status !== 'ONLINE') {
            bedrockPortAvailable = await NetUtils.checkUDPPortBind(bedrockPort);
        }

        return {
            enabled: server.crossPlay?.enabled || false,
            compatible: compat.compatible,
            incompatibleReason: compat.reason,
            topology,
            bedrockPort,
            geyserInstalled: !!geyserPlugin,
            floodgateInstalled: !!floodgatePlugin,
            bedrockPortAvailable,
            geyserVersion: geyserPlugin?.version,
            floodgateVersion: floodgatePlugin?.version
        };
    }

    /**
     * Write Geyser config.yml with correct settings for the topology.
     */
    private async writeGeyserConfig(server: ServerConfig, bedrockPort: number, topology: 'standalone' | 'velocity'): Promise<void> {
        // Geyser stores its config in plugins/Geyser-<Platform>/config.yml
        const possibleDirs = [
            path.join(server.workingDirectory, 'plugins', 'Geyser-Spigot'),
            path.join(server.workingDirectory, 'plugins', 'Geyser-Paper'),
            path.join(server.workingDirectory, 'plugins', 'Geyser-Velocity'),
            path.join(server.workingDirectory, 'plugins', 'Geyser-Fabric'),
            path.join(server.workingDirectory, 'plugins', 'Geyser-ViaProxy'),
            path.join(server.workingDirectory, 'mods', 'Geyser-Fabric'),
        ];

        // Create config dir if none exists — use the most likely one based on software
        let configDir: string | null = null;
        for (const dir of possibleDirs) {
            if (await fs.pathExists(dir)) {
                configDir = dir;
                break;
            }
        }

        if (!configDir) {
            // Create the appropriate directory
            const softwareMap: Record<string, string> = {
                'Paper': 'Geyser-Spigot',
                'Spigot': 'Geyser-Spigot',
                'Purpur': 'Geyser-Spigot',
                'Velocity': 'Geyser-Velocity',
                'Fabric': 'Geyser-Fabric',
                'Folia': 'Geyser-Spigot'
            };
            const folderName = softwareMap[server.software] || 'Geyser-Spigot';
            const parentDir = server.software === 'Fabric' ? 'mods' : 'plugins';
            configDir = path.join(server.workingDirectory, parentDir, folderName);
            await fs.ensureDir(configDir);
        }

        const configPath = path.join(configDir, 'config.yml');
        
        // Build config — Geyser will generate defaults on first run, but we set key values
        const config: Record<string, any> = {
            bedrock: {
                address: '0.0.0.0',
                port: bedrockPort,
                'clone-remote-port': false,
                motd1: 'CraftCommand Server',
                motd2: 'Cross-Play Enabled'
            },
            remote: {
                address: 'auto',
                port: server.port,
                'auth-type': topology === 'velocity' ? 'floodgate' : 'floodgate'
            },
            'passthrough-motd': true,
            'passthrough-player-counts': true,
            'command-suggestions': true
        };

        try {
            const yamlStr = YAML.stringify(config, { indent: 2 });
            await fs.writeFile(configPath, yamlStr, 'utf8');
            logger.info(`[CrossPlay] Wrote Geyser config to ${configPath}`);
        } catch (e: any) {
            logger.error(`[CrossPlay] Failed to write Geyser config: ${e.message}`);
        }
    }

    /**
     * Re-sync Geyser/Floodgate configs — used by diagnosis heal actions.
     */
    public async syncConfigs(serverId: string): Promise<void> {
        const server = getServer(serverId);
        if (!server?.crossPlay?.enabled) return;

        const topology = this.detectTopology(serverId);
        const targetId = topology === 'velocity'
            ? (proxyService.findProxyForServer(serverId)?.id || serverId)
            : serverId;

        const target = getServer(targetId);
        if (target) {
            await this.writeGeyserConfig(target, server.crossPlay.bedrockPort, topology);
        }

        if (topology === 'velocity') {
            const proxy = proxyService.findProxyForServer(serverId);
            if (proxy) {
                await proxyService.syncForwarding(proxy.id);
            }
        }
    }
}

export const crossPlayService = new CrossPlayService();
