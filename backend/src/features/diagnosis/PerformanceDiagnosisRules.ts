
import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
import { logger } from '../../utils/logger';
import { pluginService } from '../plugins/PluginService';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║        PERFORMANCE & OPTIMIZATION RULES             ║
 * ║  Tier 3 — Focused on Admin Mastery & Stability      ║
 * ╚══════════════════════════════════════════════════════╝
 */

// ─── Rule 1: Fabric Performance Stack ────────────────────────────────────────
/**
 * Detects missing "Core 4" performance mods on Fabric servers.
 * Lithium, FerriteCore, ModernFix, Starlight (for <1.20)
 */
export const FabricPerformanceStackRule: DiagnosisRule = {
    id: 'fabric_performance_stack',
    name: 'Fabric Optimization Stack',
    description: 'Recommends missing performance mods for Fabric.',
    tier: 3,
    defaultConfidence: 100,
    triggers: [], // Proactive
    cooldownHours: 72, // Only suggest every 3 days
    tags: ['optimization', 'modded'],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Fabric') return null;

        const installed = pluginService.getInstalled(server.id);
        const slugs = installed.map(p => (p.name || '').toLowerCase());

        const missing: { name: string, slug: string }[] = [];
        if (!slugs.some(s => s.includes('lithium'))) missing.push({ name: 'Lithium', slug: 'lithium' });
        if (!slugs.some(s => s.includes('ferritecore'))) missing.push({ name: 'FerriteCore', slug: 'ferrite-core' });
        if (!slugs.some(s => s.includes('modernfix'))) missing.push({ name: 'ModernFix', slug: 'modernfix' });

        if (missing.length > 0) {
            return {
                id: `fabric-perf-${server.id}-${Date.now()}`,
                ruleId: 'fabric_performance_stack',
                severity: 'INFO',
                title: 'Performance Optimization Available',
                explanation: `Your Fabric server is missing ${missing.map(m => m.name).join(', ')}. These mods are industry standards for reducing memory usage and tick lag.`,
                recommendation: 'Click "Fix" to batch-install the missing performance mods from Modrinth.',
                action: {
                    type: 'INSTALL_DEPENDENCY', // Reusing the batch installer logic
                    payload: { serverId: server.id, name: missing.map(m => m.slug).join(',') },
                    automaticRepair: false 
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

// ─── Rule 2: View Distance Scaling ───────────────────────────────────────────
/**
 * Detects sustained low TPS and offers to scale down view distance.
 */
export const ViewDistanceScalingRule: DiagnosisRule = {
    id: 'view_distance_scaling',
    name: 'Dynamic View Distance Scaling',
    description: 'Offers to reduce view distance if TPS is consistently low.',
    tier: 3,
    defaultConfidence: 80,
    triggers: [
        /Can't keep up! Is the server overloaded?/i
    ],
    cooldownHours: 24, // Once a day
    tags: ['performance', 'lag'],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        // Only trigger if TPS is actually low OR we see consistent "Can't keep up" logs
        const lowTps = env.tps !== undefined && env.tps < 16;
        const logSpam = logs.filter(l => /Can't keep up/i.test(l)).length > 5;

        if (!lowTps && !logSpam) return null;

        return {
            id: `view-dist-${server.id}-${Date.now()}`,
            ruleId: 'view_distance_scaling',
            severity: 'WARNING',
            title: 'Sustained Lag Detected',
            explanation: `The server is consistently struggling to maintain 20 TPS. High view distances are the most common cause of "Can't keep up" errors on busy servers.`,
            recommendation: 'Reduce "view-distance" and "simulation-distance" by 2 in server.properties to stabilize performance.',
            action: {
                type: 'REPAIR_PROPERTIES', // Will be enhanced to scale values
                payload: { serverId: server.id, scale: -2 },
                automaticRepair: false
            },
            timestamp: Date.now()
        };
    }
};

// ─── Rule 3: Scheduled Maintenance Advisor ──────────────────────────────────
/**
 * Detects memory leaks/long uptimes and recommends a daily restart.
 */
export const RestartRecommendationRule: DiagnosisRule = {
    id: 'restart_recommendation',
    name: 'Maintenance Advisor',
    description: 'Recommends a scheduled restart for long-running servers.',
    tier: 3,
    defaultConfidence: 70,
    triggers: [],
    cooldownHours: 168, // Once a week
    tags: ['optimization', 'stability'],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (!server.startTime) return null;

        const uptimeHours = (Date.now() - server.startTime) / (1000 * 60 * 60);
        const highUsage = env.memoryUsed && env.memoryTotal && (env.memoryUsed / env.memoryTotal > 0.9);

        // Recommend if uptime > 72h or (uptime > 24h AND high memory pressure)
        if (uptimeHours > 72 || (uptimeHours > 24 && highUsage)) {
            return {
                id: `restart-tip-${server.id}-${Date.now()}`,
                ruleId: 'restart_recommendation',
                severity: 'INFO',
                title: 'Scheduled Restart Recommended',
                explanation: `This server has been running for ${Math.round(uptimeHours)}h without a restart. Memory fragmentation can cause performance degradation over time.`,
                recommendation: 'Click "Fix" to schedule a daily maintenance restart at 3:00 AM.',
                action: {
                    type: 'ROTATE_LOGS', // Using ROTATE_LOGS as it triggers silent maintenance in the repair service
                    payload: { serverId: server.id, time: '03:00', recurrence: 'daily' },
                    automaticRepair: false
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export function getPerformanceRules(): DiagnosisRule[] {
    return [
        FabricPerformanceStackRule,
        ViewDistanceScalingRule,
        RestartRecommendationRule
    ];
}
