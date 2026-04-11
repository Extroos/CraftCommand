
import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
import { statsRingBuffer } from './StatsRingBuffer';
import si from 'systeminformation';
import { logger } from '../../utils/logger';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║        RESOURCE ADVISOR RULES                       ║
 * ║  Tier 3 — Intelligent resource optimization         ║
 * ║  Smart Resource Engine: auto-sizing & capacity      ║
 * ╚══════════════════════════════════════════════════════╝
 */

// ─── Rule 1: RAM Right-Sizing Advisor ────────────────────────────────────────
export const RamRightSizingRule: DiagnosisRule = {
    id: 'resource_ram_advisor',
    name: 'RAM Right-Sizing Advisor',
    description: 'Detects over-provisioned or under-provisioned RAM allocation based on real usage.',
    triggers: [], // Proactive — always runs
    tier: 3,
    defaultConfidence: 75,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (!server.ram) return null;

        const stats = statsRingBuffer.getStats(server.id);
        if (!stats || stats.samples < 30) return null; // Need at least 30 seconds of data

        const allocatedMb = server.ram * 1024; // Convert GB → MB
        const peakUsagePercent = (stats.peakMemory / allocatedMb) * 100;
        const avgUsagePercent = (stats.avgMemory / allocatedMb) * 100;

        // ── Over-Provisioned Detection ──
        // If peak usage stays below 40% of allocation for a full sample window,
        // the server has way more RAM than it needs.
        // False Positive Guard: Don't nag for very small servers (< 1GB peak)
        if (peakUsagePercent < 40 && stats.samples >= 300 && server.ram > 1 && stats.peakMemory > 1024) {
            const recommendedGb = Math.max(1, Math.ceil((stats.peakMemory * 1.5) / 1024)); // 50% headroom above peak
            const savingGb = server.ram - recommendedGb;

            if (savingGb < 1) return null; // Not worth recommending less than 1GB change

            return {
                id: `resource-ram-over-${server.id}-${Date.now()}`,
                ruleId: 'resource_ram_advisor',
                severity: 'INFO',
                title: `Server RAM Over-Provisioned — ${savingGb}GB Reclaimable`,
                explanation: `This server is allocated ${server.ram}GB but peak usage over the last ${stats.samples} seconds was only ${(stats.peakMemory / 1024).toFixed(1)}GB (${peakUsagePercent.toFixed(0)}% of allocation). Average usage is even lower at ${avgUsagePercent.toFixed(0)}%. The extra RAM is being reserved but unused — it could be freed for other servers or processes.`,
                recommendation: `Consider reducing RAM from ${server.ram}GB to ${recommendedGb}GB. This keeps 50% headroom above peak usage while freeing ${savingGb}GB for the system. You can always increase it again if player count grows.`,
                confidence: Math.min(90, Math.round(60 + (stats.samples / 60) * 20)),
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { ram: recommendedGb },
                    automaticRepair: false // Recommendations only, never auto-resize
                },
                timestamp: Date.now()
            };
        }

        // ── Under-Provisioned Detection ──
        // If peak usage exceeds 85% of allocation, the server needs more RAM.
        if (peakUsagePercent > 85 && stats.samples >= 20) {
            const trend = statsRingBuffer.getTrend(server.id, 'memory', 300, 20);
            const isRising = trend && trend.slope > 0.5; // Rising at >0.5MB/s

            const recommendedGb = Math.min(16, Math.ceil((stats.peakMemory * 1.3) / 1024)); // 30% above peak
            const increaseGb = recommendedGb - server.ram;

            if (increaseGb < 1) return null; // Already close enough

            return {
                id: `resource-ram-under-${server.id}-${Date.now()}`,
                ruleId: 'resource_ram_advisor',
                severity: 'WARNING',
                title: `Server Needs More RAM — ${peakUsagePercent.toFixed(0)}% Used`,
                explanation: `Memory usage peaked at ${(stats.peakMemory / 1024).toFixed(1)}GB of the ${server.ram}GB allocated (${peakUsagePercent.toFixed(0)}%).${isRising ? ' Memory is still rising.' : ''} When JVM heap pressure exceeds ~90%, garbage collection pauses increase dramatically, causing TPS drops and potential crashes.`,
                recommendation: `Increase RAM allocation from ${server.ram}GB to ${recommendedGb}GB (+${increaseGb}GB). This provides 30% headroom above peak usage and should eliminate GC-related lag spikes.`,
                confidence: Math.min(92, Math.round(65 + (peakUsagePercent > 90 ? 15 : 0) + (isRising ? 12 : 0))),
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { ram: recommendedGb },
                    automaticRepair: false
                },
                timestamp: Date.now()
            };
        }

        return null;
    }
};

