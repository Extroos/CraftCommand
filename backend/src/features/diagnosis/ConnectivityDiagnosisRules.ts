
import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
import { ServerStatus } from '@shared/types';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║      CONNECTIVITY DIAGNOSIS RULES                   ║
 * ║  Detect unreachable ports & missing remote access   ║
 * ╚══════════════════════════════════════════════════════╝
 */

/**
 * CRITICAL: Server port is not reachable from the internet.
 * Only fires when we've actually checked and confirmed the port is closed.
 */
export const PortUnreachableRule: DiagnosisRule = {
    id: 'connectivity_port_unreachable',
    name: 'Port Not Reachable',
    description: 'Detects when a running server port cannot be reached from the internet.',
    tier: 1,
    defaultConfidence: 90,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.status !== 'ONLINE') return null;
        // Skip servers without a port set
        if (!server.port) return null;

        const { networkService } = await import('../network/NetworkService');
        const state = networkService.getState();

        // Only fire if we've actually performed a check and it returned 'closed'
        const portStatus = state.reachability.find((r: any) => r.port === server.port);
        if (!portStatus || portStatus.status !== 'closed') return null;

        const isBedrock = server.software === 'Bedrock';

        return {
            id: `conn-port-unreachable-${server.id}-${Date.now()}`,
            ruleId: 'connectivity_port_unreachable',
            severity: 'CRITICAL',
            title: `Port ${server.port} Not Reachable From Internet`,
            explanation: `"${server.name}" is running on port ${server.port}, but external port checks confirm this port cannot be reached from the internet. Players outside your network will be unable to connect.`,
            recommendation: isBedrock
                ? `Open UDP port ${server.port} on your router, or enable UPnP. Bedrock uses UDP — make sure the firewall rule is for UDP, not just TCP.`
                : `Open TCP port ${server.port} on your router, or enable UPnP in your CraftCommands Remote Access settings. Also check your OS firewall (Windows Firewall / iptables).`,
            confidence: 92,
            timestamp: Date.now()
        };
    }
};

/**
 * WARNING: Remote access is disabled — server is local-only.
 */
export const NoRemoteAccessRule: DiagnosisRule = {
    id: 'connectivity_no_remote_access',
    name: 'Remote Access Disabled',
    description: 'Warns when an online server has no remote access method enabled.',
    tier: 2,
    defaultConfidence: 60,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.status !== 'ONLINE') return null;
        // Skip proxy — we only care about servers people connect to
        if (server.software === 'Velocity') return null;

        const { remoteAccessService } = await import('../system/RemoteAccessService');
        const status = await remoteAccessService.getStatus();

        if (status.enabled) return null;
        if (server.publicStatus !== true) return null;

        return {
            id: `conn-no-remote-${server.id}-${Date.now()}`,
            ruleId: 'connectivity_no_remote_access',
            severity: 'WARNING',
            title: 'Server Only Accessible Locally',
            explanation: `"${server.name}" is running, but Remote Access is disabled globally. The panel and server are only accessible from this IP (${status.localIP || '127.0.0.1'}). External players and remote management are blocked.`,
            recommendation: 'Enable Remote Access in Settings → Remote Access, or set up a tunnel if you are behind a CGNAT. If this server should remain private, you can toggle "Public Status" OFF in its settings to hide this reminder.',
            confidence: 70,
            timestamp: Date.now()
        };
    }
};

