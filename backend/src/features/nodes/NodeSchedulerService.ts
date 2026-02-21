import { nodeRegistryService } from './NodeRegistryService';
import {  NodeInfo, NodeHealth, NodeStatus  } from '@shared/types';
import { logger } from '../../utils/logger';

/**
 * NodeSchedulerService — Phase 22
 * 
 * Assigns servers to the optimal available node based on resource availability.
 * Uses a weighted scoring algorithm considering CPU, memory, disk, and server count.
 * 
 * Scoring weights:
 *   - Memory availability: 40% (most critical for JVM-based servers)
 *   - CPU availability: 30% (important for tick processing)
 *   - Disk availability: 15% (server files + world data)
 *   - Server count: 15% (prefer nodes with fewer servers for load distribution)
 */

const WEIGHTS = {
    memory: 0.40,
    cpu: 0.30,
    disk: 0.15,
    serverCount: 0.15
};

// Minimum resource thresholds to be considered a candidate
const MIN_THRESHOLDS = {
    memoryFreeBytes: 512 * 1024 * 1024,  // 512MB free minimum
    cpuFreePercent: 10,                    // 10% CPU headroom minimum
    diskFreeBytes: 1024 * 1024 * 1024      // 1GB free disk minimum
};

export interface SchedulerCandidate {
    node: NodeInfo;
    score: number;
    reasons: string[];
}

export interface SchedulerResult {
    selectedNode: NodeInfo | null;
    candidates: SchedulerCandidate[];
    reason: string;
}

/**
 * Calculate a normalized 0–1 score for a node based on its health metrics.
 */
function scoreNode(node: NodeInfo, health: NodeHealth, ramRequiredGB: number): SchedulerCandidate {
    const reasons: string[] = [];

    // Memory score: how much free memory relative to what's needed
    const memoryFree = health.memoryTotal - health.memoryUsed;
    const memoryRequired = ramRequiredGB * 1024 * 1024 * 1024;
    const memoryRatio = Math.min(memoryFree / Math.max(memoryRequired, 1), 3); // Cap at 3x headroom
    const memoryScore = memoryRatio / 3; // Normalize to 0–1

    if (memoryFree < MIN_THRESHOLDS.memoryFreeBytes) {
        reasons.push(`Low memory: ${Math.round(memoryFree / 1024 / 1024)}MB free`);
        return { node, score: -1, reasons }; // Disqualified
    }
    if (memoryFree < memoryRequired) {
        reasons.push(`Insufficient memory for ${ramRequiredGB}GB allocation`);
        return { node, score: -1, reasons };
    }

    // CPU score: inverse of usage
    const cpuFree = 100 - health.cpu;
    const cpuScore = cpuFree / 100;

    if (cpuFree < MIN_THRESHOLDS.cpuFreePercent) {
        reasons.push(`High CPU usage: ${health.cpu.toFixed(1)}%`);
        return { node, score: -1, reasons };
    }

    // Disk score: how much free disk space
    const diskFree = health.diskTotal - health.diskUsed;
    const diskScore = Math.min(diskFree / (10 * 1024 * 1024 * 1024), 1); // 10GB = perfect score

    if (diskFree < MIN_THRESHOLDS.diskFreeBytes) {
        reasons.push(`Low disk space: ${Math.round(diskFree / 1024 / 1024)}MB free`);
        return { node, score: -1, reasons };
    }

    // Server count score: fewer is better
    const serverCountScore = Math.max(1 - (health.serverCount / 10), 0); // 0 servers = 1.0, 10+ = 0.0

    // Weighted total
    const score = (
        memoryScore * WEIGHTS.memory +
        cpuScore * WEIGHTS.cpu +
        diskScore * WEIGHTS.disk +
        serverCountScore * WEIGHTS.serverCount
    );

    reasons.push(
        `Memory: ${Math.round(memoryFree / 1024 / 1024)}MB free (score: ${memoryScore.toFixed(2)})`,
        `CPU: ${cpuFree.toFixed(1)}% free (score: ${cpuScore.toFixed(2)})`,
        `Disk: ${Math.round(diskFree / 1024 / 1024 / 1024)}GB free (score: ${diskScore.toFixed(2)})`,
        `Servers: ${health.serverCount} running (score: ${serverCountScore.toFixed(2)})`
    );

    return { node, score, reasons };
}

/**
 * Find the best node for a new server based on resource requirements.
 */
export function findBestNode(ramRequiredGB: number = 2, excludeNodeIds: string[] = []): SchedulerResult {
    const nodes = nodeRegistryService.getAllNodes();
    const candidates: SchedulerCandidate[] = [];

    const onlineNodes = nodes.filter(n =>
        n.status === NodeStatus.ONLINE &&
        !excludeNodeIds.includes(n.id)
    );

    if (onlineNodes.length === 0) {
        return {
            selectedNode: null,
            candidates: [],
            reason: 'No online nodes available.'
        };
    }

    for (const node of onlineNodes) {
        const health = node.health;
        if (!health) {
            candidates.push({
                node,
                score: -1,
                reasons: ['No health data available (agent may have just connected)']
            });
            continue;
        }

        const candidate = scoreNode(node, health, ramRequiredGB);
        candidates.push(candidate);
    }

    // Sort by score descending (disqualified nodes have score -1)
    candidates.sort((a, b) => b.score - a.score);

    const validCandidates = candidates.filter(c => c.score > 0);

    if (validCandidates.length === 0) {
        return {
            selectedNode: null,
            candidates,
            reason: 'All nodes are at capacity or have insufficient resources.'
        };
    }

    const best = validCandidates[0];
    logger.info(`[Scheduler] Selected node "${best.node.name}" (score: ${best.score.toFixed(3)}) for ${ramRequiredGB}GB server`);

    return {
        selectedNode: best.node,
        candidates,
        reason: `Selected "${best.node.name}" (score: ${best.score.toFixed(3)})`
    };
}

/**
 * Get scheduler recommendations for all online nodes (for the UI).
 */
export function getNodeRecommendations(ramRequiredGB: number = 2): SchedulerCandidate[] {
    const result = findBestNode(ramRequiredGB);
    return result.candidates;
}

export const nodeSchedulerService = {
    findBestNode,
    getNodeRecommendations
};
