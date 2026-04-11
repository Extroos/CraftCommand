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
import { healthMonitoringService } from '../system/HealthMonitoringService';
import { nodeRegistryService } from '../nodes/NodeRegistryService';
import { auditService } from '../system/AuditService';
import { ServerConfig, ServerStatus, NodeStatus } from '@shared/types';
import { RecoveryState, StabilityMarker } from '@shared/types/health';
import { ErrorCode } from '../../utils/ErrorCodes';

/**
 * AutomaticRepairService v3.1 (Consolidated)
 * Orchestrates a state-aware recovery pipeline and protects host resources.
 */
class AutomaticRepairService extends EventEmitter {
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
                logger.info(`[RepairService] Loaded ${this.stabilityMarkers.size} stability markers from disk.`);
            }
        } catch (e: any) {
            logger.error(`[RepairService] Failed to load stability markers: ${e.message}`);
        }
    }

    private saveStabilityMarkers() {
        try {
            const data: Record<string, StabilityMarker> = {};
            this.stabilityMarkers.forEach((marker, id) => {
                data[id] = marker;
            });
            const tempPath = `${this.STABILITY_FILE}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
            fs.renameSync(tempPath, this.STABILITY_FILE);
        } catch (e: any) {
            logger.error(`[RepairService] Failed to save stability markers: ${e.message}`);
            try { if (fs.existsSync(`${this.STABILITY_FILE}.tmp`)) fs.unlinkSync(`${this.STABILITY_FILE}.tmp`); } catch { /* ignore */ }
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
        logger.info('[RepairService] Proactive Monitoring ACTIVE. Checking system health...');
        
        // Main Loop: 10s tick
        this.checkInterval = setInterval(async () => {
            const v3Settings = systemSettingsService.getSettings().app.automaticRepairV3;
            // Use runtime require for ServerService to prevent top-level circular dependency
            const { getServers } = require('../servers/ServerService');
            const servers = getServers();
            
            // Consolidation: Use healthMonitoringService for host health
            const hostHealth = healthMonitoringService.getGlobalHealth() as any;
            // Add local metrics that telemetry might not have yet but we need
            const localStats = await SI.currentLoad().catch(() => ({ currentLoad: 0 }));
            const memoryUsage = (os.totalmem() - os.freemem()) / os.totalmem() * 100;

            const isOverloaded = memoryUsage > 92 || localStats.currentLoad > 95;

            for (const server of servers) {
                const marker = this.getStabilityMarker(server.id);
                if (marker.isSafeMode) continue;

                // Drift Detection (v3) 
                const isDriftFixActive = v3Settings?.driftDetectionEnabled !== false;
                if (isDriftFixActive) {
                    const isProcessMissing = server.status === ServerStatus.ONLINE && !processManager.isRunning(server.id) && !processManager.isStopping(server.id);
                    const isCoreMissing = await this.checkFileIntegrity(server);

                    if (isProcessMissing || isCoreMissing) {
                        logger.warn(`[RepairService] ${isCoreMissing ? 'Core Integrity Error' : 'State Drift'} Detected for ${server.id}. Triggering repair.`);
                        this.initiateRecovery(server.id, isCoreMissing ? 'CORE_FILE_MISSING' : 'DRIFT_REPAIR');
                        continue;
                    }
                }

                // Proactive Health Evaluation
                if (server.advancedFlags?.automaticRepair || server.crashDetection) {
                    const lastCheck = (this as any)[`lastCheck_${server.id}`] || 0;
                    const interval = (server.advancedFlags?.healthCheckInterval || 60) * 1000;

                    if (Date.now() - lastCheck >= interval) {
                        (this as any)[`lastCheck_${server.id}`] = Date.now();
                        this.evalServerHealth(server, isOverloaded);
                        this.triggerPredictiveHealing(server); // v4.0 Proactive Step
                    }
                }
            }
        }, 10000);
    }

    private async evalServerHealth(server: any, isOverloaded: boolean) {
        if (this.healthCheckLocks.has(server.id) || this.activeRecoveries.has(server.id)) return;

        // Phase 66: Startup Grace Period
        // If a server is explicitly in STARTING or RESTARTING state, wait for the log parser
        // or the 5-minute timeout to declare it ready before checking port health.
        if (server.status === ServerStatus.STARTING || server.status === ServerStatus.RESTARTING) {
            return;
        }

        // DEGRADED Node Safeguard: Pause if node is melting
        if (server.nodeId && server.nodeId !== 'local') {
            const node = nodeRegistryService.getNode(server.nodeId);
            if (node && node.status === NodeStatus.DEGRADED) {
                logger.warn(`[RepairService] Node ${server.nodeId} is DEGRADED. Throttling health checks for ${server.id}.`);
                return;
            }
        } else if (isOverloaded) {
            logger.warn(`[RepairService] Host is OVERLOADED. Throttling local health checks for ${server.id}.`);
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
                    logger.error(`[RepairService:${server.id}] Instance HUNG (Port ${server.port} unresponsive).`);
                    this.initiateRecovery(server.id, 'HUNG_PROCESS_RESTART');
                }
            } finally {
                this.healthCheckLocks.delete(server.id);
            }
        }
    }

    /**
     * Executes predictive (Tier 3) healing logic before problems escalate.
     */
    private async triggerPredictiveHealing(server: any) {
        if (this.activeRecoveries.has(server.id)) return;

        try {
            // Only run if autostart/autorepair is active to ensure user intent
            if (!server.advancedFlags?.automaticRepair) return;

            const logs = processManager.getLogs(server.id).slice(-100); // Small sample for speed
            const diagnosis = await diagnosisService.diagnose(server, logs);
            
            // Find actionable predictive rules (Tier 3)
            const predictiveFixes = diagnosis.filter(d => 
                (d.ruleId === 'predict_memory_crash' || d.ruleId === 'predict_disk_exhaustion') && 
                d.isRepairable !== false
            );

            for (const fix of predictiveFixes) {
                logger.info(`[RepairService:${server.id}] Triggering Predictive Healing for ${fix.ruleId}`);
                
                // Map ruleId to internal fix types
                const actionMapping: Record<string, string> = {
                    'predict_memory_crash': 'SAFE_GC',
                    'predict_disk_exhaustion': 'ROTATE_LOGS'
                };

                const actionType = actionMapping[fix.ruleId];
                if (actionType) {
                    await this.executeFix(server.id, actionType, {});
                    
                    // v4.0 Global Intelligence: If disk is low, also run global system cleanup
                    if (actionType === 'SMART_LOG_ROTATION') {
                        const { systemService } = require('../system/SystemService');
                        await systemService.performSilentMaintenance();
                    }
                }
            }
        } catch (e: any) {
            logger.error(`[RepairService] Predictive healing failed for ${server.id}: ${e.message}`);
        }
    }

    private async initiateRecovery(serverId: string, trigger: string) {
        if (this.activeRecoveries.has(serverId)) return;

        const marker = this.getStabilityMarker(serverId);
        if (marker.isSafeMode) return;

        // Loop Prevention
        if (marker.consecutiveCrashes >= 3) {
            logger.error(`[RepairService:${serverId}] Recovery loop detected. Entering Safe Mode.`);
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
            processManager.updateCachedStatus(serverId, { status: ServerStatus.RECOVERING, details: 'Analyzing issue cause...' });
            
            const logs = processManager.getLogs(serverId);
            const stats = await healthMonitoringService.getGlobalHealth() as any; // Using consolidated telemetry
            
            const diagnosis = await diagnosisService.diagnose(server, logs);
            const rootCause = diagnosis.find(d => d.isRootCause) || diagnosis[0];

            if (rootCause?.action?.automaticRepair) {
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
                    logger.warn(`[RepairService] Safety backup failed: ${bErr.message}`);
                }

                logger.info(`[RepairService:${serverId}] Applying fix: ${rootCause.title}`);
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
            logger.error(`[RepairService:${serverId}] Pipeline FAILED at ${state.stage}: ${error.message}`);
            this.finalizeRecovery(serverId, false);
        }
    }

    /** 
     * Handles manual repair actions.
     */
    public async executeFix(serverId: string, actionType: string, payload: any): Promise<void> {
        const server = serverRepository.findById(serverId);
        if (!server || !server.workingDirectory) {
            throw new Error(`Cannot execute fix: Server ${serverId} has no directory.`);
        }

        const fsManager = new FileSystemManager(server.workingDirectory);
        logger.info(`[RepairService] Executing ${actionType} for ${serverId}`);

        try {
            switch (actionType) {
                case 'AGREE_EULA': await DiagnosisActions.agreeEula(fsManager); break;
                case 'RESOLVE_PORT_CONFLICT': await DiagnosisActions.resolvePortConflict(server, fsManager); break;
                case 'ADJUST_RAM': await DiagnosisActions.adjustRam(server, payload.newRam); break;
                case 'SWITCH_JAVA': await DiagnosisActions.switchJavaVersion(server, payload.version); break;
                case 'REPAIR_PROPERTIES': await DiagnosisActions.repairProperties(fsManager, server.version); break;
                case 'ROTATE_LOGS': await DiagnosisActions.rotateLogsBySize(fsManager); break;
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
                case 'INSTALL_DEPENDENCY': await DiagnosisActions.installDependency(server, payload.name); break;
                case 'RESTORE_LEVEL_DATA': await DiagnosisActions.restoreLevelData(server, fsManager); break;
                case 'ENABLE_ENTITY_PURGE': await DiagnosisActions.enableEntityPurge(server, fsManager); break;
                case 'REASSIGN_BEDROCK_PORT':
                    await DiagnosisActions.reassignBedrockPort(server);
                    break;
                case 'SMART_LOG_ROTATION': await DiagnosisActions.smartLogRotation(server, fsManager); break;
                case 'SAFE_GC': await DiagnosisActions.performSafeGC(server); break;
                case 'PERFORM_STORAGE_CLEANUP': 
                    await DiagnosisActions.performStorageCleanup(server, fsManager);
                    break;
                case 'SYSTEM_MAINTENANCE': 
                case 'ROTATE_LOGS':
                    await DiagnosisActions.rotateLogsBySize(fsManager);
                    const { systemService } = require('../system/SystemService');
                    await systemService.performSilentMaintenance();
                    break;
                default: throw new Error(`Unknown automatic repair action: ${actionType}`);
            }

            // v1.12.8: Mark this rule as resolved so it doesn't spam stale logs until next boot
            // Map action types back to rule IDs or use generic suppression if specific mapping is unknown
            const actionToRule: Record<string, string> = {
                'AGREE_EULA': 'eula_not_accepted',
                'RESOLVE_PORT_CONFLICT': 'port_binding',
                'PURGE_GHOST': 'port_binding',
                'INSTALL_JAVA': 'java_binary_missing',
                'SWITCH_JAVA': 'java_version',
                'FIX_JVM_ARGS': 'invalid_jvm_args',
                'CLEANUP_WORLD_LOCK': 'world_corruption',
                'RESTORE_LEVEL_DATA': 'world_corruption',
                'ENABLE_ENTITY_PURGE': 'ticking_entity',
                'REASSIGN_BEDROCK_PORT': 'crossplay_udp_port_conflict',
                'INSTALL_DEPENDENCY': 'mod_dependency',
                'REINSTALL_LOADER': 'forge_lib_missing',
                'REINSTALL_BEDROCK': 'bedrock_missing_exe',
                'REPAIR_PROPERTIES': 'malformed_config',
                'REINSTALL_GEYSER': 'geyser_missing',
                'REINSTALL_FLOODGATE': 'floodgate_missing',
                'RESYNC_CROSSPLAY_FORWARDING': 'crossplay_forwarding_mismatch',
                'PERFORM_STORAGE_CLEANUP': 'predict_disk_exhaustion',
                'ROTATE_LOGS': 'predict_disk_exhaustion',
                'SMART_LOG_ROTATION': 'predict_disk_exhaustion',
                'SAFE_GC': 'predict_memory_crash',
                'ADJUST_RAM': 'predict_memory_crash',
                'SYSTEM_MAINTENANCE': 'predict_disk_exhaustion'
            };
            const ruleId = actionToRule[actionType];
            if (ruleId) {
                diagnosisService.markResolved(serverId, ruleId);
            }

            // Phase 66: Immediate Consistency
            // 1. Invalidate cache
            const { invalidateDiagnosisCache } = require('../servers/ServerService');
            invalidateDiagnosisCache(serverId);

            // 2. Trigger immediate re-diagnosis to settle the state
            const { getServer } = require('../servers/ServerService');
            const serverInstance = getServer(serverId);
            if (serverInstance) {
                // Background start without awaiting to keep UI snappy
                const { diagnosisService: dService } = require('./DiagnosisService');
                dService.diagnose(serverInstance, [], true).catch(e => 
                    logger.error(`[AutomaticRepair] Post-fix re-analysis failed: ${e.message}`)
                );
            }

            await notificationService.create(
                'ALL',
                'SUCCESS',
                'Automatic Repair Applied',
                `System applied ${actionType.replace(/_/g, ' ')} to ${server.name}.`,
                { serverId, actionType, timestamp: Date.now(), code: ErrorCode.E_FS_ATOMIC_FAIL } // Future: Use specific codes
            );

            // Hardening - Log to System Audit Trail
            await auditService.log(
                'SYSTEM',
                'AUTOMATIC_REPAIR',
                serverId,
                { actionType, payload, success: true },
                '127.0.0.1', // Internal trigger
                'system@craftcommand.internal'
            );
        } catch (error: any) {
            logger.error(`[RepairService] Fix failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Deep Drift: File Integrity Scanning
     * Verifies that the primary executable (server.jar or bedrock_server) exists 
     * and that essential environment files (eula.txt) are present.
     */
    private async checkFileIntegrity(server: any): Promise<boolean> {
        if (!server.workingDirectory || !fs.existsSync(server.workingDirectory)) return false;

        const executable = server.executable || 'server.jar';
        const corePath = path.join(server.workingDirectory, executable);
        
        // 1. Check primary executable
        if (!fs.existsSync(corePath)) {
            logger.error(`[IntegrityScan:${server.id}] CRITICAL: Executable "${executable}" is missing from storage.`);
            return true; 
        }

        // 2. Check EULA (for Java servers)
        if (server.software !== 'Bedrock' && server.software !== 'Velocity') {
            const eulaPath = path.join(server.workingDirectory, 'eula.txt');
            if (!fs.existsSync(eulaPath)) {
                logger.warn(`[IntegrityScan:${server.id}] eula.txt missing. Automated fix required.`);
                return true;
            }
        }

        return false;
    }

    private finalizeRecovery(serverId: string, success: boolean) {
        const marker = this.getStabilityMarker(serverId);
        this.activeRecoveries.delete(serverId);

        if (success) {
            marker.consecutiveCrashes = 0;
            marker.score = Math.min(100, marker.score + 10);
            logger.success(`[RepairService:${serverId}] Recovery Successful.`);
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
export const automaticRepairService = new AutomaticRepairService();
