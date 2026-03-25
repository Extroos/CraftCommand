import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
import { NodeInfo } from '@shared/types';
import { nodeRegistryService } from '../nodes/NodeRegistryService';

/**
 * Rule for detecting protocol version mismatches between Node Agent and Panel.
 */
export const NodeVersionMismatchRule: DiagnosisRule = {
    id: 'node_version_mismatch',
    name: 'Node Version Mismatch',
    description: 'Detects if a Node Agent is running an incompatible protocol version.',
    tier: 1,
    defaultConfidence: 100,
    triggers: [], 
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (!server.nodeId || server.nodeId === 'local') return null;

        const node = nodeRegistryService.getNode(server.nodeId);
        if (!node) return null;

        // Compare agent version against panel version for compatibility
        const panelVersion = require('../../../version.json').version;
        const agentVersion = node.agentVersion || 'unknown';
        if (agentVersion !== 'unknown' && agentVersion !== panelVersion) {
            return {
                id: `node-ver-${server.nodeId}-${Date.now()}`,
                ruleId: 'node_version_mismatch',
                severity: 'WARNING',
                title: 'Node Version Mismatch',
                explanation: `Node "${node.name}" agent is running v${agentVersion}, but the panel is v${panelVersion}. This may lead to synchronization issues.`,
                recommendation: 'Update the Node Agent to the same version as the Panel.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting node-level resource starvation.
 */
export const NodeStarvationRule: DiagnosisRule = {
    id: 'node_resource_starvation',
    name: 'Node Resource Starvation',
    description: 'Detects if a node is ONLINE but has critically low resources.',
    tier: 1,
    defaultConfidence: 90,
    triggers: [],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (!server.nodeId) return null;
        
        const node = nodeRegistryService.getNode(server.nodeId);
        if (!node || node.status !== 'ONLINE' || !node.health) return null;

        // Stale check: If last heartbeat was > 5 mins ago, health data is unreliable
        const lastHeartbeat = (node as NodeInfo).lastHeartbeat || 0;
        if (Date.now() - lastHeartbeat > 300000) return null;

        const memUsage = (Number(node.health.memoryUsed) / Number(node.health.memoryTotal)) * 100;
        const cpuUsage = Number(node.health.cpu);

        const isRamStarved = memUsage > 95;
        const isCpuStarved = cpuUsage > 90;

        if (isRamStarved || isCpuStarved) {
            const reason = isRamStarved ? 'RAM' : 'CPU';
            return {
                id: `node-starve-${server.nodeId}-${Date.now()}`,
                ruleId: 'node_resource_starvation',
                severity: 'CRITICAL',
                title: `Node ${reason} Starvation`,
                explanation: `The node hosting this server ("${node.name}") is critically low on ${reason} (${isRamStarved ? memUsage.toFixed(1) : cpuUsage.toFixed(1)}%). The server may crash or hang.`,
                recommendation: 'Stop non-essential servers on this node or upgrade node resources.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const NodeRules = [
    NodeVersionMismatchRule,
    NodeStarvationRule
];
