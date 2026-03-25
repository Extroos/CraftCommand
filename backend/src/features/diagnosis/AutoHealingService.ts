import SI from 'systeminformation'; // si is reserved by system-information sometimes
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { processManager } from '../processes/ProcessManager';
import { logger } from '../../utils/logger';
import { diagnosisService } from './DiagnosisService';
import { DiagnosisActions } from './DiagnosisActions';
import { FileSystemManager } from '../files/FileSystemManager';
import { serverRepository } from '../../storage/ServerRepository';
import { notificationService } from '../system/NotificationService';
import { systemSettingsService } from '../system/SystemSettingsService';
import { backupService } from '../backups/BackupService';
import { healthTelemetryService } from '../system/HealthTelemetryService';
import { nodeRegistryService } from '../nodes/NodeRegistryService';
import { auditService } from '../system/AuditService';
import { ServerConfig, ServerStatus, NodeStatus } from '@shared/types';
import { RecoveryState, StabilityMarker } from '@shared/types/health';
import { ErrorCode } from '../../utils/ErrorCodes';

/**
 * AutoHealingService v3.1 (Consolidated)
 * Relocated to diagnosis folder for architectural purity.
 * Orchestrates a state-aware recovery pipeline and protects host resources.
 */
class AutoHealingService extends EventEmitter {
    private checkInterval: NodeJS.Timeout | null = null;
    private activeRecoveries: Map<string, RecoveryState> = new Map();
    private stabilityMarkers: Map<string, StabilityMarker> = new Map();
    private healthCheckLocks: Set<string> = new Set();
    
    private STABILITY_FILE = path.join(process.cwd(), 'backend', 'data', 'stability.json');
    private HEALTH_LOG_FILE = path.join(process.cwd(), 'logs', 'health.log');

    constructor() {
        super();
        this.ensureDirectories();
        this.loadStabilityMarkers();
    }

    private ensureDirectories() {
        const dataDir = path.dirname(this.STABILITY_FILE);
        const logDir = path.dirname(this.HEALTH_LOG_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    }

    private loadStabilityMarkers() {
        try {
            if (fs.existsSync(this.STABILITY_FILE)) {
                const data = JSON.parse(fs.readFileSync(this.STABILITY_FILE, 'utf-8'));
                Object.keys(data).forEach(id => {
                    this.stabilityMarkers.set(id, data[id]);
                });
                logger.info(`[AutoHealing] Loaded ${this.stabilityMarkers.size} stability markers from disk.`);
            }
        } catch (e: any) {
            logger.error(`[AutoHealing] Failed to load stability markers: ${e.message}`);
        }
    }

    private saveStabilityMarkers() {
        try {
            const data: Record<string, StabilityMarker> = {};
            this.stabilityMarkers.forEach((marker, id) => {
                data[id] = marker;
            });
            fs.writeFileSync(this.STABILITY_FILE, JSON.stringify(data, null, 2));
        } catch (e: any) {
            logger.error(`[AutoHealing] Failed to save stability markers: ${e.message}`);
        }
    }

    private isInitialized = false;

    public initialize() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        // Give basic systems time to boot before starting the heavy sentinel
        setTimeout(() => {
            this.startMonitoring();
            this.listenToProcessEvents();
        }, 10000);
    }

    private async listenToProcessEvents() {
        processManager.on('status', ({ id, status }) => {
            if (status === ServerStatus.CRASHED) {
                this.initiateRecovery(id, 'CRASH_DETECTED');
            }
        });
    }