// ─── Rule 2: Hardware Upgrade Advisor ────────────────────────────────────────
export const HardwareUpgradeRule: DiagnosisRule = {
    id: 'resource_hardware_advisor',
    name: 'Hardware Upgrade Advisor',
    description: 'Recommends hardware upgrades when system-wide resources are constrained.',
    triggers: [], // Proactive
    tier: 3,
    defaultConfidence: 60,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        try {
            // Only run this check for the first server to avoid duplicate system-wide analysis
            const { getServers } = await import('../servers/ServerService');
            const allServers = getServers();
            if (!allServers.length || allServers[0].id !== server.id) return null;

            const [mem, cpu] = await Promise.all([si.mem(), si.cpu()]);
            if (!mem || !cpu) return null;

            const totalSystemGb = mem.total / (1024 * 1024 * 1024);
            const usedSystemGb = (mem.total - mem.available) / (1024 * 1024 * 1024);
            const systemUsagePercent = (usedSystemGb / totalSystemGb) * 100;

            // Sum up all allocated RAM from CraftCommands servers
            const totalAllocatedGb = allServers
                .filter(s => s.status !== 'OFFLINE' && s.ram)
                .reduce((sum, s) => sum + s.ram, 0);

            const allocatedPercent = (totalAllocatedGb / totalSystemGb) * 100;

            // System CPU from env stats
            const systemCpu = env.cpu || 0;

            const issues: string[] = [];
            const recommendations: string[] = [];

            // Check memory pressure
            if (allocatedPercent > 80) {
                issues.push(`Server allocations (${totalAllocatedGb.toFixed(0)}GB) use ${allocatedPercent.toFixed(0)}% of system RAM (${totalSystemGb.toFixed(0)}GB)`);
                const targetGb = Math.ceil(totalAllocatedGb * 1.5);
                recommendations.push(`Upgrade to ${targetGb}GB+ RAM to provide healthy headroom for the OS and all server instances`);
            }

            if (systemUsagePercent > 85) {
                issues.push(`System memory is at ${systemUsagePercent.toFixed(0)}% — only ${((totalSystemGb - usedSystemGb)).toFixed(1)}GB free`);
                recommendations.push(`Close unused applications or add more RAM`);
            }

            if (systemCpu > 80) {
                issues.push(`System CPU is sustained at ${systemCpu.toFixed(0)}%`);
                recommendations.push(`Consider a CPU with more cores (current: ${cpu.cores} cores, ${cpu.brand || 'Unknown'})`);
            }

            if (issues.length === 0) return null;

            const severity: 'WARNING' | 'INFO' = (allocatedPercent > 90 || systemUsagePercent > 92) ? 'WARNING' : 'INFO';

            return {
                id: `resource-hw-${server.id}-${Date.now()}`,
                ruleId: 'resource_hardware_advisor',
                severity,
                title: `Hardware Capacity ${severity === 'WARNING' ? 'Critical' : 'Advisory'}`,
                explanation: issues.join('. ') + '.',
                recommendation: recommendations.join('. ') + '.',
                confidence: Math.min(88, Math.round(55 + issues.length * 12)),
                timestamp: Date.now()
            };
        } catch {
            return null;
        }
    }
};

