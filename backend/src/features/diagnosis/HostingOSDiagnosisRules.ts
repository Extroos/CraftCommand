
import { DiagnosisRule } from './types';
import { ServerConfig, DiagnosisResult } from '@shared/types';

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

export const HostingOSRules: DiagnosisRule[] = [
    ThermalAlertRule,
    MemoryPressureRule
];
