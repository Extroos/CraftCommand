
export type DdnsProvider = 'duckdns' | 'no-ip' | 'dynu' | 'custom';

export interface PublicIpStatus {
    current: string | null;
    lastKnown: string | null;
    lastChangedAt: number | null;
    history: { ip: string; timestamp: number }[];
}

export interface DdnsStatus {
    hostname: string | null;
    resolvedIp: string | null;
    isMatching: boolean;
    lastVerifiedAt: number | null;
    error?: string;
    errorType?: 'AUTH' | 'NOT_FOUND' | 'PROPAGATION' | 'DNS_ERROR' | 'REFUSED' | 'TIMEOUT';
}

export interface PortReachability {
    port: number;
    status: 'open' | 'closed' | 'filtered' | 'unknown';
    lastCheckedAt: number;
}

export interface NetworkState {
    publicIp: PublicIpStatus;
    ddns: DdnsStatus;
    serverDdns: Record<string, DdnsStatus>;
    reachability: PortReachability[];
}

export interface ProxyLink {
    serverId: string; // The ID of the backend server
    alias: string;    // The name Velocity will use (e.g. "lobby")
    restricted?: boolean;
}

export interface NetworkConfig {
    hostname?: string;
    provider?: DdnsProvider;
    token?: string; // e.g. DuckDNS token
    updateEnabled: boolean;
    monitoringEnabled: boolean;
    updateInterval: number; // minutes
    
    // Velocity Proxy Features
    proxyConfig?: {
        links: ProxyLink[];
        forcedHosts?: Record<string, string[]>;
        forwardingMode?: 'none' | 'legacy' | 'bungeeguard' | 'modern';
        secret?: string;
    };

    // Public Access (Tunnels)
    publicAccess?: 'none' | 'cloudflare' | 'playit';
    tunnelToken?: string; // Cloudflare
    playitSecret?: string; // Playit
}
