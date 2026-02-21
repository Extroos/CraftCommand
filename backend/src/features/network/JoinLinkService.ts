
import { networkService } from '../network/NetworkService';
import { getServer, getServers } from '../servers/ServerService';
import { logger } from '../../utils/logger';
import { ServerConfig, ServerStatus } from '@shared/types';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║           JOIN LINK SERVICE                         ║
 * ║  Generate shareable connection info for servers     ║
 * ╚══════════════════════════════════════════════════════╝
 */

export interface JoinInfo {
    serverId: string;
    serverName: string;
    address: string;        // hostname:port or ip:port
    directIp: string;       // ip:port (always)
    hostname?: string;      // pretty DDNS hostname if available
    bedrockAddress?: string; // For Bedrock servers
    copyText: string;       // Ready-to-copy text for players
    isReachable: boolean | null; // null = unknown
}

class JoinLinkService {

    /**
     * Generate join info for a specific server
     */
    async getJoinInfo(serverId: string): Promise<JoinInfo | null> {
        const server = getServer(serverId);
        if (!server) return null;

        return this.buildJoinInfo(server);
    }

    /**
     * Generate join info for all online servers
     */
    async getAllJoinInfo(): Promise<JoinInfo[]> {
        const servers = getServers();
        const onlineServers = servers.filter(s => s.status === ServerStatus.ONLINE);

        const results: JoinInfo[] = [];
        for (const server of onlineServers) {
            results.push(await this.buildJoinInfo(server));
        }
        return results;
    }

    /**
     * Build join info for a server
     */
    private async buildJoinInfo(server: ServerConfig): Promise<JoinInfo> {
        const networkState = networkService.getState();
        const publicIp = networkState.publicIp.current;
        const port = server.port || 25565;
        const isBedrock = server.software === 'Bedrock';

        // Determine the best address
        const hostname = server.network?.hostname;
        const directIp = publicIp ? `${publicIp}:${port}` : `localhost:${port}`;
        
        let address = directIp;
        if (hostname) {
            // Use hostname, omit port if default
            const defaultPort = isBedrock ? 19132 : 25565;
            address = port === defaultPort ? hostname : `${hostname}:${port}`;
        }

        // Check reachability from cache
        const portStatus = networkState.reachability.find(r => r.port === port);
        let isReachable: boolean | null = null;
        if (portStatus) {
            isReachable = portStatus.status === 'open' ? true : portStatus.status === 'closed' ? false : null;
        }

        // Build copy text
        let copyText: string;
        if (server.software === 'Velocity') {
            // Proxy — players connect to this
            copyText = `Join via: ${address}`;
        } else if (isBedrock) {
            copyText = `Bedrock: ${address}`;
        } else {
            copyText = address;
        }

        return {
            serverId: server.id,
            serverName: server.name,
            address,
            directIp,
            hostname: hostname || undefined,
            bedrockAddress: isBedrock ? `${publicIp || 'localhost'}:${port}` : undefined,
            copyText,
            isReachable
        };
    }
}

export const joinLinkService = new JoinLinkService();
