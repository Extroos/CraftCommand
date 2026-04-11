
import { DiagnosisRule, DiagnosisResult, ServerConfig } from './types';
import fs from 'fs-extra';
import path from 'path';
import { getServer } from '../servers/ServerService';
import { ServerStatus } from '@shared/types';

/**
 * Checks if a Velocity proxy has no backend servers linked.
 */
export const VelocityNoBackendsRule: DiagnosisRule = {
    id: 'velocity_no_backends',
    name: 'Velocity Backend Check',
    description: 'Checks if any backend servers are linked to the proxy',
    triggers: [],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Velocity') return null;

        const links = server.network?.proxyConfig?.links || [];
        if (links.length === 0) {
            return {
                id: `velocity-no-links-${server.id}-${Date.now()}`,
                ruleId: 'velocity_no_backends',
                severity: 'WARNING',
                title: 'No Backends Linked',
                explanation: 'This Velocity proxy is running but has no backend servers linked. Players will not be able to connect to any game servers.',
                recommendation: 'Go to the "Proxy Network" tab and link at least one backend server (e.g. Lobby).',
                evidence: 'Links defined: 0',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Checks if any linked backend servers are currently offline.
 */
export const VelocityBackendOfflineRule: DiagnosisRule = {
    id: 'velocity_backend_offline',
    name: 'Velocity Backend Availability',
    description: 'Checks if linked backend servers are online',
    triggers: [],
    tier: 2,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Velocity' || server.status !== ServerStatus.ONLINE) return null;

        const links = server.network?.proxyConfig?.links || [];
        const offlineLinks: string[] = [];

        for (const link of links) {
            const backend = getServer(link.serverId);
            if (!backend || backend.status === ServerStatus.OFFLINE || backend.status === ServerStatus.CRASHED) {
                offlineLinks.push(link.alias);
            }
        }

        if (offlineLinks.length > 0) {
            return {
                id: `velocity-backend-offline-${server.id}-${Date.now()}`,
                ruleId: 'velocity_backend_offline',
                severity: 'WARNING',
                title: 'Backend Servers Offline',
                explanation: `The following linked backend servers are offline: ${offlineLinks.join(', ')}. Players trying to connect to these will be disconnected.`,
                recommendation: 'Ensure your backend servers are started and healthy.',
                evidence: `Offline: ${offlineLinks.join(', ')}`,
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting missing or mismatching forwarding.secret file.
 */
export const VelocitySecretMismatchRule: DiagnosisRule = {
    id: 'velocity_secret_mismatch',
    name: 'Proxy Secret Mismatch',
    description: 'Checks if the forwarding.secret file on disk matches the panel configuration.',
    tier: 2,
    defaultConfidence: 100,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Velocity' || !server.workingDirectory) return null;

        const secretPath = path.join(server.workingDirectory, 'forwarding.secret');
        const expectedSecret = server.network?.proxyConfig?.secret;

        if (!expectedSecret) return null;

        try {
            if (!(await fs.pathExists(secretPath))) {
                return {
                    id: `vel-sec-miss-${server.id}-${Date.now()}`,
                    ruleId: 'velocity_secret_mismatch',
                    severity: 'CRITICAL',
                    title: 'Missing Forwarding Secret',
                    explanation: 'The "forwarding.secret" file is missing from the proxy directory, but "modern" forwarding is enabled.',
                    recommendation: 'Click "Fix" to re-generate the secret file.',
                    action: {
                        type: 'RESYNC_VELOCITY_SECRET',
                        payload: { serverId: server.id },
                        automaticRepair: true
                    },
                    evidence: `Missing: ${secretPath}`,
                    timestamp: Date.now()
                };
            }

            const existingSecret = (await fs.readFile(secretPath, 'utf8')).trim();
            if (existingSecret !== expectedSecret) {
                return {
                    id: `vel-sec-sync-${server.id}-${Date.now()}`,
                    ruleId: 'velocity_secret_mismatch',
                    severity: 'CRITICAL',
                    title: 'Proxy Secret Mismatch',
                    explanation: 'The forwarding secret on disk does not match the Panel configuration. Players will be unable to join backends.',
                    recommendation: 'Re-sync the proxy secret to match the backend servers.',
                    action: {
                        type: 'RESYNC_VELOCITY_SECRET',
                        payload: { serverId: server.id },
                        automaticRepair: true
                    },
                    evidence: `Mismatch in: ${secretPath}`,
                    timestamp: Date.now()
                };
            }
        } catch (e) {
            // Permission issues? Handled by core rules if so
        }
        return null;
    }
};

/**
 * Rule for detecting incorrect forwarding mode in velocity.toml
 */
export const VelocityForwardingModeRule: DiagnosisRule = {
    id: 'velocity_forwarding_mode',
    name: 'Incorrect Forwarding Mode',
    description: 'Detects if velocity.toml has player-info-forwarding-mode set to none when modern is expected.',
    tier: 2,
    defaultConfidence: 90,
    triggers: [/Forwarding secret is required/i, /Incompatible forwarding mode/i],
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Velocity' || !server.workingDirectory) return null;

        const hasLogMatch = logs.some(l => /Forwarding secret is required/i.test(l));
        if (hasLogMatch) {
            return {
                id: `vel-mode-err-${server.id}-${Date.now()}`,
                ruleId: 'velocity_forwarding_mode',
                severity: 'CRITICAL',
                title: 'Incorrect Forwarding Config',
                explanation: 'The proxy is configured for "modern" forwarding in the Panel, but velocity.toml is likely set to "none" or "legacy".',
                recommendation: 'Ensure player-info-forwarding-mode is set to "modern" in velocity.toml.',
                evidence: logs.find(l => /Forwarding secret is required/i.test(l))?.trim(),
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting a hanging Velocity proxy (L7 health check failure).
 */
export const VelocityHangRule: DiagnosisRule = {
    id: 'velocity_hang_detected',
    name: 'Proxy Responsiveness Check',
    description: 'Detects if the proxy is running but not responding to TCP connections (Ghost Hang).',
    tier: 1,
    defaultConfidence: 95,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Velocity' || server.status !== ServerStatus.ONLINE) return null;

        const { networkFabricService } = await import('../network/NetworkFabricService');
        if (networkFabricService.getProxyHangStatus()) {
            return {
                id: `vel-hang-${server.id}-${Date.now()}`,
                ruleId: 'velocity_hang_detected',
                severity: 'CRITICAL',
                title: 'Proxy Not Responding (L7 Hang)',
                explanation: `The Velocity process is running, but the CraftCommand Watchdog detected that it is not accepting TCP connections on port ${server.port}. The proxy is likely "hanging" internally.`,
                recommendation: 'Try restarting the proxy server. If this happens frequently, check for plugin-level deadlocks or insufficient RAM.',
                evidence: `Watchdog Signal: L7_TIMEOUT on port ${server.port}`,
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const VelocityRules = [
    VelocityNoBackendsRule,
    VelocityBackendOfflineRule,
    VelocitySecretMismatchRule,
    VelocityForwardingModeRule,
    VelocityHangRule
];
