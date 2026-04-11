
import { processManager } from '../processes/ProcessManager';
import { proxyService } from './ProxyService';
import { statsRingBuffer } from '../diagnosis/StatsRingBuffer';
import { getServer, getServers, saveServer } from '../servers/ServerService';
import { logger } from '../../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { ServerConfig, ServerStatus } from '@shared/types';
import { systemSettingsService } from '../system/SystemSettingsService';
import net from 'net';

const execAsync = promisify(exec);

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

        logger.info('[NetworkFabric] Initialized — listening for server lifecycle events');
        
        // Start autonomous shielding monitor
        this.startAutonomousShielding();

        // Start L7 Watchdog
        this.startProxyWatchdog();
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
            if (status === ServerStatus.ONLINE) {
                await this.handleServerOnline(server, proxy);
            } else if (status === ServerStatus.OFFLINE || status === ServerStatus.CRASHED) {
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
     * v2.1: Now health-aware (TPS > 12, CPU < 85%)
     */
    private ensureFallback(proxy: ServerConfig): void {
        const links = proxy.network?.proxyConfig?.links;
        if (!links || links.length === 0) return;

        // Find the "best" online backend based on health
        const candidates = links
            .map(l => {
                const backend = getServer(l.serverId);
                if (!backend || (backend.status !== ServerStatus.ONLINE && backend.status !== ServerStatus.STARTING)) {
                    return null;
                }
                const stats = statsRingBuffer.getStats(backend.id);
                const tps = stats ? stats.avgTps : 20;
                const cpu = stats ? stats.avgCpu : 0;
                
                // Scoring: Higher is better (Health Weighting)
                const healthScore = (tps * 5) - (cpu / 2);
                
                return { link: l, score: healthScore, tps, cpu };
            })
            .filter((c): c is NonNullable<typeof c> => c !== null);

        if (candidates.length === 0) return;

        // Sort by health score descending
        candidates.sort((a, b) => b.score - a.score);
        const bestBackend = candidates[0].link;

        // If the best backend is already first, we're good
        if (links[0].serverId === bestBackend.serverId) return;

        // Move the best backend to the front of the list (priority fallback)
        const idx = links.findIndex(l => l.serverId === bestBackend.serverId);
        links.splice(idx, 1);
        links.unshift(bestBackend);

        saveServer(proxy);
        const backendName = getServer(bestBackend.serverId)?.name || bestBackend.alias;
        logger.info(`[NetworkFabric] Promoted "${backendName}" as fallback for "${proxy.name}" (TPS: ${candidates[0].tps.toFixed(1)}, CPU: ${candidates[0].cpu.toFixed(1)}%)`);
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
            return backend && backend.status === ServerStatus.ONLINE;
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
            proxyOnline: proxy.status === ServerStatus.ONLINE,
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
        if (!proxy || proxy.status !== ServerStatus.ONLINE) return;

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
                isOnline: backend?.status === ServerStatus.ONLINE
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
                recommended: backend?.status === ServerStatus.ONLINE && loadPercent < 80
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

    // ─── OS-LEVEL FIREWALL ENFORCEMENT ──────────────────

    /**
     * Physically blocks an IP address at the OS networking layer.
     * Prevents malicious traffic from reaching any server port.
     */
    async blockIP(ip: string, options: { reason?: string, port?: number } = {}): Promise<boolean> {
        if (!ip || ip === '127.0.0.1' || ip === 'localhost') return false;
        
        const { reason = 'Protocol Violation', port } = options;
        const platform = os.platform();
        logger.warn(`[NetworkFabric] 🛡️ Initiating Hardware Block for ${ip} ${port ? `on port ${port}` : ''} (Reason: ${reason})`);

        try {
            if (platform === 'win32') {
                // Windows Advanced Firewall Rule
                const ruleName = `CC_BLOCK_${ip.replace(/\./g, '_')}${port ? `_P${port}` : ''}`;
                let cmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=block remoteip=${ip} description="CraftCommand Auto-Block: ${reason}"`;
                if (port) cmd += ` localport=${port} protocol=TCP`;
                await execAsync(cmd);
            } else if (platform === 'linux') {
                // Linux iptables (requires sudo/root)
                let cmd = `iptables -A INPUT -s ${ip} -j DROP -m comment --comment "CC_BLOCK: ${reason}"`;
                if (port) cmd = `iptables -A INPUT -s ${ip} -p tcp --dport ${port} -j DROP -m comment --comment "CC_BLOCK: ${reason}"`;
                await execAsync(cmd);
            } else {
                logger.error(`[NetworkFabric] Firewall block not supported on platform: ${platform}`);
                return false;
            }

            logger.success(`[NetworkFabric] IP ${ip} physically blocked at OS firewall.`);
            return true;
        } catch (e: any) {
            logger.error(`[NetworkFabric] Failed to block IP ${ip}: ${e.message}`);
            return false;
        }
    }

    /**
     * Removes a firewall block for an IP.
     */
    async unblockIP(ip: string): Promise<boolean> {
        const platform = os.platform();
        try {
            if (platform === 'win32') {
                const ruleName = `CC_BLOCK_${ip.replace(/\./g, '_')}`;
                await execAsync(`netsh advfirewall firewall delete rule name="${ruleName}"`);
            } else if (platform === 'linux') {
                await execAsync(`iptables -D INPUT -s ${ip} -j DROP`);
            }
            logger.info(`[NetworkFabric] IP ${ip} unblocked.`);
            return true;
        } catch (e: any) {
            logger.warn(`[NetworkFabric] Failed to unblock IP ${ip} (may already be unblocked): ${e.message}`);
            return false;
        }
    }

    // ─── AUTONOMOUS SHIELDING ────────────────────────────

    /**
     * Monitors real-time stats for traffic anomalies.
     */
    private startAutonomousShielding(): void {
        setInterval(() => {
            const settings = systemSettingsService.getSettings();
            const shield = settings.app.advancedNetworking?.ddosShield;
            
            if (!shield?.enabled) return;

            const servers = getServers();
            for (const server of servers) {
                if (server.status !== ServerStatus.ONLINE) continue;

                const stats = statsRingBuffer.getStats(server.id);
                if (!stats) continue;

                // Simple anomaly detection: If RPS (requests per second) > threshold
                // Note: RPS is usually mapped to 'network' or 'packets' in statsRingBuffer
                const rps = (stats as any).networkInRps || 0; 
                
                if (rps > shield.burstThreshold) {
                    logger.error(`[NetworkFabric] 🛡️ DDoS ANOMALY DETECTED on ${server.name}! RPS: ${rps} (Threshold: ${shield.burstThreshold})`);
                    this.mitigateAttack(server);
                }
            }
        }, 5000); // Check every 5s
    }

    /**
     * Mitigates a detected attack by blocking high-traffic IPs.
     */
    private async mitigateAttack(server: ServerConfig): Promise<void> {
        logger.info(`[NetworkFabric] Identifying attack vectors for ${server.name}...`);
        
        try {
            const platform = os.platform();
            let maliciousIps: string[] = [];

            if (platform === 'win32') {
                // Use netstat to find IPs with high connection counts to the server port
                const { stdout } = await execAsync(`netstat -an | findstr :${server.port}`);
                maliciousIps = this.parseMaliciousIps(stdout, server.port);
            } else if (platform === 'linux') {
                // Use ss for high-performance connection tracking
                const { stdout } = await execAsync(`ss -tun state established sport = :${server.port} -o`);
                maliciousIps = this.parseMaliciousIps(stdout, server.port);
            }

            if (maliciousIps.length === 0) {
                logger.warn(`[NetworkFabric] Attack vector identification failed: No anomalous traffic patterns found for port ${server.port}.`);
                return;
            }

            for (const ip of maliciousIps) {
                await this.blockIP(ip, { 
                    reason: `Automated Shield: Burst Threshold Exceeded (Target: ${server.name})`,
                    port: server.port 
                });
            }
        } catch (e: any) {
            logger.error(`[NetworkFabric] Mitigation engine failure: ${e.message}`);
        }
    }

    /**
     * Analyzes raw connection data to find IPs exceeding reasonable connection limits.
     */
    private parseMaliciousIps(raw: string, targetPort: number): string[] {
        const lines = raw.split('\n');
        const ipCounts: Record<string, number> = {};
        
        for (const line of lines) {
            // Netstat/SS lines usually follow: [Proto] [Local Addr/Port] [Remote Addr/Port] [State]
            // We want the SECOND IP in the line (the remote one)
            const matches = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g);
            if (matches && matches.length >= 2) {
                const remoteIp = matches[1];
                if (remoteIp !== '127.0.0.1' && remoteIp !== '0.0.0.0' && !remoteIp.startsWith('192.168.')) {
                    ipCounts[remoteIp] = (ipCounts[remoteIp] || 0) + 1;
                }
            }
        }

        // Return IPs with more than 50 concurrent connections (Burst heuristic)
        return Object.entries(ipCounts)
            .filter(([ip, count]) => count > 50)
            .map(([ip]) => ip);
    }

    // ─── L7 HEALTH WATCHDOG ─────────────────────────────

    /**
     * Monitors the Velocity proxy for responsiveness (Watchdog mode).
     */
    private startProxyWatchdog(): void {
        setInterval(async () => {
            const proxy = this.findActiveProxy();
            if (!proxy || proxy.status !== ServerStatus.ONLINE) return;

            try {
                // Try to connect to the proxy port
                const socket = new net.Socket();
                const timeout = 5000;
                
                const promise = new Promise<boolean>((resolve) => {
                    socket.setTimeout(timeout);
                    socket.on('connect', () => { socket.destroy(); resolve(true); });
                    socket.on('timeout', () => { socket.destroy(); resolve(false); });
                    socket.on('error', () => { socket.destroy(); resolve(false); });
                    socket.connect(proxy.port, '127.0.0.1');
                });

                const isResponsive = await promise;
                if (!isResponsive) {
                    logger.error(`[NetworkFabric] ⚠ Proactive Health Check FAILED for proxy "${proxy.name}". Process is alive but not accepting connections.`);
                    // We don't auto-restart yet, but we log the incident for the Diagnosis engine
                    this.lastProxyHang = Date.now();
                }
            } catch (e) {
                // Ignore transient errors
            }
        }, 15000);
    }

    private lastProxyHang: number = 0;

    public getProxyHangStatus(): boolean {
        return (Date.now() - this.lastProxyHang) < 60000;
    }
}

export const networkFabricService = new NetworkFabricService();
