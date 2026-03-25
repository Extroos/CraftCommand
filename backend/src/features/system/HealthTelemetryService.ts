import { EventEmitter } from 'events';
import { nodeRegistryService } from '../nodes/NodeRegistryService';
import { notificationService } from '../system/NotificationService';
import { getSystemStats } from '../system/SystemStats';
import { logger } from '../../utils/logger';
import { NodeStatus } from '@shared/types';
import { ErrorCode } from '../../utils/ErrorCodes';

/**
 * HealthTelemetryService — Phase 5 (Observability)
 * 
 * Aggregates health metrics from all nodes and the local host.
 * Monitors for critical thresholds (disk, RAM, CPU) and triggers alerts.
 */
export class HealthTelemetryService extends EventEmitter {
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

            // Check Disk Space (Naive check for now, can be expanded via systeminformation)
            // Note: getSystemStats currently only returns CPU/RAM. 
            // We'll expand it in the future or use hostingOSService.
            
            if (stats.cpu > this.thresholds.cpuHigh) {
                logger.warn(`[HealthTelemetry] Local CPU High: ${stats.cpu}%`);
            }

            const ramPercent = (stats.memory.used / stats.memory.total) * 100;
            if (ramPercent > this.thresholds.ramHighPercent) {
                this.triggerLocalAlert(ErrorCode.E_SYS_OVERLOAD, `System memory usage is critical: ${Math.round(ramPercent)}%`);
            }

        } catch (e) {
            logger.error(`[HealthTelemetry] Failed to perform health audit: ${e}`);
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

    private triggerLocalAlert(code: ErrorCode, message: string) {
        notificationService.create(
            'ADMIN',
            'ERROR',
            'System Health Critical',
            message,
            { code }
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

export const healthTelemetryService = new HealthTelemetryService();
