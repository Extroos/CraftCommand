
import { statsRingBuffer } from './StatsRingBuffer';
import { getServer, getServers } from '../servers/ServerService';
import { logger } from '../../utils/logger';
import { ServerConfig, ServerStatus } from '@shared/types';
import os from 'os';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         LOAD CAPACITY SIMULATOR                     ║
 * ║  "What if N players join?" predictive model         ║
 * ║  Based on per-player resource impact from trends    ║
 * ╚══════════════════════════════════════════════════════╝
 */

export interface PlayerResourceImpact {
    memoryPerPlayerMB: number;
    cpuPerPlayerPercent: number;
    sampleCount: number;
    confidence: number;  // 0-100
}

export interface CapacityProjection {
    serverId: string;
    serverName: string;
    currentPlayers: number;
    targetPlayers: number;
    projectedMemoryMB: number;
    projectedCpuPercent: number;
    allocatedMemoryMB: number;
    systemCpuCores: number;
    canHandle: boolean;
    bottleneck: 'none' | 'memory' | 'cpu' | 'both';
    headroomPercent: number;  // How much capacity remains (%)
    maxEstimatedPlayers: number;  // Estimated max before hitting limits
    warnings: string[];
}

export interface SimulationResult {
    projections: CapacityProjection[];
    systemSummary: {
        totalMemoryGB: number;
        freeMemoryGB: number;
        cpuCores: number;
        totalAllocatedRAM_GB: number;
    };
}

class LoadSimulatorService {
    /**
     * Calculate per-player resource impact from historical data.
     * Uses correlation between player count changes and resource changes.
     */
    async getPlayerImpact(serverId: string): Promise<PlayerResourceImpact | null> {
        const stats = statsRingBuffer.getStats(serverId);
        if (!stats || stats.samples < 20) return null;

        const trend = statsRingBuffer.getTrend(serverId, 'memory');
        
        // If we've never seen players, use default estimates
        if (stats.avgPlayers === 0) {
            return this.getDefaultImpact(serverId);
        }

        // Estimate per-player impact:
        // Memory impact ≈ (current total memory - base memory) / player count
        // Base memory ≈ memory when 0 players (use a fraction of avg as estimate)
        const baseMemoryMB = stats.avgMemory * 0.6; // Estimate baseline as 60% of avg
        const currentMemoryMB = stats.avgMemory;
        const avgPlayers = stats.avgPlayers;

        const memoryPerPlayer = avgPlayers > 0
            ? Math.max(10, (currentMemoryMB - baseMemoryMB) / avgPlayers)  // Min 10MB per player
            : 50; // Default if can't calculate

        // CPU per player: rough estimate from avg CPU / avg players
        const cpuPerPlayer = avgPlayers > 0
            ? Math.max(0.5, stats.avgCpu / avgPlayers)
            : 3; // Default 3% per player

        return {
            memoryPerPlayerMB: Math.round(memoryPerPlayer),
            cpuPerPlayerPercent: Math.round(cpuPerPlayer * 10) / 10,
            sampleCount: stats.samples,
            confidence: Math.min(95, Math.max(30, stats.samples * 1.5))
        };
    }

    /**
     * Default per-player impact estimates when no historical data exists.
     */
    private getDefaultImpact(serverId: string): PlayerResourceImpact {
        const server = getServer(serverId);
        const software = server?.software || 'Paper';

        // Defaults based on server type
        const defaults: Record<string, { mem: number; cpu: number }> = {
            'Paper': { mem: 40, cpu: 2.5 },
            'Spigot': { mem: 45, cpu: 3.0 },
            'Forge': { mem: 80, cpu: 4.0 },   // Modded = heavier
            'Fabric': { mem: 60, cpu: 3.0 },
            'NeoForge': { mem: 80, cpu: 4.0 },
            'Vanilla': { mem: 35, cpu: 2.0 },
            'Bedrock': { mem: 25, cpu: 1.5 },   // Bedrock is lighter
            'Velocity': { mem: 5, cpu: 0.5 },    // Proxy is minimal
        };

        const impact = defaults[software] || defaults['Paper'];
        return {
            memoryPerPlayerMB: impact.mem,
            cpuPerPlayerPercent: impact.cpu,
            sampleCount: 0,
            confidence: 30 // Low confidence — using defaults
        };
    }

