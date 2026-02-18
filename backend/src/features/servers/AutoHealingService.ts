import si from 'systeminformation';
import fs from 'fs';
import path from 'path';
import { processManager } from '../processes/ProcessManager';
import { logger } from '../../utils/logger';
import { diagnosisService } from '../diagnosis/DiagnosisService';
import { autoHealingManager } from '../diagnosis/AutoHealingManager';
import { NetUtils } from '../../utils/NetUtils';
import { RecoveryStage, RecoveryState, StabilityMarker } from '@shared/types/health';
import { systemSettingsService } from '../system/SystemSettingsService';

/**
 * AutoHealing v3: Proactive Health Management
 * Orchestrates a state-aware recovery pipeline and protects host resources.
 */
class AutoHealingService {
    private checkInterval: NodeJS.Timeout | null = null;
    private activeRecoveries: Map<string, RecoveryState> = new Map();
    private stabilityMarkers: Map<string, StabilityMarker> = new Map();
    private healthCheckLocks: Set<string> = new Set();
    
    private STABILITY_FILE = path.join(process.cwd(), 'backend', 'data', 'stability.json');
    private HEALTH_LOG_FILE = path.join(process.cwd(), 'logs', 'health.log');

    constructor() {
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

        setTimeout(() => {
            this.startMonitoring();
            this.listenToProcessEvents();
        }, 10000);
    }

    private async listenToProcessEvents() {
        processManager.on('status', ({ id, status }) => {
            if (status === 'CRASHED') {
                this.initiateRecovery(id, 'CRASH_DETECTED');
            }
        });
    }

    private startMonitoring() {
        logger.info('[AutoHealing] v3 Proactive Intelligence ACTIVE. Monitoring health vectors...');
        
        // Main Loop: 10s tick
        this.checkInterval = setInterval(async () => {
            const v3Settings = systemSettingsService.getSettings().app.autoHealingV3;
            const { getServers } = require('./ServerService');
            const servers = getServers();
            const hostHealth = await this.checkHostHealth();

            for (const server of servers) {
                // 1. Skip if already in safe mode
                const marker = this.getStabilityMarker(server.id);
                if (marker.isSafeMode) continue;

                // 2. Drift Detection (v3) - Always active if Auto-Healing is ON
                const isDriftFixActive = v3Settings?.driftDetectionEnabled !== false; // Default to true
                if (isDriftFixActive && server.status === 'ONLINE' && !processManager.isRunning(server.id)) {
                    // CRITICAL: Skip if we are intentionally stopping!
                    if (processManager.isStopping(server.id)) continue;

                    logger.warn(`[AutoHealing] Drift Detected for ${server.id} (Status ONLINE but PID missing). Triggering repair.`);
                    this.initiateRecovery(server.id, 'DRIFT_REPAIR');
                    continue;
                }

                // 3. Proactive Health Evaluation
                if (server.advancedFlags?.autoHealing || server.crashDetection) {
                    const lastCheck = (this as any)[`lastCheck_${server.id}`] || 0;
                    const interval = (server.advancedFlags?.healthCheckInterval || 60) * 1000;

                    if (Date.now() - lastCheck >= interval) {
                        (this as any)[`lastCheck_${server.id}`] = Date.now();
                        this.evalServerHealth(server, hostHealth);
                    }
                }
            }

            // 4. Log Snapshot (v3)
            const snapshotInterval = v3Settings?.healthSnapshotInterval || 5;
            const lastSnapshot = (this as any).lastSnapshot || 0;
            if (Date.now() - lastSnapshot >= snapshotInterval * 60000) {
                (this as any).lastSnapshot = Date.now();
                this.logHealthSnapshot(hostHealth);
            }
        }, 10000);
    }

    public async checkHostHealth() {
        const v3Settings = systemSettingsService.getSettings().app.autoHealingV3;
        try {
            const mem = await si.mem();
            const cpu = await si.currentLoad();
            const fsStats = await si.fsStats();
            
            const memoryPressure = (mem.active / mem.total) * 100;
            const cpuLoad = cpu.currentLoad;
            const diskIO = fsStats.wx_sec + fsStats.rx_sec; // Bytes per second

            const isOverloaded = memoryPressure > 92 || cpuLoad > 95 || diskIO > ((v3Settings?.ioThrottlingThreshold || 80) * 1024 * 1024 * 5); // Rough conversion to bps
            
            if (isOverloaded) {
                const reason = memoryPressure > 92 ? 'RAM' : cpuLoad > 95 ? 'CPU' : 'DISK_IO';
                logger.warn(`[AutoHealing:Sentinel] System Overload Detected (${reason}). Throttling active recoveries.`);
            }

            return { cpuLoad, memoryPressure, diskIO, isOverloaded, memoryTotal: mem.total };
        } catch (e) {
            return { cpuLoad: 0, memoryPressure: 0, diskIO: 0, isOverloaded: false };
        }
    }

