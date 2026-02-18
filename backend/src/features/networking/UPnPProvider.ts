
import { ConnectivityProvider } from './ConnectivityProvider';
import { ConnectionStatus, ConnectivityMethod } from '@shared/types';
import { networkService } from '../network/NetworkService';
import { logger } from '../../utils/logger';
import net from 'net';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║           UPnP AUTO PORT-FORWARDING PROVIDER        ║
 * ║  Automatically maps Minecraft ports on the router   ║
 * ╚══════════════════════════════════════════════════════╝
 *  
 * Uses UPnP/IGD protocol to request port mappings from the router.
 * Falls back gracefully if UPnP is disabled on the router.
 */

interface PortMapping {
    public: number;
    private: number;
    description: string;
    ttl: number;
}

export class UPnPProvider implements ConnectivityProvider {
    public id: ConnectivityMethod = 'direct'; // UPnP extends direct connectivity
    
    private mappedPorts: PortMapping[] = [];
    private client: any = null;

    async connect(): Promise<ConnectionStatus> {
        logger.info('[UPnP] Attempting automatic port forwarding...');

        try {
            // Dynamic import so the module is optional
            const natUpnp = await this.loadNatUpnp();
            
            if (!natUpnp) {
                logger.warn('[UPnP] nat-upnp module not available. Skipping UPnP auto-forwarding.');
                return this.getStatus();
            }

            this.client = natUpnp.createClient();

            // Map common Minecraft ports
            const portsToMap: PortMapping[] = [
                { public: 25565, private: 25565, description: 'CraftCommands - Java', ttl: 7200 },
                { public: 19132, private: 19132, description: 'CraftCommands - Bedrock', ttl: 7200 },
            ];

            for (const mapping of portsToMap) {
                try {
                    await this.mapPort(mapping);
                    this.mappedPorts.push(mapping);
                    logger.success(`[UPnP] Mapped port ${mapping.public} → ${mapping.private} (${mapping.description})`);
                } catch (e: any) {
                    logger.warn(`[UPnP] Could not map port ${mapping.public}: ${e.message}`);
                }
            }

            if (this.mappedPorts.length === 0) {
                logger.warn('[UPnP] No ports could be mapped. UPnP may be disabled on your router.');
            }

            // Get external IP through UPnP if possible
            let externalIP: string | undefined;
            try {
                externalIP = await this.getExternalIp();
            } catch {
                externalIP = (await networkService.getPublicIp()) || undefined;
            }

            return {
                enabled: true,
                method: 'direct',
                externalIP,
                bindAddress: '0.0.0.0',
                details: {
                    upnp: true,
                    mappedPorts: this.mappedPorts.map(p => p.public)
                }
            };
        } catch (e: any) {
            logger.error(`[UPnP] Failed: ${e.message}`);
            return {
                enabled: false,
                method: 'direct',
                bindAddress: '0.0.0.0',
                error: `UPnP failed: ${e.message}`
            };
        }
    }

    async disconnect(): Promise<void> {
        if (!this.client) return;

        for (const mapping of this.mappedPorts) {
            try {
                await this.unmapPort(mapping.public);
                logger.info(`[UPnP] Removed port mapping: ${mapping.public}`);
            } catch (e: any) {
                logger.warn(`[UPnP] Failed to remove mapping for port ${mapping.public}: ${e.message}`);
            }
        }

        this.mappedPorts = [];
        this.client = null;
        logger.info('[UPnP] Disconnected — all port mappings removed');
    }

    async getStatus(): Promise<ConnectionStatus> {
        return {
            enabled: this.mappedPorts.length > 0,
            method: 'direct',
            bindAddress: '0.0.0.0',
            details: {
                upnp: true,
                mappedPorts: this.mappedPorts.map(p => p.public)
            }
        };
    }

    /**
     * Map a port via UPnP
     */
    private mapPort(mapping: PortMapping): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.client) return reject(new Error('UPnP client not initialized'));
            this.client.portMapping({
                public: mapping.public,
                private: mapping.private,
                description: mapping.description,
                ttl: mapping.ttl,
                protocol: 'TCP'
            }, (err: any) => err ? reject(err) : resolve());
        });
    }

    /**
     * Remove a port mapping via UPnP
     */
    private unmapPort(publicPort: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.client) return reject(new Error('UPnP client not initialized'));
            this.client.portUnmapping({ public: publicPort }, (err: any) => err ? reject(err) : resolve());
        });
    }

    /**
     * Get external IP via UPnP IGD
     */
    private getExternalIp(): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.client) return reject(new Error('UPnP client not initialized'));
            this.client.externalIp((err: any, ip: string) => err ? reject(err) : resolve(ip));
        });
    }

    /**
     * Try to load nat-upnp dynamically (it's an optional dependency)
     */
    private async loadNatUpnp(): Promise<any> {
        try {
            return require('nat-upnp');
        } catch {
            try {
                return require('nat-upnp-2');
            } catch {
                return null;
            }
        }
    }
}
