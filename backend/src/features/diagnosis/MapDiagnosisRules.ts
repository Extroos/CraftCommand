import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
import { mapService } from '../servers/MapService';
import fs from 'fs-extra';
import path from 'path';

/**
 * Rule for detecting Dynmap webserver port conflicts.
 */
export const MapPortConflictRule: DiagnosisRule = {
    id: 'dynmap_port_conflict',
    name: 'Dynmap Port Conflict',
    description: 'Detects if the Dynmap internal webserver failed to bind to its port.',
    tier: 3,
    defaultConfidence: 100,
    triggers: [/Failed to start webserver/i, /Port already in use/i, /Dynmap .* disabling webserver/i],
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const hasLogMatch = logs.some(l => 
            (l.includes('dynmap') || l.includes('Dynmap')) && 
            (/Failed to start webserver/i.test(l) || /Port already in use/i.test(l))
        );

        if (hasLogMatch) {
            const status = await mapService.getMapStatus(server.id);
            const port = status?.port || 8123;
            return {
                id: `map-port-${server.id}-${Date.now()}`,
                ruleId: 'dynmap_port_conflict',
                severity: 'WARNING',
                title: 'Dynmap Webserver Conflict',
                explanation: `Dynmap failed to start its internal webserver on port ${port} because another application is already using it.`,
                recommendation: 'Change the webserver-port in plugins/dynmap/configuration.txt or stop the conflicting application.',
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { reassignMapPort: true, serverId: server.id },
                    automaticRepair: false // Requires careful port selection
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting Dynmap storage issues.
 */
export const MapStorageRule: DiagnosisRule = {
    id: 'dynmap_storage_full',
    name: 'Map Storage Exhausted',
    description: 'Detects if the disk is too full to save map tiles.',
    tier: 3,
    defaultConfidence: 95,
    triggers: [/No space left on device/i, /Failed to save tile/i, /Disk quota exceeded/i],
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const hasSpam = logs.some(l => 
            (l.includes('dynmap') || l.includes('Dynmap')) && 
            (/No space left/i.test(l) || /Failed to save tile/i.test(l))
        );

        if (hasSpam) {
            return {
                id: `map-disk-${server.id}-${Date.now()}`,
                ruleId: 'dynmap_storage_full',
                severity: 'CRITICAL',
                title: 'Map Storage Full',
                explanation: 'Dynmap is unable to save new map tiles because the disk is full or the quota has been reached.',
                recommendation: 'Free up disk space or move the Dynmap storage directory to a larger disk.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const MapRules = [
    MapPortConflictRule,
    MapStorageRule
];