export const PortConflictRule: DiagnosisRule = {
    id: 'port_conflict',
    name: 'Port Conflict',
    description: 'Checks if the server port is already in use',
    triggers: [
        /BindException: Address already in use/i,
        /Could not bind to port/i,
        /Address already in use/i,
        /FAILED TO BIND TO PORT/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const hasError = logs.some(l => /already in use|FAILED TO BIND TO PORT|Could not bind to port/i.test(l));
        if (hasError) {
            return {
                id: `port-conflict-${server.id}-${Date.now()}`,
                ruleId: 'port_conflict',
                severity: 'CRITICAL',
                title: 'Port Already In Use',
                explanation: `Port ${server.port} is already being used by another process.`,
                recommendation: `Change the server port in settings or stop the application using port ${server.port}.`,
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { serverId: server.id, port: (server.port || 25565) + 1 },
                    automaticRepair: false
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const InvalidIpRule: DiagnosisRule = {
    id: 'invalid_ip_binding',
    name: 'Invalid IP Binding',
    description: 'Checks for invalid server-ip in properties',
    triggers: [
        /Can't assign requested address/i,
        /Perhaps a server is already running on that port/i,
        /server-ip/i
    ],
    tier: 1,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
         const hasError = logs.some(l => /Can't assign requested address/i.test(l));
         if (hasError) {
              return {
                id: `ip-bind-${server.id}-${Date.now()}`,
                ruleId: 'invalid_ip_binding',
                severity: 'CRITICAL',
                title: 'Invalid IP Binding',
                explanation: `Server is trying to bind to an IP that doesn't exist on this machine.`,
                recommendation: `Set 'server-ip' to blank (empty) in server.properties or your startup flags.`,
                action: {
                    type: 'FIX_IP_BINDING',
                    payload: { serverId: server.id },
                    automaticRepair: true
                },
                timestamp: Date.now()
              };
         }
         return null;
    }
};

export const NetworkOfflineRule: DiagnosisRule = {
    id: 'network_offline',
    name: 'Network Offline',
    description: 'Detects if the server cannot reach authentication servers',
    triggers: [
        /UnknownHostException: authlib\.game-host\.org/i,
        /Could not connect to authlib/i,
        /Authentication servers are down/i
    ],
    tier: 2,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const hasError = logs.some(l => /UnknownHostException|Authentication servers are down/i.test(l));
        if (hasError) {
            return {
                id: `net-offline-${server.id}-${Date.now()}`,
                ruleId: 'network_offline',
                severity: 'WARNING',
                title: 'Network Connectivity Issue',
                explanation: 'Server cannot reach Minecraft authentication servers.',
                recommendation: 'Check host internet connection or firewall rules.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const NetworkProtocolRule: DiagnosisRule = {
    id: 'protocol_mismatch',
    name: 'Protocol Mismatch',
    description: 'Checks for incompatible client/server protocols',
    triggers: [
        /Outdated client/i,
        /Outdated server/i,
        /Incompatible packet/i
    ],
    tier: 3,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const logLine = logs.find(l => /Outdated client|Outdated server/i.test(l));
        if (logLine) {
            return {
                id: `protocol-${server.id}-${Date.now()}`,
                ruleId: 'protocol_mismatch',
                severity: 'INFO',
                title: 'Client Version Mismatch',
                explanation: 'A player tried to connect with an incompatible Minecraft version.',
                recommendation: 'Ensure players are using the correct version or install ViaVersion.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const PacketTooBigRule: DiagnosisRule = {
    id: 'packet_too_big',
    name: 'Packet Too Large',
    description: 'Detects payload size violations',
    triggers: [
        /Packet too large/i,
        /tried to send too many bytes/i,
        /Payload may not be larger than/i
    ],
    tier: 3,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const logLine = logs.find(l => /Packet too large|too many bytes/i.test(l));
        if (logLine) {
            return {
                id: `packet-size-${server.id}-${Date.now()}`,
                ruleId: 'packet_too_big',
                severity: 'WARNING',
                title: 'Network Packet Violation',
                explanation: 'Modded data packet exceeded the Minecraft protocol limit.',
                recommendation: 'Install "Connectivity" or "Packet Size" mods to increase limits.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const ConnectivityRules: DiagnosisRule[] = [
    PortUnreachableRule,
    NoRemoteAccessRule,
    PortConflictRule,
    InvalidIpRule,
    NetworkOfflineRule,
    NetworkProtocolRule,
    PacketTooBigRule
];
