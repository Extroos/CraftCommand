
import { statsRingBuffer } from '../diagnosis/StatsRingBuffer';
import { getServer, getServers, saveServer } from '../servers/ServerService';
import { logger } from '../../utils/logger';
import { ServerConfig } from '@shared/types';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         MEMORY SCALER SERVICE                       ║
 * ║  Analyzes RAM usage trends and recommends           ║
 * ║  right-sizing (up or down) for server Xmx           ║
 * ╚══════════════════════════════════════════════════════╝
 * 
 * Uses StatsRingBuffer data (from ProcessManager) to analyze
 * whether a server is over-provisioned or under-provisioned.
 */

export interface MemoryRecommendation {
    serverId: string;
    serverName: string;
    currentRamGB: number;
    recommendedRamGB: number;
    direction: 'upsize' | 'downsize' | 'optimal';
    reason: string;
    avgUsageMB: number;
    peakUsageMB: number;
    allocatedMB: number;
    utilizationPercent: number;
    confidence: number;  // 0-100
}

class MemoryScalerService {
    private static MIN_RAM_GB = 0.5;   // Never recommend below 512MB
    private static MAX_RAM_GB = 16;    // Cap at 16GB for single server
    private static DOWNSIZE_THRESHOLD = 0.45;  // < 45% avg usage = over-provisioned
    private static UPSIZE_THRESHOLD = 0.82;    // > 82% avg usage = under-provisioned
    private static HEADROOM_FACTOR = 1.3;      // Recommend 30% headroom above peak

    /**
     * Analyze all online servers and return memory recommendations.
     */
    async analyzeAll(): Promise<MemoryRecommendation[]> {
        const servers = getServers();
        const recommendations: MemoryRecommendation[] = [];

        for (const server of servers) {
            if (server.status !== 'ONLINE') continue;
            if (server.software === 'Velocity' || server.software === 'Bedrock') continue;

            const rec = await this.analyzeServer(server);
            if (rec) recommendations.push(rec);
        }

        return recommendations;
    }

    /**
     * Analyze a single server's memory usage patterns.
     */
    async analyzeServer(server: ServerConfig): Promise<MemoryRecommendation | null> {
        const stats = statsRingBuffer.getStats(server.id);
        if (!stats || stats.samples < 30) return null; // Need at least 30 samples (~30s of data)

        const allocatedMB = server.ram * 1024; // ram is in GB
        const avgUsageMB = stats.avgMemory;
        const peakUsageMB = stats.peakMemory;
        const utilizationPercent = (avgUsageMB / allocatedMB) * 100;

        let direction: MemoryRecommendation['direction'] = 'optimal';
        let recommendedRamGB = server.ram;
        let reason = '';
        let confidence = 50;

        if (utilizationPercent < MemoryScalerService.DOWNSIZE_THRESHOLD * 100) {
            // Over-provisioned: suggest reducing
            direction = 'downsize';
            // Recommend peak + 30% headroom, rounded to nearest 0.5GB
            const idealMB = peakUsageMB * MemoryScalerService.HEADROOM_FACTOR;
            recommendedRamGB = Math.max(
                MemoryScalerService.MIN_RAM_GB,
                Math.ceil(idealMB / 1024 * 2) / 2 // Round to 0.5GB
            );
            reason = `Average usage is only ${Math.round(utilizationPercent)}% (${Math.round(avgUsageMB)}MB of ${allocatedMB}MB). Peak was ${Math.round(peakUsageMB)}MB. ${Math.round(allocatedMB - peakUsageMB)}MB is wasted — other servers could use it.`;
            confidence = stats.samples > 50 ? 85 : 65;
        } else if (utilizationPercent > MemoryScalerService.UPSIZE_THRESHOLD * 100) {
            // Under-provisioned: suggest increasing
            direction = 'upsize';
            const idealMB = peakUsageMB * MemoryScalerService.HEADROOM_FACTOR;
            recommendedRamGB = Math.min(
                MemoryScalerService.MAX_RAM_GB,
                Math.ceil(idealMB / 1024 * 2) / 2
            );
            reason = `Average usage is ${Math.round(utilizationPercent)}% (${Math.round(avgUsageMB)}MB of ${allocatedMB}MB). Peak was ${Math.round(peakUsageMB)}MB. Risk of OutOfMemory errors under load.`;
            confidence = stats.samples > 50 ? 90 : 70;
        } else {
            direction = 'optimal';
            reason = `Memory allocation is well-sized at ${Math.round(utilizationPercent)}% average utilization.`;
            confidence = 80;
        }

        // Don't recommend the same size they already have
        if (recommendedRamGB === server.ram) {
            direction = 'optimal';
        }

        return {
            serverId: server.id,
            serverName: server.name,
            currentRamGB: server.ram,
            recommendedRamGB,
            direction,
            reason,
            avgUsageMB: Math.round(avgUsageMB),
            peakUsageMB: Math.round(peakUsageMB),
            allocatedMB,
            utilizationPercent: Math.round(utilizationPercent),
            confidence
        };
    }

    /**
     * Apply a memory recommendation (requires server restart).
     * Returns true if saved successfully.
     */
    async applyRecommendation(serverId: string, newRamGB: number): Promise<boolean> {
        const server = getServer(serverId);
        if (!server) return false;

        if (newRamGB < MemoryScalerService.MIN_RAM_GB || newRamGB > MemoryScalerService.MAX_RAM_GB) {
            logger.warn(`[MemoryScaler] Recommendation out of bounds: ${newRamGB}GB`);
            return false;
        }

        const oldRam = server.ram;
        server.ram = newRamGB;
        saveServer(server);

        logger.info(`[MemoryScaler] Updated "${server.name}" RAM: ${oldRam}GB → ${newRamGB}GB (requires restart)`);
        return true;
    }
}

export const memoryScalerService = new MemoryScalerService();
