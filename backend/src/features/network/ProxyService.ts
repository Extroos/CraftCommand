
import { ServerConfig } from '@shared/types';
import { ProxyLink } from '@shared/types/network';
import { serverRepository } from '../../storage/ServerRepository';
import { pluginService } from '../plugins/PluginService';
import { logger } from '../../utils/logger';
import { getServer, saveServer, getServers } from '../servers/ServerService';
import path from 'path';
import fs from 'fs-extra';
import { networkConfigGenerator } from './NetworkConfigGenerator';
import { systemSettingsService } from '../system/SystemSettingsService';

export class ProxyService {
    /**
     * Links a backend server to a Velocity proxy.
     */
    public linkServer(proxyId: string, backendId: string, alias: string): void {
        const proxy = getServer(proxyId);
        if (!proxy) throw new Error('Proxy server not found');
        if (proxy.software !== 'Velocity') throw new Error('Server is not a Velocity proxy');
        
        const backend = getServer(backendId);
        if (!backend) throw new Error('Backend server not found');

        if (!proxy.network) {
            proxy.network = { 
                updateEnabled: false, 
                monitoringEnabled: false, 
                updateInterval: 60 
            };
        }
        if (!proxy.network.proxyConfig) {
            proxy.network.proxyConfig = { links: [] };
        }
        
        // Remove existing link to this server if it exists or alias conflict
        proxy.network.proxyConfig.links = proxy.network.proxyConfig.links.filter(
            l => l.serverId !== backendId && l.alias !== alias
        );
        
        // Add new link
        proxy.network.proxyConfig.links.push({ serverId: backendId, alias });
        
        saveServer(proxy);
        this.syncAdvancedVelocityConfig(proxyId);
        
        // v2.1: Trigger async reload so the fabric change takes effect immediately
        this.triggerVelocityReload(proxyId).catch(e => logger.warn(`[ProxyService] Auto-reload failed: ${e.message}`));
    }

    /**
     * Unlinks a backend server from a Velocity proxy.
     */
    public unlinkServer(proxyId: string, backendId: string): void {
        const proxy = getServer(proxyId);
        if (!proxy || !proxy.network?.proxyConfig) return;
        
        proxy.network.proxyConfig.links = proxy.network.proxyConfig.links.filter(l => l.serverId !== backendId);
        saveServer(proxy);
        this.syncAdvancedVelocityConfig(proxyId);

        // Revert online-mode for backend if it's managed by this panel
        const backend = getServer(backendId);
        if (backend) {
            backend.onlineMode = true;
            saveServer(backend);
            logger.info(`[ProxyService] Unlinked ${backend.name} from ${proxy.name} and restored online-mode.`);
        }
    }

    /**
     * Finds the proxy server that a backend server is linked to.
     */
    public findProxyForServer(backendId: string): any | null {
        const allServers = getServers();
        return allServers.find(s => 
            s.software === 'Velocity' && 
            s.network?.proxyConfig?.links?.some((l: any) => l.serverId === backendId)
        ) || null;
    }

    /**
     * Generates the [servers] block for velocity.toml
     */
    public generateVelocityServersConfig(proxyId: string): string {
        const proxy = getServer(proxyId);
        if (!proxy || !proxy.network?.proxyConfig) return '';
        
        const allServers = getServers();
        const serverLines: string[] = [];
        const tryList: string[] = [];
        
        for (const link of proxy.network.proxyConfig.links) {
            const backend = allServers.find(s => s.id === link.serverId);
            if (backend) {
                // In distributed nodes, we use the backend's explicit IP if available, 
                // otherwise fallback to 127.0.0.1 for local
                const ip = (backend.nodeId && backend.nodeId !== proxy.nodeId) 
                    ? (backend.ip || '127.0.0.1') 
                    : '127.0.0.1';
                
                serverLines.push(`${link.alias} = "${ip}:${backend.port}"`);
                tryList.push(`"${link.alias}"`);
            }
        }
        
        let config = '[servers]\n';
        if (serverLines.length > 0) {
            serverLines.forEach(line => config += `  ${line}\n`);
        } else {
            config += `  # No servers linked yet. Add backends in the Proxy Network tab.\n`;
        }
        
        // Velocity requires at least one server in the 'try' list if it's not empty, 
        // normally we want to prioritize the first linked server as the fallback.
        // If empty, we MUST explicitly set it to [] to avoid internal defaults like ["lobby"]
        config += `\n  # Priority list of servers to try when a player joins the proxy\n`;
        config += `  try = [${tryList.join(', ')}]\n`;
        
        return config;
    }

    /**
     * Installs the ViaVersion suite for multi-version support.
     */
    public async installViaSuite(proxyId: string): Promise<void> {
        const proxy = serverRepository.findById(proxyId);
        if (!proxy) throw new Error('Proxy not found');
        if (proxy.software !== 'Velocity') throw new Error('Only Velocity proxies support this suite.');

        const plugins = [
            { id: 'viaversion', name: 'ViaVersion' },
            { id: 'viabackwards', name: 'ViaBackwards' },
            { id: 'viarewind', name: 'ViaRewind' }
        ];

        logger.info(`[ProxyService] Installing Via Suite for ${proxy.name}...`);
        
        for (const p of plugins) {
            try {
                await pluginService.install(proxyId, p.id, 'modrinth');
                logger.success(`[ProxyService] Installed ${p.name}`);
            } catch (e: any) {
                logger.warn(`[ProxyService] Failed to install ${p.name}: ${e.message}`);
                // Continue with others
            }
        }
    }

    /**
     * Synchronizes forwarding settings and ensures secret files exist.
     */
    public async syncForwarding(proxyId: string): Promise<void> {
        const proxy = getServer(proxyId);
        if (!proxy || !proxy.network?.proxyConfig) return;

        const config = proxy.network.proxyConfig;
        const mode = config.forwardingMode || 'modern';
        
        // If modern mode, ensure forwarding.secret exists
        if (mode === 'modern' && config.secret) {
            const secretPath = path.join(proxy.workingDirectory, 'forwarding.secret');
            try {
                // Velocity secret file is just the raw string
                await fs.writeFile(secretPath, config.secret.trim());
                logger.info(`[ProxyService] Synced forwarding.secret for ${proxy.name}`);
            } catch (e: any) {
                logger.error(`[ProxyService] Failed to write forwarding.secret: ${e.message}`);
            }
        }
    }

    /**
     * Syncs advanced settings from SystemSettings to velocity proxy
     */
    public async syncAdvancedVelocityConfig(proxyId: string): Promise<void> {
        const settings = systemSettingsService.getSettings();
        const advanced = settings.app.advancedNetworking;

        if (advanced) {
            await networkConfigGenerator.generateVelocityAdvancedConfig(proxyId, {
                compressionLevel: advanced.trafficCompression?.level || 6,
                compressionThreshold: 256,
                enableRateLimiting: advanced.ddosShield?.enabled || false,
                maxPacketsPerSecond: advanced.ddosShield?.burstThreshold || 50
            });
        }
    }
    /**
     * Sends a 'velocity reload' command to the proxy process if it is running.
     */
    public async triggerVelocityReload(proxyId: string): Promise<void> {
        const { processManager } = await import('../processes/ProcessManager');
        if (processManager.isRunning(proxyId)) {
            logger.info(`[ProxyService] Dispatching hot-reload to Velocity (${proxyId})`);
            processManager.sendCommand(proxyId, 'velocity reload');
        }
    }
}

export const proxyService = new ProxyService();
