
import { processManager } from '../processes/ProcessManager';
import { proxyService } from './ProxyService';
import { statsRingBuffer } from '../diagnosis/StatsRingBuffer';
import { getServer, getServers, saveServer } from '../servers/ServerService';
import { logger } from '../../utils/logger';
import { ServerConfig } from '@shared/types';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║        NETWORK FABRIC SERVICE                       ║
 * ║  Self-managed proxy/backend lifecycle automation     ║
 * ║  Reacts to server start/stop to keep proxy healthy  ║
 * ╚══════════════════════════════════════════════════════╝
 */

export interface FabricHealth {
    proxyId: string | null;
    proxyName: string | null;
    proxyOnline: boolean;
    totalBackends: number;
    onlineBackends: number;
    offlineBackends: number;
    fallbackServer: string | null;
    status: 'healthy' | 'degraded' | 'critical' | 'no-proxy';
}

class NetworkFabricService {
    private initialized = false;

    /**
     * Start listening to lifecycle events. Should be called once during app bootstrap.
     */
    initialize(): void {
        if (this.initialized) return;
        this.initialized = true;

        processManager.on('status', ({ id, status }) => {
            // Small delay to let server config settle
            setTimeout(() => this.handleStatusChange(id, status), 500);
        });

        logger.info('[NetworkFabric] Initialized — listening for server lifecycle events');
    }

    /**
     * React to server status changes
     */
    private async handleStatusChange(serverId: string, status: string): Promise<void> {
        const server = getServer(serverId);
        if (!server) return;

        // Skip proxy servers — they're the targets, not the backends
        if (server.software === 'Velocity') return;

        const proxy = this.findActiveProxy();
        if (!proxy) return; // No proxy configured, nothing to automate

        try {
            if (status === 'ONLINE') {
                await this.handleServerOnline(server, proxy);
            } else if (status === 'OFFLINE' || status === 'CRASHED') {
                await this.handleServerOffline(server, proxy);
            }
        } catch (e: any) {
            logger.error(`[NetworkFabric] Error handling status change for ${serverId}: ${e.message}`);
        }
    }

    /**
     * When a backend comes online: auto-register with proxy if not linked
     */
    private async handleServerOnline(server: ServerConfig, proxy: ServerConfig): Promise<void> {
        const existingLink = proxy.network?.proxyConfig?.links?.find(l => l.serverId === server.id);

        if (!existingLink) {
            // Auto-register: generate a sanitized alias from the server name
            const alias = this.generateAlias(server.name, proxy);
            
            try {
                proxyService.linkServer(proxy.id, server.id, alias);
                logger.success(`[NetworkFabric] Auto-linked "${server.name}" → proxy "${proxy.name}" as "${alias}"`);
            } catch (e: any) {
                logger.warn(`[NetworkFabric] Auto-link failed for "${server.name}": ${e.message}`);
            }
        }

        // Ensure fallback: if no fallback is set, promote this server
        this.ensureFallback(proxy);
    }

    /**
     * When a backend goes offline: ensure fallback is still valid
     */
    private async handleServerOffline(server: ServerConfig, proxy: ServerConfig): Promise<void> {
        // Promote fallback if the offline server was the current fallback
        this.ensureFallback(proxy);

        const linkedCount = proxy.network?.proxyConfig?.links?.length || 0;
        const onlineCount = this.countOnlineBackends(proxy);

        if (onlineCount === 0 && linkedCount > 0) {
            logger.warn(`[NetworkFabric] ⚠ All backends for proxy "${proxy.name}" are offline!`);
        }
    }

    /**
     * Ensure the proxy always has a valid online server as the first fallback.
     * Velocity routes joining players to the first server in the 'try' list.
     */
    private ensureFallback(proxy: ServerConfig): void {
        const links = proxy.network?.proxyConfig?.links;
        if (!links || links.length === 0) return;

        // Find the first online backend
        const onlineBackend = links.find(l => {
            const backend = getServer(l.serverId);
            return backend && (backend.status === 'ONLINE' || backend.status === 'STARTING');
        });

        if (!onlineBackend) return; // No online backends to promote

        // If the online backend is already first, we're good
        if (links[0].serverId === onlineBackend.serverId) return;

        // Move the online backend to the front of the list (priority fallback)
        const idx = links.indexOf(onlineBackend);
        links.splice(idx, 1);
        links.unshift(onlineBackend);

        saveServer(proxy);
        const backendName = getServer(onlineBackend.serverId)?.name || onlineBackend.alias;
        logger.info(`[NetworkFabric] Promoted "${backendName}" as fallback for "${proxy.name}"`);
    }

    /**
     * Generate a unique, sanitized alias for a server.
     * "My Survival Server!" → "my-survival-server"
     */
    private generateAlias(name: string, proxy: ServerConfig): string {
        let alias = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with dash
            .replace(/^-|-$/g, '')          // Trim leading/trailing dashes
            .substring(0, 20);              // Cap length

        if (!alias) alias = 'server';

        // Ensure uniqueness
        const existing = new Set(
            proxy.network?.proxyConfig?.links?.map(l => l.alias) || []
        );
        
        let candidate = alias;
        let counter = 2;
        while (existing.has(candidate)) {
            candidate = `${alias}-${counter++}`;
        }

        return candidate;
    }

