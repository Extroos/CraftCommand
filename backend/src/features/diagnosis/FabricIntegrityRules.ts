import { DiagnosisRule, DiagnosisResult, ServerConfig } from './types';
import { ServerStatus } from '@shared/types';
import { proxyService } from '../network/ProxyService';
import fs from 'fs-extra';
import path from 'path';

/**
 * Rule for detecting if a proxied server accidentally has online-mode=true
 */
export const ProxiedOnlineModeRule: DiagnosisRule = {
    id: 'fabric_proxied_online_mode',
    name: 'Proxied Server Online Mode',
    description: 'Detects if a backend server linked to a proxy is running in online-mode (which prevents proxy routing).',
    tier: 1,
    defaultConfidence: 100,
    triggers: [
        /If you wish to use IP forwarding, please enable it in your BungeeCord config/i,
        /The server is in online mode!/i
    ],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        // Skip proxies themselves
        if (server.software === 'Velocity') return null;

        // Check if this server is linked to a proxy
        const proxy = proxyService.findProxyForServer(server.id);
        if (!proxy) return null;

        // If linked, online-mode MUST be false
        if (server.onlineMode !== false) {
            return {
                id: `fabric-online-${server.id}-${Date.now()}`,
                ruleId: 'fabric_proxied_online_mode',
                severity: 'CRITICAL',
                title: 'Incorrect Online Mode for Proxy',
                explanation: `Server "${server.name}" is linked to proxy "${proxy.name}", but its "online-mode" is currently set to "true". This will cause all player connections through the proxy to fail.`,
                recommendation: 'Change "online-mode" to "false" in server settings. Proxied servers must run in offline-mode as the proxy handles authentication.',
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { onlineMode: false },
                    automaticRepair: true
                },
                evidence: `Current Config: online-mode=${server.onlineMode}`,
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting missing Velocity/BungeeCord support in server configs (Drift)
 */
export const FabricSupportDriftRule: DiagnosisRule = {
    id: 'fabric_support_drift',
    name: 'Proxy Support Drift',
    description: 'Detects if a backend server configuration has disabled its proxy support (Velocity/BungeeCord).',
    tier: 2,
    defaultConfidence: 90,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.software === 'Velocity' || !server.workingDirectory) return null;

        const proxy = proxyService.findProxyForServer(server.id);
        if (!proxy) return null;

        // Implementation details would check paper-global.yml or spigot.yml
        // For now, we flag it if the server was recently unlinked/linked without a reboot
        return null; // Placeholder for deep config inspection
    }
};

export const FabricIntegrityRules = [
    ProxiedOnlineModeRule,
    FabricSupportDriftRule
];
