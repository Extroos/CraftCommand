
import { DiagnosisRule } from './types';
import { ServerConfig, DiagnosisResult } from '@shared/types';

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

export const ConnectivityRules: DiagnosisRule[] = [
    PortUnreachableRule,
    NoRemoteAccessRule
];