    private startMonitoring() {
        logger.info('[AutoHealing] v3.1 Proactive Intelligence ACTIVE. Monitoring health vectors...');
        
        // Main Loop: 10s tick
        this.checkInterval = setInterval(async () => {
            const v3Settings = systemSettingsService.getSettings().app.autoHealingV3;
            // Use runtime require for ServerService to prevent top-level circular dependency
            const { getServers } = require('../servers/ServerService');
            const servers = getServers();
            
            // Consolidation: Use healthTelemetryService for host health
            const hostHealth = healthTelemetryService.getGlobalHealth() as any;
            // Add local metrics that telemetry might not have yet but we need
            const localStats = await SI.currentLoad().catch(() => ({ currentLoad: 0 }));
            const memoryUsage = (os.totalmem() - os.freemem()) / os.totalmem() * 100;

            const isOverloaded = memoryUsage > 92 || localStats.currentLoad > 95;

            for (const server of servers) {
                const marker = this.getStabilityMarker(server.id);
                if (marker.isSafeMode) continue;

                // Drift Detection (v3) 
                const isDriftFixActive = v3Settings?.driftDetectionEnabled !== false;
                if (isDriftFixActive && server.status === ServerStatus.ONLINE && !processManager.isRunning(server.id)) {
                    if (processManager.isStopping(server.id)) continue;
                    logger.warn(`[AutoHealing] Drift Detected for ${server.id}. Triggering repair.`);
                    this.initiateRecovery(server.id, 'DRIFT_REPAIR');
                    continue;
                }

                // Proactive Health Evaluation
                if (server.advancedFlags?.autoHealing || server.crashDetection) {
                    const lastCheck = (this as any)[`lastCheck_${server.id}`] || 0;
                    const interval = (server.advancedFlags?.healthCheckInterval || 60) * 1000;

                    if (Date.now() - lastCheck >= interval) {
                        (this as any)[`lastCheck_${server.id}`] = Date.now();
                        this.evalServerHealth(server, isOverloaded);
                    }
                }
            }
        }, 10000);
    }

    private async evalServerHealth(server: any, isOverloaded: boolean) {
        if (this.healthCheckLocks.has(server.id) || this.activeRecoveries.has(server.id)) return;

        // DEGRADED Node Safeguard: Pause if node is melting
        if (server.nodeId && server.nodeId !== 'local') {
            const node = nodeRegistryService.getNode(server.nodeId);
            if (node && node.status === NodeStatus.DEGRADED) {
                logger.warn(`[AutoHealing] Node ${server.nodeId} is DEGRADED. Throttling health checks for ${server.id}.`);
                return;
            }
        } else if (isOverloaded) {
            logger.warn(`[AutoHealing] Host is OVERLOADED. Throttling local health checks for ${server.id}.`);
            return;
        }

        const isRunning = processManager.isRunning(server.id);
        
        if (!isRunning && server.autoStart) {
            if (processManager.isStopping(server.id)) return;
            this.initiateRecovery(server.id, 'ZOMBIE_REPAIR');
            return;
        }

        if (isRunning) {
            this.healthCheckLocks.add(server.id);
            try {
                const { NetUtils } = require('../../utils/NetUtils');
                const isHealthy = await NetUtils.checkServiceHealth(server.port);
                if (!isHealthy) {
                    logger.error(`[AutoHealing:${server.id}] Instance HUNG (Port ${server.port} unresponsive).`);
                    this.initiateRecovery(server.id, 'HUNG_PROCESS_RESTART');
                }
            } finally {
                this.healthCheckLocks.delete(server.id);
            }
        }
    }

    private async initiateRecovery(serverId: string, trigger: string) {
        if (this.activeRecoveries.has(serverId)) return;

        const marker = this.getStabilityMarker(serverId);
        if (marker.isSafeMode) return;

        // Loop Prevention
        if (marker.consecutiveCrashes >= 3) {
            logger.error(`[AutoHealing:${serverId}] Recovery loop detected. Entering Safe Mode.`);
            marker.isSafeMode = true;
            processManager.updateCachedStatus(serverId, { 
                status: ServerStatus.SAFE_MODE, 
                details: 'Automated recovery failed repeatedly. Manual review required.' 
            });
            this.saveStabilityMarkers();
            return;
        }

        const state: RecoveryState = {
            serverId,
            stage: 'TRIAGE',
            startTime: Date.now(),
            attempts: marker.consecutiveCrashes + 1,
            stabilityScore: marker.score
        };

        this.activeRecoveries.set(serverId, state);
        this.processPipeline(state);
    }

