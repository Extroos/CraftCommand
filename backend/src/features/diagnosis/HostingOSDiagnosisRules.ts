
import os from 'os';
import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
import path from 'path';
import fs from 'fs-extra';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║      HOSTING OS DIAGNOSIS RULES                     ║
 * ║  System-level alerts for hosting environments       ║
 * ╚══════════════════════════════════════════════════════╝
 */

/**
 * CRITICAL: CPU temperature is dangerously high (≥90°C).
 * Only fires when thermal data is available.
 */
export const ThermalAlertRule: DiagnosisRule = {
    id: 'hosting_thermal_alert',
    name: 'CPU Thermal Alert',
    description: 'Detects dangerously high CPU temperatures that can cause throttling or hardware damage.',
    tier: 1,
    defaultConfidence: 95,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        // Only run this rule once (for the first server evaluated, not per-server)
        // We use a static sentinel — if we already reported thermal in this cycle, skip
        if (server.status !== 'ONLINE') return null;

        const { hostingOSService } = await import('../system/HostingOSService');
        const thermal = await hostingOSService.getThermal();

        if (thermal.cpuTemp === null) return null; // Sensor not available

        if (thermal.warning === 'critical') {
            return {
                id: `hosting-thermal-${Date.now()}`,
                ruleId: 'hosting_thermal_alert',
                severity: 'CRITICAL',
                title: `CPU Temperature Critical: ${thermal.cpuTemp}°C`,
                explanation: `The CPU temperature has reached ${thermal.cpuTemp}°C, which is in the critical zone (≥90°C). The CPU is likely throttling performance to prevent damage. All servers on this machine will experience degraded performance.`,
                recommendation: 'Check cooling immediately: clean dust filters, verify fan operation, improve airflow, or reduce server load. Consider shutting down some servers until temperature normalizes.',
                confidence: 98,
                timestamp: Date.now()
            };
        }

        if (thermal.warning === 'hot') {
            return {
                id: `hosting-thermal-hot-${Date.now()}`,
                ruleId: 'hosting_thermal_alert',
                severity: 'WARNING',
                title: `CPU Temperature High: ${thermal.cpuTemp}°C`,
                explanation: `The CPU temperature is ${thermal.cpuTemp}°C (≥80°C). While not yet critical, sustained high temperatures reduce CPU lifespan and can trigger thermal throttling under additional load.`,
                recommendation: 'Monitor temperature trends. Consider improving case airflow, cleaning dust, or reducing the number of running servers during peak hours.',
                confidence: 85,
                timestamp: Date.now()
            };
        }

        return null;
    }
};

/**
 * WARNING: System memory pressure — barely any free RAM for new servers.
 */
export const MemoryPressureRule: DiagnosisRule = {
    id: 'hosting_memory_pressure',
    name: 'System Memory Pressure',
    description: 'Warns when overall system memory usage exceeds 90%, leaving little headroom.',
    tier: 1,
    defaultConfidence: 85,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.status !== 'ONLINE') return null;

        const { hostingOSService } = await import('../system/HostingOSService');
        const health = await hostingOSService.getHealth();

        if (health.memory.usagePercent < 90) return null;

        return {
            id: `hosting-memory-${server.id}-${Date.now()}`,
            ruleId: 'hosting_memory_pressure',
            severity: health.memory.usagePercent >= 97 ? 'CRITICAL' : 'WARNING',
            title: `System RAM ${health.memory.usagePercent >= 97 ? 'Exhausted' : 'Pressure'}: ${health.memory.freeGB}GB Free`,
            explanation: `System memory is ${health.memory.usagePercent}% utilized (${health.memory.usedGB}GB of ${health.memory.totalGB}GB). Only ${health.memory.freeGB}GB remains free. The OS may start using swap/page file, which severely degrades performance for all JVM-based servers.`,
            recommendation: 'Reduce allocated RAM across servers, stop non-essential servers, or add more physical memory. Avoid over-provisioning — servers don\'t always need the maximum RAM allocated.',
            confidence: 90,
            timestamp: Date.now()
        };
    }
};

