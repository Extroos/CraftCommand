import { EventEmitter } from 'events';
import { nodeRegistryService } from '../nodes/NodeRegistryService';
import { notificationService } from '../system/NotificationService';
import { getSystemStats } from '../system/SystemStats';
import { logger } from '../../utils/logger';
import { NodeStatus } from '@shared/types';
import { ErrorCode } from '../../utils/ErrorCodes';

/**
 * HealthMonitoringService
 * 
 * Aggregates health metrics from all nodes and the local host.
 * Monitors for critical thresholds (disk, RAM, CPU) and triggers alerts.
 */
export class HealthMonitoringService extends EventEmitter {
    private checkInterval: NodeJS.Timeout | null = null;
    private thresholds = {
        diskWarningGB: 2.0,
        diskCriticalGB: 1.0,
        cpuHigh: 90,
        ramHighPercent: 95
    };

    constructor() {
        super();
        this.initialize();
    }

    private initialize() {
        // 1. Listen for Node Registration Status Changes
        nodeRegistryService.on('status', ({ nodeId, status, node }) => {
            if (status === NodeStatus.DEGRADED) {
                this.triggerNodeAlert(nodeId, `Node "${node.name}" entered DEGRADED state.`);
            }
        });

        // 2. Start Background Periodic Checks (Host Health)
        this.startBackgroundMonitoring();
    }

    private startBackgroundMonitoring() {
        if (this.checkInterval) return;
        
        // Every 5 minutes, perform a deeper health audit
        this.checkInterval = setInterval(() => this.performHealthAudit(), 300000);
        
        // Immediate first check
        this.performHealthAudit();
    }

    private async performHealthAudit() {
        try {
            const stats = await getSystemStats();
            if (!stats) return;

            // v4.0 Silent-Intelligence: Perform Light Diagnosis during audit
            const { diagnosisService } = require('../diagnosis/DiagnosisService');
            const { getServers } = require('../servers/ServerService');
            
            // We use a mock-like server config for global OS context
            const globalContextServer = { id: 'global', workingDirectory: process.cwd() } as any;
            const diagnosis = await diagnosisService.diagnose(globalContextServer, []);
            
            // 1. CPU Health
            if (stats.cpu > this.thresholds.cpuHigh) {
                const cpuIssue = diagnosis.find(d => d.ruleId === 'predict_cpu_saturation' || d.ruleId === 'hosting_cpu_high');
                const rootCause = cpuIssue?.linkedIssueId ? diagnosis.find(d => d.ruleId === cpuIssue.linkedIssueId) : null;
                
                logger.warn(`[Monitoring] Local CPU High: ${stats.cpu}% ${rootCause ? `(Potential Cause: ${rootCause.title})` : ''}`);
                
                if (stats.cpu > 95) {
                    this.triggerLocalAlert(
                        ErrorCode.E_SYS_OVERLOAD, 
                        `CPU usage is critical: ${stats.cpu}%${rootCause ? `\nLikely cause: ${rootCause.title}` : ''}`,
                        rootCause?.ruleId
                    );
                }
            }

            // 2. RAM Health
            const ramPercent = (stats.memory.used / stats.memory.total) * 100;
            if (ramPercent > this.thresholds.ramHighPercent) {
                const memIssue = diagnosis.find(d => d.ruleId === 'predict_memory_crash' || d.ruleId === 'hosting_ram_high');
                const rootCause = memIssue?.linkedIssueId ? diagnosis.find(d => d.ruleId === memIssue.linkedIssueId) : null;

                this.triggerLocalAlert(
                    ErrorCode.E_SYS_OVERLOAD, 
                    `System memory usage is critical: ${Math.round(ramPercent)}%${rootCause ? `\nRoot cause: ${rootCause.title}` : ''}`,
                    rootCause?.ruleId
                );
            }

            // 3. Disk Health (v4.0 Added)
            const diskUsage = (stats as any).disk?.usagePercent || (stats.memory.used / stats.memory.total * 100); // Fallback
            if (diskUsage > 90) {
                 this.triggerLocalAlert(ErrorCode.E_FS_ATOMIC_FAIL, `Disk space is nearly full (${Math.round(diskUsage)}%). Silent-Maintenance triggered.`);
            }

        } catch (e) {
            logger.error(`[Monitoring] Failed to perform health audit: ${e}`);
        }
    }

    private triggerNodeAlert(nodeId: string, message: string) {
        notificationService.create(
            'ADMIN',
            'WARNING',
            'Node Health Warning',
            message,
            { nodeId, code: ErrorCode.E_NODE_DEGRADED }
        );
    }

    private triggerLocalAlert(code: ErrorCode, message: string, linkedRuleId?: string) {
        notificationService.create(
            'ADMIN',
            'ERROR',
            'System Health Critical',
            message,
            { code, linkedRuleId, timestamp: Date.now() }
        );
    }

    /**
     * Returns a summary of the entire platform's health.
     */
    getGlobalHealth() {
        const nodes = nodeRegistryService.getAllNodes();
        const degradedCount = nodes.filter(n => n.status === NodeStatus.DEGRADED).length;
        const offlineCount = nodes.filter(n => n.status === NodeStatus.OFFLINE).length;
        
        return {
            status: degradedCount > 0 ? 'DEGRADED' : 'HEALTHY',
            nodes: {
                total: nodes.length,
                online: nodes.filter(n => n.status === NodeStatus.ONLINE).length,
                offline: offlineCount,
                degraded: degradedCount
            },
            alerts: [] // Future: Collect active alerts
        };
    }
}

export const healthMonitoringService = new HealthMonitoringService();