    private async processPipeline(state: RecoveryState) {
        const { serverId } = state;
        const { getServer, stopServer, startServer } = require('../servers/ServerService');
        const server = getServer(serverId);

        try {
            state.stage = 'TRIAGE';
            processManager.updateCachedStatus(serverId, { status: ServerStatus.RECOVERING, details: 'Triaging crash source...' });
            
            const logs = processManager.getLogs(serverId);
            const stats = await healthTelemetryService.getGlobalHealth() as any; // Using consolidated telemetry
            
            const diagnosis = await diagnosisService.diagnose(server, logs, {
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                javaVersion: server.javaVersion || 'unknown'
            });
            const rootCause = diagnosis.find(d => d.isRootCause) || diagnosis[0];

            if (rootCause?.action?.autoHeal) {
                state.stage = 'REPAIR';
                
                // SAFETY SNAPSHOT
                try {
                    await backupService.createBackup(
                        server.workingDirectory,
                        serverId,
                        `Auto-Save: Pre-fix (${rootCause.ruleId})`,
                        true
                    );
                } catch (bErr: any) {
                    logger.warn(`[AutoHealing] Safety snapshot failed: ${bErr.message}`);
                }

                logger.info(`[AutoHealing:${serverId}] Applying fix: ${rootCause.title}`);
                await this.executeFix(serverId, rootCause.action.type, rootCause.action.payload);
                state.appliedFix = true;
            }

            state.stage = 'SCRUB';
            if (processManager.isRunning(serverId)) {
                await stopServer(serverId, true);
            }

            await startServer(serverId);

            state.stage = 'VERIFY';
            const backoffMs = Math.min(60000 * Math.pow(2, state.attempts - 1), 300000);
            
            processManager.updateCachedStatus(serverId, { 
                status: ServerStatus.RECOVERING, 
                details: state.appliedFix ? `Fix applied. Verifying (${Math.round(backoffMs/1000)}s)...` : `Restarting for recovery (${Math.round(backoffMs/1000)}s)...`
            });
            
            setTimeout(async () => {
                this.finalizeRecovery(serverId, processManager.isRunning(serverId));
            }, backoffMs);

        } catch (error: any) {
            logger.error(`[AutoHealing:${serverId}] Pipeline FAILED at ${state.stage}: ${error.message}`);
            this.finalizeRecovery(serverId, false);
        }
    }