export const InsufficientRamRule: DiagnosisRule = {
    id: 'insufficient_ram_allocation',
    name: 'Insufficient RAM Allocation',
    description: 'Checks if the allocated RAM meets minimum requirements',
    tier: 1,
    defaultConfidence: 100,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        const minRam = 1;
        if (server.ram < minRam) {
            return {
                id: `low-ram-${server.id}-${Date.now()}`,
                ruleId: 'insufficient_ram_allocation',
                severity: 'WARNING',
                title: 'Low Memory Allocation',
                explanation: `Server is allocated ${server.ram}GB RAM. Some software versions require at least ${minRam}GB to start reliably.`,
                recommendation: `Increase RAM to ${minRam}GB or more.`,
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { serverId: server.id, ram: minRam },
                    automaticRepair: false
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const DiskSpaceRule: DiagnosisRule = {
    id: 'low_disk_space',
    name: 'Low Disk Space',
    description: 'Checks for low disk space on the hosting drive',
    triggers: [
        /No space left on device/i,
        /Insufficient space/i,
        /IOException: Disk full/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const hasError = logs.some(l => /No space left on device|Insufficient space/i.test(l));
        
        // env.diskFree is in MB (from DiagnosisService)
        const diskFreeMB = env.diskFree || 0;
        const lowDisk = diskFreeMB > 0 && diskFreeMB < 500; // < 500MB

        if (hasError || lowDisk) {
            return {
                id: `disk-full-${server.id}-${Date.now()}`,
                ruleId: 'low_disk_space',
                severity: 'CRITICAL',
                title: 'Disk Space Exhausted',
                explanation: hasError ? 'Server crashed because the disk is full.' : `Disk space is critically low (${Math.round(diskFreeMB)}MB remaining).`,
                recommendation: 'Delete old backups, logs, or unused files to free up space.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

// --- CPU SMOOTHING (v4.8) ---
// We track the last 3 CPU readings to ensure we don't fire on quick spikes.
const cpuHistory: number[] = [];
const HISTORY_LIMIT = 3;

export const NodeHealthRule: DiagnosisRule = {
    id: 'node_system_health',
    name: 'Local Node Health',
    description: 'Monitors the health of the local hosting engine',
    tier: 1,
    defaultConfidence: 90,
    triggers: [],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        // v4.0 Resilience: Stabilization Period (2 Minutes)
        const uptime = os.uptime();
        if (uptime < 120) return null;

        // Use system-wide CPU from the environment stats
        const systemCpu = env.cpuUsage || 0;
        
        // Update History
        cpuHistory.push(systemCpu);
        if (cpuHistory.length > HISTORY_LIMIT) cpuHistory.shift();

        // v4.8 Smoothing Logic:
        // 1. Threshold raised to 98% (Requested)
        // 2. Requires ALL history points to be above threshold (Smoothed)
        // 3. Immediately clears if current load is normal (Real-time suppression)
        const isSustainedHighLoad = cpuHistory.length >= HISTORY_LIMIT && cpuHistory.every(v => v >= 98);
        
        if (systemCpu >= 98 && isSustainedHighLoad) {
             return {
                id: `node-health-${Date.now()}`,
                ruleId: 'node_system_health',
                severity: 'WARNING',
                title: 'Node Overloaded',
                explanation: `The hosting panel is experiencing sustained extreme CPU usage (${Math.round(systemCpu)}%). Background tasks may be delayed.`,
                recommendation: 'Reduce the number of simultaneously running automated tasks or wait for background indexing to complete.',
                timestamp: Date.now()
            };
        }
        
        // If CPU is below 98%, any previous history is irrelevant for a "Fix"
        if (systemCpu < 98) {
            cpuHistory.length = 0; // Clear history to ensure it requires a FRESH sustained period to re-trigger
        }

        return null;
    }
};

export const LogManagementRule: DiagnosisRule = {
    id: 'log_file_oversize',
    name: 'Oversized Log File',
    description: 'Detects massive log files that cause performance lag',
    tier: 3,
    defaultConfidence: 100,
    triggers: [],
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (!server.workingDirectory) return null;
        const logPath = path.join(server.workingDirectory, 'logs', 'latest.log');
        
        try {
            const stats = await fs.stat(logPath);
            const sizeMb = stats.size / 1024 / 1024;
            if (sizeMb > 250) {
                return {
                    id: `huge-log-${server.id}-${Date.now()}`,
                    ruleId: 'log_file_oversize',
                    severity: 'WARNING',
                    title: 'Oversized Log File',
                    explanation: `latest.log is ${Math.round(sizeMb)}MB. Large logs can cause panel lag and high disk I/O.`,
                    recommendation: 'Enable log compression or clear the mods/plugins causing excessive output.',
                    action: {
                         type: 'SMART_LOG_ROTATION',
                         payload: { serverId: server.id },
                         automaticRepair: false
                    },
                    timestamp: Date.now()
                };
            }
        } catch (e) {}
        return null;
    }
};

export const HostingOSRules: DiagnosisRule[] = [
    ThermalAlertRule,
    MemoryPressureRule,
    InsufficientRamRule,
    DiskSpaceRule,
    NodeHealthRule,
    LogManagementRule
];
