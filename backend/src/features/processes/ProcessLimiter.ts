
import { exec } from 'child_process';
import util from 'util';
import { logger } from '../../utils/logger';
import os from 'os';

const execAsync = util.promisify(exec);

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         PROCESS LIMITER                             ║
 * ║  CPU affinity & priority control per server         ║
 * ║  Windows: Job Objects + START /affinity             ║
 * ║  Linux: taskset + nice/renice                       ║
 * ╚══════════════════════════════════════════════════════╝
 */

export type CpuPriority = 'normal' | 'high' | 'realtime';

export interface ProcessLimits {
    cpuCores?: number[];   // Pin to specific cores (e.g., [0, 1, 2, 3])
    cpuPercent?: number;   // Max CPU % (Linux cgroups v2 only, optional)
    priority?: CpuPriority;
}

class ProcessLimiterService {
    private totalCores = os.cpus().length;

    /**
     * Apply CPU affinity to a running process by PID.
     * On Windows: uses `PowerShell` to set processor affinity mask.
     * On Linux: uses `taskset -p` to set CPU affinity.
     */
    async setCpuAffinity(pid: number, cores: number[]): Promise<boolean> {
        if (cores.length === 0 || cores.length > this.totalCores) {
            logger.warn(`[ProcessLimiter] Invalid core list: ${cores.join(',')} (system has ${this.totalCores} cores)`);
            return false;
        }

        // Validate all cores are within range
        if (cores.some(c => c < 0 || c >= this.totalCores)) {
            logger.warn(`[ProcessLimiter] Core IDs must be 0-${this.totalCores - 1}`);
            return false;
        }

        try {
            if (process.platform === 'win32') {
                return await this.setWindowsAffinity(pid, cores);
            } else {
                return await this.setLinuxAffinity(pid, cores);
            }
        } catch (e: any) {
            logger.error(`[ProcessLimiter] Failed to set CPU affinity for PID ${pid}: ${e.message}`);
            return false;
        }
    }

    /**
     * Set process priority (nice level).
     * On Windows: uses `wmic`.
     * On Linux: uses `renice`.
     */
    async setPriority(pid: number, priority: CpuPriority): Promise<boolean> {
        try {
            if (process.platform === 'win32') {
                return await this.setWindowsPriority(pid, priority);
            } else {
                return await this.setLinuxPriority(pid, priority);
            }
        } catch (e: any) {
            logger.error(`[ProcessLimiter] Failed to set priority for PID ${pid}: ${e.message}`);
            return false;
        }
    }

    /**
     * Apply all limits to a process.
     */
    async applyLimits(pid: number, limits: ProcessLimits): Promise<{ affinity: boolean; priority: boolean }> {
        const results = { affinity: true, priority: true };

        if (limits.cpuCores && limits.cpuCores.length > 0) {
            results.affinity = await this.setCpuAffinity(pid, limits.cpuCores);
        }

        if (limits.priority) {
            results.priority = await this.setPriority(pid, limits.priority);
        }

        return results;
    }

    /**
     * Generate a recommended core allocation for N server processes.
     * Distributes cores evenly across servers, ensuring no overlap.
     */
    generateCoreAllocation(serverCount: number): number[][] {
        if (serverCount <= 0) return [];
        
        const availableCores = Array.from({ length: this.totalCores }, (_, i) => i);
        
        // Reserve core 0 for OS if we have enough cores
        const serverCores = this.totalCores > 4
            ? availableCores.slice(1)  // Skip core 0
            : availableCores;

        const coresPerServer = Math.max(1, Math.floor(serverCores.length / serverCount));
        const allocations: number[][] = [];

        for (let i = 0; i < serverCount; i++) {
            const start = i * coresPerServer;
            const end = Math.min(start + coresPerServer, serverCores.length);
            allocations.push(serverCores.slice(start, end));
        }

        // Give remaining cores to the last server
        if (allocations.length > 0) {
            const lastAlloc = allocations[allocations.length - 1];
            const lastEnd = lastAlloc[lastAlloc.length - 1] + 1;
            for (let i = lastEnd; i < serverCores[serverCores.length - 1] + 1; i++) {
                if (!lastAlloc.includes(i) && serverCores.includes(i)) {
                    lastAlloc.push(i);
                }
            }
        }

        return allocations;
    }

    /**
     * Get system info for UI display.
     */
    getSystemInfo() {
        const cpus = os.cpus();
        return {
            totalCores: this.totalCores,
            model: cpus[0]?.model || 'Unknown',
            speed: cpus[0]?.speed || 0,
            platform: process.platform
        };
    }

    // ─── Windows Implementation ───────────────────────────

    private async setWindowsAffinity(pid: number, cores: number[]): Promise<boolean> {
        // Calculate affinity mask (bitmask of cores)
        let mask = 0;
        for (const core of cores) {
            mask |= (1 << core);
        }

        // Use PowerShell to set affinity
        const cmd = `powershell -Command "(Get-Process -Id ${pid}).ProcessorAffinity = ${mask}"`;
        await execAsync(cmd);
        logger.info(`[ProcessLimiter] Set Windows affinity for PID ${pid}: cores [${cores.join(',')}] (mask: 0x${mask.toString(16)})`);
        return true;
    }

    private async setWindowsPriority(pid: number, priority: CpuPriority): Promise<boolean> {
        // Windows priority classes
        const priorityMap: Record<CpuPriority, string> = {
            'normal': 'Normal',
            'high': 'High',
            'realtime': 'RealTime'
        };

        const className = priorityMap[priority];
        const cmd = `powershell -Command "(Get-Process -Id ${pid}).PriorityClass = '${className}'"`;
        await execAsync(cmd);
        logger.info(`[ProcessLimiter] Set Windows priority for PID ${pid}: ${className}`);
        return true;
    }

    // ─── Linux Implementation ─────────────────────────────

    private async setLinuxAffinity(pid: number, cores: number[]): Promise<boolean> {
        // Build taskset mask
        let mask = 0;
        for (const core of cores) {
            mask |= (1 << core);
        }

        await execAsync(`taskset -p 0x${mask.toString(16)} ${pid}`);
        logger.info(`[ProcessLimiter] Set Linux affinity for PID ${pid}: cores [${cores.join(',')}]`);

        // Also set for all child processes (JVM threads)
        try {
            await execAsync(`taskset -a -p 0x${mask.toString(16)} ${pid}`);
        } catch {
            // -a flag is not supported on all versions
        }
        return true;
    }

    private async setLinuxPriority(pid: number, priority: CpuPriority): Promise<boolean> {
        const niceMap: Record<CpuPriority, number> = {
            'normal': 0,
            'high': -10,
            'realtime': -20
        };

        const niceLevel = niceMap[priority];
        await execAsync(`renice ${niceLevel} -p ${pid}`);
        logger.info(`[ProcessLimiter] Set Linux nice for PID ${pid}: ${niceLevel}`);
        return true;
    }
}

export const processLimiter = new ProcessLimiterService();