    /** 
     * Merged from AutoHealingManager.ts 
     */
    public async executeFix(serverId: string, actionType: string, payload: any): Promise<void> {
        const server = serverRepository.findById(serverId);
        if (!server || !server.workingDirectory) {
            throw new Error(`Cannot execute fix: Server ${serverId} has no directory.`);
        }

        const fsManager = new FileSystemManager(server.workingDirectory);
        logger.info(`[AutoHealing] Executing ${actionType} for ${serverId}`);

        try {
            switch (actionType) {
                case 'AGREE_EULA': await DiagnosisActions.agreeEula(fsManager); break;
                case 'RESOLVE_PORT_CONFLICT': await DiagnosisActions.resolvePortConflict(server, fsManager); break;
                case 'ADJUST_RAM': await DiagnosisActions.adjustRam(server, payload.newRam); break;
                case 'SWITCH_JAVA': await DiagnosisActions.switchJavaVersion(server, payload.version); break;
                case 'REPAIR_PROPERTIES': await DiagnosisActions.repairProperties(fsManager, server.version); break;
                case 'CLEANUP_TELEMETRY': await DiagnosisActions.cleanupTelemetry(fsManager); break;
                case 'OPTIMIZE_ARGUMENTS': await DiagnosisActions.optimizeArguments(server); break;
                case 'PURGE_GHOST': await DiagnosisActions.purgeGhost(server); break;
                case 'CREATE_PLUGIN_FOLDER': await DiagnosisActions.createPluginFolder(fsManager); break;
                case 'REMOVE_DUPLICATE_PLUGIN': await DiagnosisActions.removeDuplicatePlugins(fsManager, payload.files); break;
                case 'TAKE_HEAP_SNAPSHOT': await DiagnosisActions.takeHeapSnapshot(payload.reason); break;
                case 'RESTORE_DATA_BACKUP': await DiagnosisActions.restoreDataBackup(fsManager, payload.filename, serverId); break;
                case 'REINSTALL_BEDROCK': await DiagnosisActions.reinstallBedrock(server); break;
                case 'UPDATE_CONFIG':
                    const { updateServer } = require('../servers/ServerService');
                    if (payload.reassignMapPort) await DiagnosisActions.reassignMapPort(server, fsManager);
                    else if (payload.triggerDdnsUpdate) await DiagnosisActions.triggerDdnsUpdate(server);
                    else if (payload.repairPermissions) await DiagnosisActions.repairPermissions(server, fsManager);
                    else await updateServer(serverId, payload);
                    break;
                case 'RESYNC_VELOCITY_SECRET': await DiagnosisActions.resyncVelocitySecret(server, fsManager); break;
                case 'INSTALL_JAVA': await DiagnosisActions.installJava(payload.version); break;
                case 'TRIGGER_DDNS_UPDATE': await DiagnosisActions.triggerDdnsUpdate(server); break;
                case 'CLEANUP_WORLD_LOCK': await DiagnosisActions.cleanupWorldLock(server, fsManager); break;
                case 'FIX_JVM_ARGS': await DiagnosisActions.fixJvmArgs(server); break;
                case 'INSTALL_DEPENDENCY': await DiagnosisActions.installDependency(server, payload.name); break;
                case 'RESTORE_LEVEL_DATA': await DiagnosisActions.restoreLevelData(server, fsManager); break;
                case 'ENABLE_ENTITY_PURGE': await DiagnosisActions.enableEntityPurge(server, fsManager); break;
                case 'REASSIGN_BEDROCK_PORT': await DiagnosisActions.reassignBedrockPort(server); break;
                default: throw new Error(`Unknown auto-heal action: ${actionType}`);
            }

            await notificationService.create(
                'ALL',
                'SUCCESS',
                'Auto-Healing Applied',
                `System applied ${actionType.replace(/_/g, ' ')} to ${server.name}.`,
                { serverId, actionType, timestamp: Date.now(), code: ErrorCode.E_FS_ATOMIC_FAIL } // Future: Use specific codes
            );

            // Hardening - Log to System Audit Trail
            await auditService.log(
                'SYSTEM',
                'AUTO_HEAL',
                serverId,
                { actionType, payload, success: true },
                '127.0.0.1', // Internal trigger
                'system@craftcommand.internal'
            );
        } catch (error: any) {
            logger.error(`[AutoHealing] Fix failed: ${error.message}`);
            throw error;
        }
    }

    private finalizeRecovery(serverId: string, success: boolean) {
        const marker = this.getStabilityMarker(serverId);
        this.activeRecoveries.delete(serverId);

        if (success) {
            marker.consecutiveCrashes = 0;
            marker.score = Math.min(100, marker.score + 10);
            logger.success(`[AutoHealing:${serverId}] Recovery Successful.`);
        } else {
            marker.consecutiveCrashes++;
            marker.score = Math.max(0, marker.score - 30);
            if (marker.consecutiveCrashes >= 3 || marker.score <= 0) {
                marker.isSafeMode = true;
                processManager.updateCachedStatus(serverId, { 
                    status: ServerStatus.SAFE_MODE, 
                    details: 'Automated recovery failed repeatedly.' 
                });
            }
        }
        this.saveStabilityMarkers();
    }

    private getStabilityMarker(serverId: string): StabilityMarker {
        let marker = this.stabilityMarkers.get(serverId);
        if (!marker) {
            marker = { serverId, score: 100, lastCrash: 0, consecutiveCrashes: 0, isSafeMode: false };
            this.stabilityMarkers.set(serverId, marker);
        }
        return marker;
    }

    public getAllStabilityMarkers(): StabilityMarker[] {
        return Array.from(this.stabilityMarkers.values());
    }

    public resetStabilityMarker(serverId: string) {
        const marker = this.getStabilityMarker(serverId);
        marker.isSafeMode = false;
        marker.consecutiveCrashes = 0;
        marker.score = 100;
        this.saveStabilityMarkers();
    }
}

import os from 'os';
export const autoHealingService = new AutoHealingService();