    /**
     * Find the first Velocity proxy that's managed by this instance
     */
    private findActiveProxy(): ServerConfig | null {
        const servers = getServers();
        return servers.find(s => s.software === 'Velocity') || null;
    }

    /**
     * Count how many linked backends are currently online
     */
    private countOnlineBackends(proxy: ServerConfig): number {
        const links = proxy.network?.proxyConfig?.links || [];
        return links.filter(l => {
            const backend = getServer(l.serverId);
            return backend && backend.status === 'ONLINE';
        }).length;
    }

    /**
     * Get the health status of the network fabric
     */
    getHealth(): FabricHealth {
        const proxy = this.findActiveProxy();

        if (!proxy) {
            return {
                proxyId: null, proxyName: null, proxyOnline: false,
                totalBackends: 0, onlineBackends: 0, offlineBackends: 0,
                fallbackServer: null, status: 'no-proxy'
            };
        }

        const links = proxy.network?.proxyConfig?.links || [];
        const online = this.countOnlineBackends(proxy);
        const total = links.length;
        const offline = total - online;

        // Determine fallback
        const firstLink = links[0];
        const fallbackServer = firstLink
            ? (getServer(firstLink.serverId)?.name || firstLink.alias)
            : null;

        // Determine status
        let status: FabricHealth['status'] = 'healthy';
        if (total === 0) status = 'degraded';
        else if (online === 0) status = 'critical';
        else if (offline > 0) status = 'degraded';

        return {
            proxyId: proxy.id,
            proxyName: proxy.name,
            proxyOnline: proxy.status === 'ONLINE',
            totalBackends: total,
            onlineBackends: online,
            offlineBackends: offline,
            fallbackServer,
            status
        };
    }

    // ─── Traffic Load Balancing ───────────────────────────

    /**
     * Reorder the proxy try-list based on player load.
     * Least-loaded servers go first so Velocity routes new players there.
     */
    async rebalanceTraffic(): Promise<void> {
        const proxy = this.findActiveProxy();
        if (!proxy || proxy.status !== 'ONLINE') return;

        const links = proxy.network?.proxyConfig?.links;
        if (!links || links.length < 2) return; // Nothing to rebalance

        // Get player counts and sort by load (ascending = least loaded first)
        const loadInfo = links.map(link => {
            const backend = getServer(link.serverId);
            const stats = backend ? statsRingBuffer.getStats(backend.id) : null;
            const playerCount = stats ? Math.round(stats.avgPlayers) : 0;
            const maxPlayers = backend?.maxPlayers || 20;
            const loadPercent = (playerCount / maxPlayers) * 100;

            return {
                link,
                playerCount,
                maxPlayers,
                loadPercent,
                isOnline: backend?.status === 'ONLINE'
            };
        });

        // Sort: online servers first, then by load % ascending
        loadInfo.sort((a, b) => {
            if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
            return a.loadPercent - b.loadPercent;
        });

        // Update the links order in-place
        links.length = 0;
        for (const info of loadInfo) {
            links.push(info.link);
        }

        saveServer(proxy);

        // Regenerate velocity config with new order
        try {
            await proxyService.generateVelocityServersConfig(proxy.id);
        } catch (e: any) {
            logger.warn(`[NetworkFabric] Failed to sync velocity config after rebalance: ${e.message}`);
        }

        logger.info(`[NetworkFabric] Traffic rebalanced: ${loadInfo.map(i => `${i.link.alias}(${i.playerCount}/${i.maxPlayers})`).join(' → ')}`);
    }

    /**
     * Get a load-balanced routing recommendation for each server type.
     * Useful for plugin-level routing decisions.
     */
    getSmartRouting(): { alias: string; serverId: string; playerCount: number; loadPercent: number; recommended: boolean }[] {
        const proxy = this.findActiveProxy();
        if (!proxy) return [];

        const links = proxy.network?.proxyConfig?.links || [];
        const routing = links.map(link => {
            const backend = getServer(link.serverId);
            const stats = backend ? statsRingBuffer.getStats(backend.id) : null;
            const playerCount = stats ? Math.round(stats.avgPlayers) : 0;
            const maxPlayers = backend?.maxPlayers || 20;
            const loadPercent = Math.round((playerCount / maxPlayers) * 100);

            return {
                alias: link.alias,
                serverId: link.serverId,
                playerCount,
                loadPercent,
                recommended: backend?.status === 'ONLINE' && loadPercent < 80
            };
        });

        // Sort by load
        routing.sort((a, b) => a.loadPercent - b.loadPercent);
        return routing;
    }

    /**
     * Start periodic traffic rebalancing (every 60s).
     */
    startAutoRebalancing(intervalMs: number = 60_000): NodeJS.Timeout {
        return setInterval(() => {
            this.rebalanceTraffic().catch(e => 
                logger.warn(`[NetworkFabric] Auto-rebalance error: ${e.message}`)
            );
        }, intervalMs);
    }
}

export const networkFabricService = new NetworkFabricService();
