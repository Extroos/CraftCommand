import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
import { networkService } from '../network/NetworkService';
import { ServerStatus } from '@shared/types';

/**
 * Rule for detecting DuckDNS authentication failures (KO response).
 */
export const DuckDnsAuthRule: DiagnosisRule = {
    id: 'duckdns_auth_failure',
    name: 'DuckDNS Authentication Failure',
    description: 'Detects if the DuckDNS token is invalid or the domain is not owned by the account.',
    tier: 1,
    defaultConfidence: 100,
    triggers: [], // Metrics/State based
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (!server.network?.updateEnabled || server.network?.provider !== 'duckdns') return null;
        
        const hasLogMatch = logs.some(l => /DuckDNS.*KO/i.test(l) || /auth failed/i.test(l));
        const networkState = networkService.getState();
        const ddnsStatus = networkState.serverDdns?.[server.id];

        if (ddnsStatus && ddnsStatus.errorType === 'AUTH') {
            return {
                id: `duckdns-auth-${server.id}-${Date.now()}`,
                ruleId: 'duckdns_auth_failure',
                severity: 'CRITICAL',
                title: 'DuckDNS Auth Failed',
                explanation: `The DuckDNS update for ${server.network.hostname} failed with an authentication error. The token is likely invalid.`,
                recommendation: 'Verify your DuckDNS token in the server networking settings.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting public IP vs DDNS mismatch.
 */
export const PublicIpMismatchRule: DiagnosisRule = {
    id: 'public_ip_mismatch',
    name: 'DDNS IP Mismatch',
    description: 'Detects when the public IP has changed but the DDNS record is still pointing to the old IP.',
    tier: 1,
    defaultConfidence: 90,
    triggers: [], 
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (!server.network?.updateEnabled || !server.network?.hostname) return null;

        const currentHostname = server.network.hostname;
        const networkState = networkService.getState();
        const ddnsStatus = networkState.serverDdns?.[server.id];

        if (ddnsStatus && ddnsStatus.resolvedIp && !ddnsStatus.isMatching) {
            return {
                id: `ip-mismatch-${server.id}-${Date.now()}`,
                ruleId: 'public_ip_mismatch',
                severity: 'WARNING',
                title: 'DDNS IP Mismatch',
                explanation: `Your public IP has changed, but the record for ${server.network.hostname} is still pointing to ${ddnsStatus.resolvedIp}.`,
                recommendation: 'Wait a few minutes for DNS propagation, or manually trigger a DDNS update.',
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { triggerDdnsUpdate: true },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting when a proxy has no online fallback servers.
 */
export const NoFallbackRule: DiagnosisRule = {
    id: 'network_no_fallback',
    name: 'No Fallback Server Available',
    description: 'Detects when a Velocity proxy has linked backends but none are online.',
    tier: 1,
    defaultConfidence: 95,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        // Only run on Velocity proxy servers
        if (server.software !== 'Velocity') return null;
        if (server.status !== ServerStatus.ONLINE) return null;

        const links = server.network?.proxyConfig?.links;
        if (!links || links.length === 0) return null;

        const { getServer: getServerById } = await import('../servers/ServerService');
        const onlineBackends = links.filter(l => {
            const backend = getServerById(l.serverId);
            return backend && backend.status === ServerStatus.ONLINE;
        });

        if (onlineBackends.length > 0) return null;

        return {
            id: `net-no-fallback-${server.id}-${Date.now()}`,
            ruleId: 'network_no_fallback',
            severity: 'CRITICAL',
            title: 'No Online Backends — Players Cannot Join',
            explanation: `The proxy "${server.name}" has ${links.length} linked backend${links.length !== 1 ? 's' : ''}, but none are currently online. Players connecting to the proxy will be kicked immediately because there is no server to route them to.`,
            recommendation: 'Start at least one backend server, or check if crashed servers need attention. The proxy needs at least one online backend to function.',
            confidence: 98,
            timestamp: Date.now()
        };
    }
};

/**
 * Rule for detecting unlinked running servers that could benefit from proxy routing.
 */
export const UnlinkedServerRule: DiagnosisRule = {
    id: 'network_unlinked_server',
    name: 'Unlinked Running Server',
    description: 'Detects running Minecraft servers not connected to any Velocity proxy.',
    tier: 3,
    defaultConfidence: 50,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        // Only check non-proxy, online servers
        if (server.software === 'Velocity' || server.status !== ServerStatus.ONLINE) return null;

        const { getServers: getAllServers } = await import('../servers/ServerService');
        const allServers = getAllServers();
        const proxies = allServers.filter(s => s.software === 'Velocity');

        // Skip if no proxy exists at all
        if (proxies.length === 0) return null;

        // Check if this server is linked to any proxy
        const isLinked = proxies.some(p =>
            p.network?.proxyConfig?.links?.some((l: any) => l.serverId === server.id)
        );

        if (isLinked) return null;

        return {
            id: `net-unlinked-${server.id}-${Date.now()}`,
            ruleId: 'network_unlinked_server',
            severity: 'INFO',
            title: 'Server Not Connected to Proxy',
            explanation: `"${server.name}" is running but not linked to any Velocity proxy. Players must connect directly to port ${server.port} instead of through the proxy.`,
            recommendation: `Link this server to your proxy in the Network tab to enable proxy routing, cross-server player transfers, and centralized access control.`,
            confidence: 60,
            timestamp: Date.now()
        };
    }
};

/**
 * Rule for detecting BungeeCord/Velocity IP Forwarding Mismatches.
 */
export const ProxyForwardingConfigRule: DiagnosisRule = {
    id: 'proxy_forwarding_mismatch',
    name: 'Proxy Forwarding Mismatch',
    description: 'Detects when a backend server is not correctly configured to receive proxy connections.',
    tier: 2,
    defaultConfidence: 95,
    triggers: [
        /If you wish to use IP forwarding, please enable it in your BungeeCord config/i,
        /This server requires you to connect with Velocity/i,
        /Unexpected packet received during login process/i
    ],
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const fullLog = logs.join('\n');
        
        const bungeeMatch = /If you wish to use IP forwarding, please enable it in your BungeeCord config/i.test(fullLog);
        const velocityMatch = /This server requires you to connect with Velocity/i.test(fullLog);
        
        if (bungeeMatch || velocityMatch) {
            let recommendation = 'Check your proxy configuration and backend server settings.';
            let explanation = 'Your server is blocking a connection because it expects the player to connect through a proxy (like BungeeCord or Velocity) with IP forwarding enabled, but the connection was either direct or misconfigured.';
            
            if (velocityMatch) {
                recommendation = 'Make sure you are connecting through your Velocity proxy IP/Port. If you are the proxy owner, check that `velocity-support` in `paper-global.yml` and the forwarding secret match between the proxy and this server.';
            } else if (bungeeMatch) {
                 recommendation = 'Make sure you are connecting through your proxy IP/Port. If you are the proxy owner, check that `bungeecord: true` is set in your `spigot.yml`.';
            }

            return {
                id: `proxy-cfg-${server.id}-${Date.now()}`,
                ruleId: 'proxy_forwarding_mismatch',
                severity: 'WARNING',
                title: 'Proxy Connection Rejected',
                explanation: explanation,
                recommendation: recommendation,
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const NetworkRules = [
    DuckDnsAuthRule,
    PublicIpMismatchRule,
    NoFallbackRule,
    UnlinkedServerRule,
    ProxyForwardingConfigRule
];