// ─── Rule 3: Player Load Capacity Estimator ──────────────────────────────────
export const LoadCapacityRule: DiagnosisRule = {
    id: 'resource_load_estimator',
    name: 'Player Load Capacity Estimator',
    description: 'Estimates maximum player capacity based on actual per-player resource usage.',
    triggers: [], // Proactive
    tier: 3,
    defaultConfidence: 55,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (!server.ram) return null;

        const stats = statsRingBuffer.getStats(server.id);
        if (!stats || stats.samples < 60) return null;

        // Need players online to calculate per-player cost (require at least 5 for better curve)
        if (stats.avgPlayers < 5) return null;

        const allocatedMb = server.ram * 1024;
        const avgPlayers = stats.avgPlayers;

        // Estimate base server cost (what the server uses with 0 players)
        // Heuristic: base cost ≈ avgMemory - (players * per-player cost)
        // We solve for per-player cost using the observed data.
        // Assume base cost is ~40-60% of a Minecraft server's memory.
        // Conservative estimate: base = 40% of current usage, rest is player-driven
        const estimatedBaseMb = stats.avgMemory * 0.45; // Conservative base estimate
        const perPlayerMb = Math.max(10, (stats.avgMemory - estimatedBaseMb) / avgPlayers);
        const perPlayerCpu = Math.max(0.5, (stats.avgCpu * 0.6) / avgPlayers); // 60% of CPU is player-driven

        // Calculate max capacity before hitting limits
        const memoryHeadroom = allocatedMb * 0.85; // Don't exceed 85% of allocation
        const maxPlayersByMemory = Math.floor((memoryHeadroom - estimatedBaseMb) / perPlayerMb);
        const maxPlayersByCpu = Math.floor((85 - (stats.avgCpu * 0.4)) / perPlayerCpu); // Keep 15% CPU headroom

        const estimatedMax = Math.max(1, Math.min(maxPlayersByMemory, maxPlayersByCpu));
        const remainingCapacity = Math.max(0, estimatedMax - Math.ceil(avgPlayers));

        // Only report if the info is useful (not obvious)
        if (estimatedMax > 200 || remainingCapacity > 50) return null; // Server has plenty of room

        const utilizationPercent = (avgPlayers / estimatedMax) * 100;
        const limitingFactor = maxPlayersByMemory < maxPlayersByCpu ? 'memory' : 'CPU';

        let severity: 'WARNING' | 'INFO' = 'INFO';
        if (utilizationPercent > 80) severity = 'WARNING';

        return {
            id: `resource-load-${server.id}-${Date.now()}`,
            ruleId: 'resource_load_estimator',
            severity,
            title: `Player Capacity: ~${remainingCapacity} slots remaining`,
            explanation: `With ${Math.ceil(avgPlayers)} player${Math.ceil(avgPlayers) !== 1 ? 's' : ''} online, the server uses ~${(perPlayerMb).toFixed(0)}MB RAM and ~${perPlayerCpu.toFixed(1)}% CPU per player. At this rate, the estimated maximum capacity is ~${estimatedMax} players before ${limitingFactor} becomes the bottleneck (${utilizationPercent.toFixed(0)}% of capacity used).`,
            recommendation: utilizationPercent > 80
                ? `The server is approaching capacity. To support more players, ${limitingFactor === 'memory' ? `increase RAM from ${server.ram}GB to ${Math.min(16, server.ram + 2)}GB` : 'reduce CPU-intensive features (view-distance, entity counts) or upgrade the CPU'}.`
                : `The server has room for approximately ${remainingCapacity} more players. Monitor this as player count grows.`,
            confidence: Math.min(75, Math.round(40 + Math.min(avgPlayers, 10) * 3 + (stats.samples / 60) * 10)),
            timestamp: Date.now()
        };
    }
};

// ─── Export ──────────────────────────────────────────────────────────────────
export const ResourceAdvisorRules: DiagnosisRule[] = [
    RamRightSizingRule,
    HardwareUpgradeRule,
    LoadCapacityRule
];
