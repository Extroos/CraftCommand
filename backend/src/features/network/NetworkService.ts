
import dns from 'dns';
import axios from 'axios';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs-extra';
import { 
    NetworkState, 
    PublicIpStatus, 
    DdnsStatus, 
    PortReachability 
} from '@shared/types/network';
import { systemSettingsService } from '../system/SystemSettingsService';
import { logger } from '../../utils/logger';
import { sidecarManager } from './SidecarManager';

const DATA_DIR = path.join(process.cwd(), 'data');
const NETWORK_STATE_FILE = path.join(DATA_DIR, 'network-state.json');

const IP_SOURCES = [
    'https://api.ipify.org?format=json',
    'https://icanhazip.com',
    'https://ifconfig.me/ip'
];

class NetworkService extends EventEmitter {
    private state: NetworkState;
    private timer: NodeJS.Timeout | null = null;

    constructor() {
        super();
        this.state = this.loadState();
        this.startMonitoring();
    }

    private loadState(): NetworkState {
        try {
            fs.ensureDirSync(DATA_DIR);
            if (fs.existsSync(NETWORK_STATE_FILE)) {
                const loaded = fs.readJSONSync(NETWORK_STATE_FILE);
                return {
                    publicIp: { current: null, lastKnown: null, lastChangedAt: null, history: [], ...loaded.publicIp },
                    ddns: { hostname: null, resolvedIp: null, isMatching: false, lastVerifiedAt: null, ...loaded.ddns },
                    serverDdns: loaded.serverDdns || {},
                    reachability: loaded.reachability || []
                };
            }
        } catch (e) {
            logger.error(`[NetworkService] Failed to load state: ${e}`);
        }

        return {
            publicIp: { current: null, lastKnown: null, lastChangedAt: null, history: [] },
            ddns: { hostname: null, resolvedIp: null, isMatching: false, lastVerifiedAt: null },
            serverDdns: {},
            reachability: []
        };
    }

    private saveState() {
        try {
            const tempPath = `${NETWORK_STATE_FILE}.tmp`;
            fs.writeJSONSync(tempPath, this.state, { spaces: 4 });
            fs.moveSync(tempPath, NETWORK_STATE_FILE, { overwrite: true });
        } catch (e) {
            logger.error(`[NetworkService] Failed to save state: ${e}`);
            try { if (fs.existsSync(`${NETWORK_STATE_FILE}.tmp`)) fs.unlinkSync(`${NETWORK_STATE_FILE}.tmp`); } catch (err) { logger.debug(`[NetworkService] Final cleanup failed: ${err}`); }
        }
    }

    public async getPublicIp(): Promise<string | null> {
        for (const source of IP_SOURCES) {
            try {
                const response = await axios.get(source, { timeout: 5000 });
                let ip = '';
                const data = response.data as any;
                if (typeof data === 'string') {
                    ip = data.trim();
                } else if (data && typeof data === 'object' && 'ip' in data) {
                    ip = String(data.ip).trim();
                }
                
                if (ip && (ip.includes('.') || ip.includes(':'))) {
                    return ip;
                }
            } catch (e) {
                logger.warn(`[NetworkService] Source ${source} failed: ${(e as Error).message}`);
            }
        }
        return null;
    }

    public async verifyDdns(hostname: string, retries = 2): Promise<DdnsStatus> {
        let lastError: Error | null = null;
        
        for (let i = 0; i <= retries; i++) {
            try {
                const currentIp = await this.getPublicIp();
                
                // Try direct resolve4 first (bypasses OS cache, more accurate for DDNS)
                const resolvedIp = await new Promise<string | null>((resolve, reject) => {
                    dns.resolve4(hostname, (err, addresses) => {
                        if (err) {
                            // If REFUSED or SERVFAIL, we might want to retry
                            if (err.code === 'EREFUSED' || err.code === 'ESERVFAIL' || err.code === 'ETIMEOUT') {
                                return reject(err);
                            }
                            resolve(null); // Other errors (like NOTFOUND) are definitive
                        } else {
                            resolve(addresses && addresses.length > 0 ? addresses[0] : null);
                        }
                    });
                });

                // Fallback to dns.lookup if resolve4 failed with a network error
                let finalIp = resolvedIp;
                if (!finalIp && i === retries) {
                    finalIp = await new Promise<string | null>((resolve) => {
                        dns.lookup(hostname, (err, address) => {
                            resolve(address || null);
                        });
                    });
                }

                return {
                    hostname,
                    resolvedIp: finalIp,
                    isMatching: finalIp === currentIp,
                    lastVerifiedAt: Date.now(),
                    error: undefined,
                    errorType: undefined
                };
            } catch (e) {
                lastError = e as Error;
                if (i < retries) {
                    logger.warn(`[NetworkService] DNS attempt ${i + 1} for ${hostname} failed (${lastError.message}), retrying...`);
                    await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential-ish backoff
                }
            }
        }

        // If we get here, all retries failed with "heavy" errors
        return {
            hostname,
            resolvedIp: null,
            isMatching: false,
            lastVerifiedAt: Date.now(),
            error: lastError?.message,
            errorType: (lastError as any)?.code === 'EREFUSED' ? 'REFUSED' : 
                       (lastError as any)?.code === 'ETIMEOUT' ? 'TIMEOUT' : 'DNS_ERROR'
        };
    }

