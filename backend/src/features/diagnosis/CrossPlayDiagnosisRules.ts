
import { DiagnosisRule, DiagnosisResult, ServerConfig } from './types';
import { pluginService } from '../plugins/PluginService';
import { NetUtils } from '../../utils/NetUtils';
import { crossPlayService } from '../network/CrossPlayService';
import { proxyService } from '../network/ProxyService';
import { getServer } from '../servers/ServerService';
import { ServerStatus } from '@shared/types';

/**
 * RULE: Geyser plugin is missing when cross-play is enabled.
 * Auto-healable — reinstalls Geyser from Modrinth.
 */
export const GeyserMissingRule: DiagnosisRule = {
    id: 'geyser_missing',
    name: 'Cross-Play: Geyser Not Found',
    description: 'Checks if the Geyser plugin/mod is installed when cross-play is enabled.',
    triggers: [], // Proactive check
    tier: 2,
    defaultConfidence: 100,
    isHealable: true,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (!server.crossPlay?.enabled) return null;

        // Determine check target (proxy for velocity topology)
        const topology = crossPlayService.detectTopology(server.id);
        const checkTarget = topology === 'velocity'
            ? (proxyService.findProxyForServer(server.id)?.id || server.id)
            : server.id;

        const installed = pluginService.getInstalled(checkTarget);
        const hasGeyser = installed.some(p => (p.name || '').toLowerCase().includes('geyser'));

        if (!hasGeyser) {
            return {
                id: `crossplay-geyser-miss-${server.id}-${Date.now()}`,
                ruleId: 'geyser_missing',
                severity: 'CRITICAL',
                title: 'Geyser Plugin Missing',
                explanation: 'Cross-play is enabled but the Geyser plugin is not installed. Bedrock players will not be able to connect.',
                recommendation: 'Click "Fix" to automatically reinstall Geyser from Modrinth.',
                action: {
                    type: 'REINSTALL_GEYSER',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    },
    heal: async (server: ServerConfig): Promise<boolean> => {
        try {
            const topology = crossPlayService.detectTopology(server.id);
            const target = topology === 'velocity'
                ? (proxyService.findProxyForServer(server.id)?.id || server.id)
                : server.id;
            await pluginService.install(target, 'geyser', 'modrinth');
            return true;
        } catch { return false; }
    }
};

/**
 * RULE: Floodgate plugin is missing when cross-play is enabled.
 * Auto-healable — reinstalls Floodgate from Modrinth.
 */
export const FloodgateMissingRule: DiagnosisRule = {
    id: 'floodgate_missing',
    name: 'Cross-Play: Floodgate Not Found',
    description: 'Checks if the Floodgate plugin is installed for seamless Bedrock auth.',
    triggers: [],
    tier: 2,
    defaultConfidence: 90,
    isHealable: true,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (!server.crossPlay?.enabled) return null;

        const topology = crossPlayService.detectTopology(server.id);
        const checkTarget = topology === 'velocity'
            ? (proxyService.findProxyForServer(server.id)?.id || server.id)
            : server.id;

        const installed = pluginService.getInstalled(checkTarget);
        const hasFloodgate = installed.some(p => (p.name || '').toLowerCase().includes('floodgate'));

        if (!hasFloodgate) {
            return {
                id: `crossplay-flood-miss-${server.id}-${Date.now()}`,
                ruleId: 'floodgate_missing',
                severity: 'WARNING',
                title: 'Floodgate Plugin Missing',
                explanation: 'Cross-play is enabled but Floodgate is not installed. Bedrock players may have authentication issues.',
                recommendation: 'Click "Fix" to install Floodgate from Modrinth.',
                action: {
                    type: 'REINSTALL_FLOODGATE',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    },
    heal: async (server: ServerConfig): Promise<boolean> => {
        try {
            const topology = crossPlayService.detectTopology(server.id);
            const target = topology === 'velocity'
                ? (proxyService.findProxyForServer(server.id)?.id || server.id)
                : server.id;
            await pluginService.install(target, 'floodgate', 'modrinth');
            return true;
        } catch { return false; }
    }
};

/**
 * RULE: Cross-play forwarding secret mismatch (Velocity topology).
 * Auto-healable — re-syncs configs.
 */
export const CrossPlayForwardingMismatchRule: DiagnosisRule = {
    id: 'crossplay_forwarding_mismatch',
    name: 'Cross-Play: Forwarding Mismatch',
    description: 'Detects when Geyser/proxy forwarding secrets are out of sync.',
    triggers: [
        /Forwarding secret.*Geyser/i,
        /Geyser.*forwarding/i,
        /Unable to verify player/i
    ],
    tier: 2,
    defaultConfidence: 95,
    isHealable: true,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (!server.crossPlay?.enabled || server.crossPlay.topology !== 'velocity') return null;

        const hasLogMatch = logs.some(l =>
            /forwarding.*secret/i.test(l) ||
            /Unable to verify player/i.test(l) ||
            /Incompatible forwarding/i.test(l)
        );

        if (hasLogMatch) {
            return {
                id: `crossplay-fwd-${server.id}-${Date.now()}`,
                ruleId: 'crossplay_forwarding_mismatch',
                severity: 'CRITICAL',
                title: 'Cross-Play Forwarding Mismatch',
                explanation: 'The Geyser/Velocity forwarding secret is out of sync. Bedrock players cannot authenticate.',
                recommendation: 'Click "Fix" to re-sync all forwarding configurations.',
                action: {
                    type: 'RESYNC_CROSSPLAY_FORWARDING',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    },
    heal: async (server: ServerConfig): Promise<boolean> => {
        try {
            await crossPlayService.syncConfigs(server.id);
            return true;
        } catch { return false; }
    }
};

/**
 * RULE: Bedrock UDP port conflict.
 * Auto-healable — reassigns to next available UDP port.
 */
export const CrossPlayUdpPortConflictRule: DiagnosisRule = {
    id: 'crossplay_udp_port_conflict',
    name: 'Cross-Play: Bedrock Port Conflict',
    description: 'Checks if the Bedrock UDP port is already in use.',
    triggers: [],
    tier: 1,
    defaultConfidence: 95,
    isHealable: true,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (!server.crossPlay?.enabled) return null;
        if (server.status === ServerStatus.ONLINE) return null; // Port is in use by Geyser — expected

        const port = server.crossPlay.bedrockPort;
        const available = await NetUtils.checkUDPPortBind(port);

        if (!available) {
            return {
                id: `crossplay-udp-${server.id}-${Date.now()}`,
                ruleId: 'crossplay_udp_port_conflict',
                severity: 'WARNING',
                title: `Bedrock Port ${port} In Use`,
                explanation: `UDP port ${port} is already occupied by another process. Bedrock clients will not be able to connect.`,
                recommendation: 'Click "Fix" to automatically assign the next available UDP port, or manually change it in cross-play settings.',
                action: {
                    type: 'REASSIGN_BEDROCK_PORT',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    },
    heal: async (server: ServerConfig): Promise<boolean> => {
        try {
            // Find next available UDP port starting from current + 1
            const current = server.crossPlay?.bedrockPort || 19132;
            for (let p = current + 1; p < current + 100; p++) {
                if (await NetUtils.checkUDPPortBind(p)) {
                    server.crossPlay!.bedrockPort = p;
                    const { saveServer } = require('../servers/ServerService');
                    saveServer(server);
                    await crossPlayService.syncConfigs(server.id);
                    return true;
                }
            }
            return false;
        } catch { return false; }
    }
};

/**
 * RULE: Bedrock port is likely blocked by firewall.
 * NOT auto-healable — provides instructions.
 */
export const CrossPlayBedrockPortBlockedRule: DiagnosisRule = {
    id: 'crossplay_bedrock_port_blocked',
    name: 'Cross-Play: Bedrock Port May Be Blocked',
    description: 'Warns if Bedrock clients are unlikely to reach the Bedrock port.',
    triggers: [
        /Bedrock.*timed out/i,
        /No Bedrock clients connected/i
    ],
    tier: 1,
    defaultConfidence: 70,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (!server.crossPlay?.enabled) return null;
        if (server.status !== ServerStatus.ONLINE) return null;

        // Only trigger if server has been online for >5 min with no Bedrock connections
        const uptime = server.startTime ? Date.now() - server.startTime : 0;
        if (uptime < 5 * 60 * 1000) return null;

        // Check logs for Geyser connection indicators
        const hasBedrockActivity = logs.some(l =>
            /Bedrock player/i.test(l) || /Geyser.*connecting/i.test(l)
        );
        const hasPortError = logs.some(l =>
            /Failed to bind.*19132/i.test(l) || /UDP.*bind.*fail/i.test(l)
        );

        if (hasPortError) {
            return {
                id: `crossplay-blocked-${server.id}-${Date.now()}`,
                ruleId: 'crossplay_bedrock_port_blocked',
                severity: 'WARNING',
                title: 'Bedrock Port May Be Blocked',
                explanation: `UDP port ${server.crossPlay.bedrockPort} appears to be blocked or inaccessible. Bedrock clients (mobile, console) will not be able to connect.`,
                recommendation: `Ensure UDP port ${server.crossPlay.bedrockPort} is open in your firewall. On Windows: "netsh advfirewall firewall add rule name=CraftCommand-Bedrock dir=in action=allow protocol=UDP localport=${server.crossPlay.bedrockPort}".`,
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * RULE: Geyser/Floodgate version may be incompatible with Minecraft version.
 * NOT auto-healable — informational.
 */
export const CrossPlayVersionMismatchRule: DiagnosisRule = {
    id: 'crossplay_version_mismatch',
    name: 'Cross-Play: Version Compatibility',
    description: 'Warns about potential Geyser/Minecraft version incompatibilities.',
    triggers: [
        /Geyser.*outdated/i,
        /Geyser.*unsupported.*version/i,
        /This version of Geyser/i
    ],
    tier: 3,
    defaultConfidence: 80,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (!server.crossPlay?.enabled) return null;

        const hasVersionWarning = logs.some(l =>
            /Geyser.*outdated/i.test(l) ||
            /Geyser.*unsupported/i.test(l) ||
            /This version of Geyser/i.test(l)
        );

        if (hasVersionWarning) {
            return {
                id: `crossplay-ver-${server.id}-${Date.now()}`,
                ruleId: 'crossplay_version_mismatch',
                severity: 'WARNING',
                title: 'Cross-Play Version Mismatch',
                explanation: 'The installed Geyser version may not fully support the current Minecraft version. This can cause chunk rendering issues or missing blocks for Bedrock clients.',
                recommendation: 'Update Geyser to the latest build from the Plugins tab, or check https://geysermc.org for compatibility information.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const CrossPlayRules: DiagnosisRule[] = [
    GeyserMissingRule,
    FloodgateMissingRule,
    CrossPlayForwardingMismatchRule,
    CrossPlayUdpPortConflictRule,
    CrossPlayBedrockPortBlockedRule,
    CrossPlayVersionMismatchRule
];