    /**
     * Simulate what happens if N players join a specific server.
     */
    async simulateServer(serverId: string, targetPlayers: number): Promise<CapacityProjection | null> {
        const server = getServer(serverId);
        if (!server) return null;

        const impact = await this.getPlayerImpact(serverId);
        if (!impact) return null;

        const stats = statsRingBuffer.getStats(serverId);

        const currentPlayers = stats?.avgPlayers || 0;
        const currentMemoryMB = stats?.avgMemory || 0;
        const currentCpu = stats?.avgCpu || 0;
        const additionalPlayers = Math.max(0, targetPlayers - currentPlayers);

        // Project resources
        const projectedMemoryMB = currentMemoryMB + (additionalPlayers * impact.memoryPerPlayerMB);
        const projectedCpuPercent = currentCpu + (additionalPlayers * impact.cpuPerPlayerPercent);
        const allocatedMemoryMB = server.ram * 1024;
        const cpuCores = os.cpus().length;

        // Determine bottleneck
        const memoryOk = projectedMemoryMB < allocatedMemoryMB * 0.9;
        const cpuOk = projectedCpuPercent < 90;
        const canHandle = memoryOk && cpuOk;

        let bottleneck: CapacityProjection['bottleneck'] = 'none';
        if (!memoryOk && !cpuOk) bottleneck = 'both';
        else if (!memoryOk) bottleneck = 'memory';
        else if (!cpuOk) bottleneck = 'cpu';

        // Calculate headroom
        const memoryHeadroom = ((allocatedMemoryMB - projectedMemoryMB) / allocatedMemoryMB) * 100;
        const cpuHeadroom = 100 - projectedCpuPercent;
        const headroomPercent = Math.min(memoryHeadroom, cpuHeadroom);

        // Estimate max players
        const maxByMemory = Math.floor((allocatedMemoryMB * 0.9 - currentMemoryMB) / impact.memoryPerPlayerMB) + currentPlayers;
        const maxByCpu = Math.floor((90 - currentCpu) / impact.cpuPerPlayerPercent) + currentPlayers;
        const maxEstimatedPlayers = Math.max(0, Math.min(maxByMemory, maxByCpu));

        // Build warnings
        const warnings: string[] = [];
        if (projectedMemoryMB > allocatedMemoryMB * 0.85) {
            warnings.push(`RAM would hit ${Math.round(projectedMemoryMB)}MB / ${allocatedMemoryMB}MB (${Math.round(projectedMemoryMB / allocatedMemoryMB * 100)}%)`);
        }
        if (projectedCpuPercent > 80) {
            warnings.push(`CPU would hit ${Math.round(projectedCpuPercent)}% — expect TPS degradation`);
        }
        if (targetPlayers > maxEstimatedPlayers) {
            warnings.push(`Exceeds estimated capacity of ~${maxEstimatedPlayers} players`);
        }
        if (impact.confidence < 50) {
            warnings.push('Low confidence — not enough historical data, using estimated defaults');
        }

        return {
            serverId: server.id,
            serverName: server.name,
            currentPlayers: Math.round(currentPlayers),
            targetPlayers,
            projectedMemoryMB: Math.round(projectedMemoryMB),
            projectedCpuPercent: Math.round(projectedCpuPercent * 10) / 10,
            allocatedMemoryMB,
            systemCpuCores: cpuCores,
            canHandle,
            bottleneck,
            headroomPercent: Math.round(headroomPercent),
            maxEstimatedPlayers,
            warnings
        };
    }

    /**
     * Simulate across all servers: "What if we get N total players?"
     */
    async simulateAll(totalTargetPlayers: number): Promise<SimulationResult> {
        const servers = getServers();
        const onlineServers = servers.filter(s =>
            s.status === ServerStatus.ONLINE && s.software !== 'Velocity'
        );

        const projections: CapacityProjection[] = [];
        const totalMem = os.totalmem();
        const freeMem = os.freemem();

        // Distribute players proportionally by max players setting
        const totalSlots = onlineServers.reduce((sum, s) => sum + (s.maxPlayers || 20), 0);

        for (const server of onlineServers) {
            const proportion = (server.maxPlayers || 20) / totalSlots;
            const serverTarget = Math.round(totalTargetPlayers * proportion);
            
            const projection = await this.simulateServer(server.id, serverTarget);
            if (projection) projections.push(projection);
        }

        const totalAllocated = onlineServers.reduce((sum, s) => sum + s.ram, 0);

        return {
            projections,
            systemSummary: {
                totalMemoryGB: Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10,
                freeMemoryGB: Math.round(freeMem / 1024 / 1024 / 1024 * 10) / 10,
                cpuCores: os.cpus().length,
                totalAllocatedRAM_GB: totalAllocated
            }
        };
    }
}

export const loadSimulatorService = new LoadSimulatorService();