    private logHealthSnapshot(health: any) {
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] CPU: ${Math.round(health.cpuLoad)}% | RAM: ${Math.round(health.memoryPressure)}% | IO: ${Math.round(health.diskIO / 1024 / 1024)}MB/s | Recoveries: ${this.activeRecoveries.size}\n`;
        try {
            fs.appendFileSync(this.HEALTH_LOG_FILE, entry);
        } catch (e) {}
    }

    private async evalServerHealth(server: any, hostHealth: any) {
        if (this.healthCheckLocks.has(server.id) || this.activeRecoveries.has(server.id)) return;

        const isRunning = processManager.isRunning(server.id);
        
        if (!isRunning && server.autoStart) {
            // CRITICAL: Skip if we are intentionally stopping!
            if (processManager.isStopping(server.id)) return;

            this.initiateRecovery(server.id, 'ZOMBIE_REPAIR');
            return;
        }

        if (isRunning) {
            this.healthCheckLocks.add(server.id);
            try {
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

        const state: RecoveryState = {
            serverId,
            stage: 'TRIAGE',
            startTime: Date.now(),
            attempts: marker.consecutiveCrashes + 1,
            stabilityScore: marker.score
        };

        // LOOP PREVENTION: If we've attempted recovery 5 times in the last 10 minutes, enter Safe Mode
        const recentCrashes = marker.consecutiveCrashes;
        if (recentCrashes >= 5) {
            logger.error(`[AutoHealing:${serverId}] Recovery loop detected. Entering Safe Mode.`);
            marker.isSafeMode = true;
            this.saveStabilityMarkers();
            return;
        }

        this.activeRecoveries.set(serverId, state);
        this.processPipeline(state);
    }

    private async processPipeline(state: RecoveryState) {
        const { serverId } = state;
        const { getServer, stopServer, startServer } = require('./ServerService');
        const server = getServer(serverId);

        try {
            state.stage = 'TRIAGE';
            processManager.updateCachedStatus(serverId, { status: 'RECOVERING', details: 'Triaging crash source...' });
            
            const logs = processManager.getLogs(serverId);
            const env: any = await this.checkHostHealth();
            const diagnosis = await diagnosisService.diagnose(server, logs, {
                totalMemory: env.memoryTotal || 0,
                freeMemory: (env.memoryTotal || 0) * (1 - (env.memoryPressure || 0) / 100),
                javaVersion: server.javaVersion || 'unknown'
            });
            const rootCause = diagnosis.find(d => d.isRootCause) || diagnosis[0];

            if (rootCause?.action?.autoHeal) {
                state.stage = 'REPAIR';
                logger.info(`[AutoHealing:${serverId}] PIPELINE: Applying targeted fix: ${rootCause.title}`);
                await autoHealingManager.executeFix(serverId, rootCause.action.type, rootCause.action.payload);
            }

            state.stage = 'SCRUB';
            if (processManager.isRunning(serverId)) {
                await stopServer(serverId, true);
            }

            state.stage = 'START';
            const host = await this.checkHostHealth();
            if (host.isOverloaded && state.attempts > 1) {
                logger.warn(`[AutoHealing:${serverId}] Throttled: Delaying restart due to system pressure.`);
                state.stage = 'TRIAGE';
                setTimeout(() => this.processPipeline(state), 30000);
                return;
            }

            await startServer(serverId);

            state.stage = 'VERIFY';
            logger.info(`[AutoHealing:${serverId}] PIPELINE: Recovery successful. Entering stability watch...`);
            
            setTimeout(async () => {
                const isStillRunning = processManager.isRunning(serverId);
                if (isStillRunning) {
                    this.finalizeRecovery(serverId, true);
                } else {
                    this.finalizeRecovery(serverId, false);
                }
            }, 60000);

        } catch (error: any) {
            logger.error(`[AutoHealing:${serverId}] Pipeline FAILED at ${state.stage}: ${error.message}`);
            this.finalizeRecovery(serverId, false);
        }
    }

    private finalizeRecovery(serverId: string, success: boolean) {
        const marker = this.getStabilityMarker(serverId);
        this.activeRecoveries.delete(serverId);

        if (success) {
            marker.consecutiveCrashes = 0;
            marker.score = Math.min(100, marker.score + 10);
            logger.success(`[AutoHealing:${serverId}] Stability Verified. System nominal.`);
        } else {
            marker.consecutiveCrashes++;
            marker.score = Math.max(0, marker.score - 30);
            marker.lastCrash = Date.now();

            if (marker.consecutiveCrashes >= 3 || marker.score <= 0) {
                marker.isSafeMode = true;
                logger.error(`[AutoHealing:${serverId}] Critical Stability Failure. Entering SAFE MODE. Manual intervention required.`);
                processManager.updateCachedStatus(serverId, { status: 'SAFE_MODE', details: 'Automated recovery failed repeatedly.' });
            }
        }
        this.saveStabilityMarkers();
    }

    public getAllStabilityMarkers(): StabilityMarker[] {
        return Array.from(this.stabilityMarkers.values());
    }

    private getStabilityMarker(serverId: string): StabilityMarker {
        let marker = this.stabilityMarkers.get(serverId);
        if (!marker) {
            marker = {
                serverId,
                score: 100,
                lastCrash: 0,
                consecutiveCrashes: 0,
                isSafeMode: false
            };
            this.stabilityMarkers.set(serverId, marker);
        }
        return marker;
    }
}

export const autoHealingService = new AutoHealingService();