    public async updateDdns(serverId: string): Promise<DdnsStatus> {
        const { getServer } = require('../servers/ServerService');
        const server = getServer(serverId);

        if (!server || !server.network?.hostname || !server.network.token) {
            throw new Error('Server not found or networking not configured with token');
        }

        const { hostname, provider, token } = server.network;
        const currentIp = await this.getPublicIp();

        if (provider === 'duckdns') {
            const domain = hostname.split('.')[0]; // e.g. "lbogos" from "lbogos.duckdns.org"
            try {
                logger.info(`[NetworkService] Updating DuckDNS for ${hostname} to ${currentIp}...`);
                const response = await axios.get(`https://www.duckdns.org/update?domains=${domain}&token=${token}&ip=${currentIp || ''}`);
                
                if (response.data === 'OK') {
                    logger.info(`[NetworkService] DuckDNS update successful for ${hostname}`);
                    return await this.verifyDdns(hostname);
                } else {
                    return {
                        hostname,
                        resolvedIp: null,
                        isMatching: false,
                        lastVerifiedAt: Date.now(),
                        error: `Provider returned: ${response.data}`,
                        errorType: response.data === 'KO' ? 'AUTH' : 'DNS_ERROR'
                    };
                }
            } catch (e) {
                return {
                    hostname,
                    resolvedIp: null,
                    isMatching: false,
                    lastVerifiedAt: Date.now(),
                    error: (e as Error).message,
                    errorType: 'DNS_ERROR'
                };
            }
        }

        throw new Error(`Provider ${provider} not supported for automated updates yet`);
    }

    public async checkPort(port: number): Promise<PortReachability> {
    // Use external API to check if port is reachable from the internet
    try {
        const publicIp = this.state.publicIp.current || await this.getPublicIp();
        if (!publicIp) {
            return { port, status: 'unknown', lastCheckedAt: Date.now() };
        }

        const response = await axios.get(
            `https://portchecker.io/api/v1/query/${publicIp}/${port}`,
            { timeout: 10000 }
        );

        const data = response.data as any;
        const isOpen = data?.status === 'open' || data?.open === true;

        const result: PortReachability = {
            port,
            status: isOpen ? 'open' : 'closed',
            lastCheckedAt: Date.now()
        };

        // Update cached reachability
        const idx = this.state.reachability.findIndex(r => r.port === port);
        if (idx >= 0) {
            this.state.reachability[idx] = result;
        } else {
            this.state.reachability.push(result);
        }
        this.saveState();

        return result;
    } catch (e: any) {
        logger.warn(`[NetworkService] Port check failed for ${port}: ${e.message}`);
        // Fallback: try a simple TCP self-check as a secondary signal
        return { port, status: 'unknown', lastCheckedAt: Date.now() };
    }
    }

    private async update() {
        logger.debug('[NetworkService] Running periodic update...');
        const newIp = await this.getPublicIp();
        
        if (newIp && newIp !== this.state.publicIp.current) {
            logger.info(`[NetworkService] IP Changed: ${this.state.publicIp.current} -> ${newIp}`);
            this.state.publicIp.lastKnown = this.state.publicIp.current;
            this.state.publicIp.current = newIp;
            this.state.publicIp.lastChangedAt = Date.now();
            this.state.publicIp.history.unshift({ ip: newIp, timestamp: Date.now() });
            this.state.publicIp.history = this.state.publicIp.history.slice(0, 10);
            this.emit('ipChanged', newIp);
        }

        // Per-server DDNS checks
        const { getServers } = require('../servers/ServerService');
        const servers = getServers();
        
        for (const server of servers) {
            if (server.network?.hostname && server.network.monitoringEnabled) {
                const status = await this.verifyDdns(server.network.hostname);
                
                // Cache results per server
                if (!this.state.serverDdns) this.state.serverDdns = {};
                this.state.serverDdns[server.id] = status;

                // If mismatch and update enabled, trigger update
                if (!status.isMatching && server.network.updateEnabled && server.network.token) {
                    logger.info(`[NetworkService] Mismatch detected for ${server.name} (${server.network.hostname}). Triggering update...`);
                    const newStatus = await this.updateDdns(server.id);
                    this.state.serverDdns[server.id] = newStatus;
                }
            }
        }

        this.saveState();
        this.emit('updated', this.state);
    }

    private startMonitoring() {
        if (this.timer) clearInterval(this.timer);
        
        const settings = systemSettingsService.getSettings();
        const interval = (settings.app.network?.updateInterval || 60) * 60 * 1000;
        
        this.timer = setInterval(() => this.update(), interval);
        // Initial check
        setTimeout(() => this.update(), 5000);
    }

    public getState(): NetworkState {
        return this.state;
    }

    /**
     * Lifecycle Hook: Called when a server process is starting
     */
    public async onServerStart(serverId: string) {
        const { getServer } = require('../servers/ServerService');
        const server = getServer(serverId);
        if (!server || !server.network) return;

        const { publicAccess, tunnelToken, playitSecret } = server.network;

        try {
            if (publicAccess === 'cloudflare' && tunnelToken) {
                logger.info(`[NetworkService:${serverId}] Activating Cloudflare Tunnel...`);
                await sidecarManager.startCloudflare(serverId, tunnelToken);
            } else if (publicAccess === 'playit' && playitSecret) {
                logger.info(`[NetworkService:${serverId}] Activating Playit.gg Agent...`);
                // We'll use a virtual path for the secret in the server directory
                const secretPath = path.join(server.workingDirectory, '.playit_secret');
                await fs.writeFile(secretPath, playitSecret);
                await sidecarManager.startPlayit(serverId, secretPath);
            }
        } catch (err: any) {
            logger.error(`[NetworkService:${serverId}] Failed to start sidecar: ${err.message}`);
        }
    }

    /**
     * Lifecycle Hook: Called when a server process stops or is cleaned up
     */
    public onServerStop(serverId: string) {
        logger.info(`[NetworkService:${serverId}] Cleaning up networking sidecars...`);
        sidecarManager.stopAllForServer(serverId);
    }
}

export const networkService = new NetworkService();
