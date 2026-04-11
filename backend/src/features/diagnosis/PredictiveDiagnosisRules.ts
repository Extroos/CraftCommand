
import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
import { statsRingBuffer } from './StatsRingBuffer';
import si from 'systeminformation';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║        PREDICTIVE DIAGNOSIS RULES                   ║
 * ║  Tier 3 — Advisory predictions based on trends      ║
 * ║  These detect problems BEFORE they happen.          ║
 * ╚══════════════════════════════════════════════════════╝
 */

// ─── Rule 1: Memory Crash Prediction ─────────────────────────────────────────
export const MemoryCrashPredictionRule: DiagnosisRule = {
    id: 'predict_memory_crash',
    name: 'Memory Crash Prediction',
    description: 'Predicts if memory usage trend will exceed allocation within minutes.',
    triggers: [], // Proactive — always runs
    tier: 3,
    defaultConfidence: 70,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (!server.ram) return null;

        const trend = statsRingBuffer.getTrend(server.id, 'memory', 600, 30); // 10 min horizon, need 30s of data
        if (!trend || trend.r2 < 0.5) return null; // Only predict if trend is clear (R² > 0.5)

        const maxMemoryMb = server.ram * 1024; // Convert GB to MB
        const currentUsagePercent = (trend.current / maxMemoryMb) * 100;

        // Only warn if memory is already above 70% AND actively rising
        if (currentUsagePercent < 70 || trend.slope <= 0) return null;

        // Calculate time until max memory is hit
        const remainingMb = maxMemoryMb - trend.current;
        const secondsUntilFull = remainingMb / trend.slope;

        // Only warn if projected to hit max within 10 minutes
        if (secondsUntilFull > 600 || secondsUntilFull < 0) return null;

        const minutesLeft = Math.max(1, Math.round(secondsUntilFull / 60));
        const confidence = Math.min(95, Math.round(50 + (trend.r2 * 30) + (currentUsagePercent > 85 ? 15 : 0)));

        return {
            id: `predict-mem-${server.id}-${Date.now()}`,
            ruleId: 'predict_memory_crash',
            severity: minutesLeft <= 3 ? 'CRITICAL' : 'WARNING',
            title: `Memory Crash Predicted in ~${minutesLeft} min`,
            explanation: `Memory is at ${currentUsagePercent.toFixed(0)}% (${(trend.current / 1024).toFixed(1)}G / ${server.ram}G) and rising at ${(trend.slope * 60 / 1024).toFixed(2)}G/min. At this rate, the server will run out of memory in approximately ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}. (Trend confidence: ${(trend.r2 * 100).toFixed(0)}%)`,
            recommendation: minutesLeft <= 3 
                ? 'Restart the server now to prevent a crash, or increase RAM allocation immediately.'
                : 'Consider restarting the server soon, or investigate which plugins/mods are consuming memory. Increasing RAM allocation may also help.',
            confidence,
            action: {
                type: 'ADJUST_RAM',
                payload: { serverId: server.id, newRam: Math.min(server.ram + 2, 16) },
                automaticRepair: false // RAM changes always manual
            },
            timestamp: Date.now()
        };
    },
    repair: async (server: ServerConfig): Promise<boolean> => {
        const { DiagnosisActions } = require('./DiagnosisActions');
        await DiagnosisActions.performSafeGC(server);
        return true;
    }
};

// ─── Rule 2: TPS Degradation Prediction ──────────────────────────────────────
export const TpsDegradationPredictionRule: DiagnosisRule = {
    id: 'predict_tps_degradation',
    name: 'TPS Degradation Prediction',
    description: 'Detects a sustained downward trend in server tick rate.',
    triggers: [], // Proactive
    tier: 3,
    defaultConfidence: 65,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const trend = statsRingBuffer.getTrend(server.id, 'tps', 300, 30); // 5 min horizon, need 30s
        if (!trend || trend.r2 < 0.4) return null;

        // Only care if TPS is already below healthy and dropping
        if (trend.current >= 19 || trend.slope >= 0) return null;

        // Project where TPS will be in 5 minutes
        const predictedTps = Math.max(0, trend.predicted);

        // Only warn if trending to dangerous levels
        if (predictedTps >= 15) return null;

        const confidence = Math.min(90, Math.round(40 + (trend.r2 * 35) + (trend.current < 17 ? 15 : 0)));

        return {
            id: `predict-tps-${server.id}-${Date.now()}`,
            ruleId: 'predict_tps_degradation',
            severity: trend.current < 15 ? 'WARNING' : 'INFO',
            title: 'Server Performance Declining',
            explanation: `TPS is at ${trend.current.toFixed(1)} and dropping at ${Math.abs(trend.slope * 60).toFixed(1)} TPS/min. If this trend continues, TPS could reach ${predictedTps.toFixed(1)} within 5 minutes, causing noticeable lag for players. (Trend confidence: ${(trend.r2 * 100).toFixed(0)}%)`,
            recommendation: 'Check for: (1) Ticking entities causing lag — use `/kill @e[type=!player]` if needed, (2) Chunk loading from exploration, (3) Redstone machines or farms causing chunk lag, (4) Memory pressure forcing garbage collection pauses.',
            confidence,
            timestamp: Date.now()
        };
    }
};

// ─── Rule 3: Disk Exhaustion Prediction ──────────────────────────────────────
export const DiskExhaustionPredictionRule: DiagnosisRule = {
    id: 'predict_disk_exhaustion',
    name: 'Disk Space Exhaustion Prediction',
    description: 'Predicts when the disk will run out of space based on growth rate.',
    triggers: [], // Proactive
    tier: 3,
    defaultConfidence: 60,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        try {
            const diskInfo = await si.fsSize();
            if (!diskInfo.length) return null;

            // Find the disk containing the server's working directory
            const serverDrive = server.workingDirectory?.charAt(0)?.toUpperCase();
            const disk = diskInfo.find(d => d.mount?.toUpperCase().startsWith(serverDrive || 'C')) || diskInfo[0];
            
            if (!disk || !disk.size) return null;

            const usedPercent = disk.use || 0;
            const freeGb = (disk.available || 0) / (1024 * 1024 * 1024);

            // Stage 1: Immediate concern if disk is > 90% full
            if (usedPercent >= 90 && freeGb < 10) {
                const daysEstimate = freeGb < 1 ? 'less than a day' :
                                     freeGb < 3 ? '1-3 days' :
                                     freeGb < 5 ? '3-5 days' : '~1 week';

                return {
                    id: `predict-disk-${server.id}-${Date.now()}`,
                    ruleId: 'predict_disk_exhaustion',
                    severity: freeGb < 2 ? 'WARNING' : 'INFO',
                    title: `Disk Space Low — ~${freeGb.toFixed(1)}GB Remaining`,
                    explanation: `The drive hosting this server is ${usedPercent.toFixed(0)}% full with only ${freeGb.toFixed(1)}GB remaining. Based on typical Minecraft server growth (world saves, logs, backups), this could be exhausted in ${daysEstimate}.`,
                    recommendation: 'Free space by: (1) Deleting old backups, (2) Trimming the world border to prevent exploration sprawl, (3) Clearing old log files in the /logs directory, (4) Moving the server to a larger disk.',
                    action: {
                        type: 'PERFORM_STORAGE_CLEANUP',
                        payload: { serverId: server.id },
                        automaticRepair: true
                    },
                    confidence: Math.min(90, Math.round(50 + (usedPercent - 85) * 3)),
                    timestamp: Date.now()
                };
            }

            return null;
        } catch {
            return null;
        }
    },
    repair: async (server: ServerConfig): Promise<boolean> => {
        const { DiagnosisActions } = require('./DiagnosisActions');
        const fs = require('fs-extra'); // Usually injected but rules can import locally if needed
        await DiagnosisActions.smartLogRotation(server, fs);
        return true;
    }
};

// ─── Rule 4: CPU Saturation Prediction ───────────────────────────────────────
export const CpuSaturationPredictionRule: DiagnosisRule = {
    id: 'predict_cpu_saturation',
    name: 'CPU Saturation Warning',
    description: 'Detects sustained high CPU usage that may lead to performance collapse.',
    triggers: [], // Proactive
    tier: 3,
    defaultConfidence: 65,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const samples = statsRingBuffer.getSamples(server.id);
        if (samples.length < 30) return null; // Need at least 30 seconds

        // Check the last 30 samples for sustained high CPU
        const recentSamples = samples.slice(-30);
        const highCpuCount = recentSamples.filter(s => s.cpu > 90).length;
        const avgCpu = recentSamples.reduce((sum, s) => sum + s.cpu, 0) / recentSamples.length;

        // Only warn if CPU has been above 90% for more than 80% of the last 30 seconds
        if (highCpuCount < 24) return null;

        // Check if it's also trending upward (not just plateaued)
        const trend = statsRingBuffer.getTrend(server.id, 'cpu', 120, 20);
        const isRising = trend && trend.slope > 0.1;

        const confidence = Math.min(90, Math.round(50 + (highCpuCount / 30) * 30 + (isRising ? 10 : 0)));

        return {
            id: `predict-cpu-${server.id}-${Date.now()}`,
            ruleId: 'predict_cpu_saturation',
            severity: avgCpu > 95 ? 'WARNING' : 'INFO',
            title: 'Sustained CPU Overload Detected',
            explanation: `CPU has been above 90% for ${highCpuCount} of the last 30 seconds (average: ${avgCpu.toFixed(1)}%).${isRising ? ' Usage is still climbing.' : ''} This level of sustained load typically leads to TPS drops, connection timeouts, and eventually server unresponsiveness.`,
            recommendation: 'Investigate: (1) Use Spark or Timings to identify hot code paths, (2) Reduce view-distance in server.properties, (3) Limit entity counts with mob caps, (4) Check for runaway plugins or redstone contraptions.',
            confidence,
            timestamp: Date.now()
        };
    }
};

// ─── Export ──────────────────────────────────────────────────────────────────
export function getPredictiveRules(): DiagnosisRule[] {
    return [
        MemoryCrashPredictionRule,
        TpsDegradationPredictionRule,
        DiskExhaustionPredictionRule,
        CpuSaturationPredictionRule
    ];
}
