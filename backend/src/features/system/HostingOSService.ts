
import si from 'systeminformation';
import path from 'path';
import fs from 'fs-extra';
import { getServers } from '../servers/ServerService';
import { logger } from '../../utils/logger';
import { ServerConfig } from '@shared/types';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         HOSTING OS SERVICE                          ║
 * ║  System-level health monitoring for hosting mode    ║
 * ║  Thermal, disk quotas, OS resource tracking         ║
 * ╚══════════════════════════════════════════════════════╝
 */

export interface ThermalStatus {
    cpuTemp: number | null;      // °C, null if unavailable
    isThrottling: boolean;
    warning: 'normal' | 'warm' | 'hot' | 'critical';
    timestamp: number;
}

export interface DiskUsageInfo {
    serverId: string;
    serverName: string;
    sizeBytes: number;
    sizeMB: number;
    fileCount: number;
    worldSizeBytes: number;
    worldSizeMB: number;
}

export interface SystemHealthSnapshot {
    cpu: {
        usage: number;        // %
        cores: number;
        model: string;
        speed: number;        // GHz
    };
    memory: {
        totalGB: number;
        usedGB: number;
        freeGB: number;
        usagePercent: number;
    };
    disk: {
        totalGB: number;
        usedGB: number;
        freeGB: number;
        usagePercent: number;
    };
    thermal: ThermalStatus;
    uptime: number;           // seconds
    os: {
        platform: string;
        distro: string;
        release: string;
        arch: string;
    };
    serverDiskUsage: DiskUsageInfo[];
    totalServerDiskMB: number;
    timestamp: number;
}

class HostingOSService {
    private cachedHealth: SystemHealthSnapshot | null = null;
    private cacheAge: number = 0;
    private static CACHE_TTL = 30_000; // 30s cache

    /**
     * Get a full system health snapshot.
     * Cached for 30s to avoid hammering systeminformation.
     */
    async getHealth(): Promise<SystemHealthSnapshot> {
        const now = Date.now();
        if (this.cachedHealth && (now - this.cacheAge) < HostingOSService.CACHE_TTL) {
            return this.cachedHealth;
        }

        const [load, mem, disk, temp, cpu, osInfo, time] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            this.getThermal(),
            si.cpu(),
            si.osInfo(),
            si.time()
        ]);

        // Aggregate disk across all filesystems (pick primary)
        const primaryDisk = disk.find(d => 
            d.mount === '/' || d.mount === 'C:' || d.mount === 'C:\\'
        ) || disk[0];

        // Per-server disk usage
        const serverDiskUsage = await this.getServerDiskUsage();
        const totalServerDiskMB = serverDiskUsage.reduce((sum, s) => sum + s.sizeMB, 0);

        this.cachedHealth = {
            cpu: {
                usage: Math.round(load.currentLoad * 10) / 10,
                cores: cpu.cores,
                model: `${cpu.manufacturer} ${cpu.brand}`,
                speed: cpu.speed
            },
            memory: {
                totalGB: Math.round(mem.total / 1024 / 1024 / 1024 * 10) / 10,
                usedGB: Math.round(mem.active / 1024 / 1024 / 1024 * 10) / 10,
                freeGB: Math.round(mem.available / 1024 / 1024 / 1024 * 10) / 10,
                usagePercent: Math.round((mem.active / mem.total) * 1000) / 10
            },
            disk: {
                totalGB: primaryDisk ? Math.round(primaryDisk.size / 1024 / 1024 / 1024 * 10) / 10 : 0,
                usedGB: primaryDisk ? Math.round(primaryDisk.used / 1024 / 1024 / 1024 * 10) / 10 : 0,
                freeGB: primaryDisk ? Math.round((primaryDisk.size - primaryDisk.used) / 1024 / 1024 / 1024 * 10) / 10 : 0,
                usagePercent: primaryDisk ? Math.round(primaryDisk.use * 10) / 10 : 0
            },
            thermal: temp,
            uptime: (time as any).uptime || 0,
            os: {
                platform: osInfo.platform,
                distro: osInfo.distro,
                release: osInfo.release,
                arch: osInfo.arch
            },
            serverDiskUsage,
            totalServerDiskMB,
            timestamp: now
        };

        this.cacheAge = now;
        return this.cachedHealth;
    }

    /**
     * Get CPU temperature and thermal status.
     * Returns null temp on systems that don't expose thermal data.
     */
    async getThermal(): Promise<ThermalStatus> {
        try {
            const temp = await si.cpuTemperature();
            const cpuTemp = temp.main !== null && temp.main > 0 ? temp.main : null;

            let warning: ThermalStatus['warning'] = 'normal';
            let isThrottling = false;

            if (cpuTemp !== null) {
                if (cpuTemp >= 90) {
                    warning = 'critical';
                    isThrottling = true;
                } else if (cpuTemp >= 80) {
                    warning = 'hot';
                } else if (cpuTemp >= 70) {
                    warning = 'warm';
                }
            }

            return { cpuTemp, isThrottling, warning, timestamp: Date.now() };
        } catch {
            return { cpuTemp: null, isThrottling: false, warning: 'normal', timestamp: Date.now() };
        }
    }

    /**
     * Calculate disk usage per server directory.
     */
    async getServerDiskUsage(): Promise<DiskUsageInfo[]> {
        const servers = getServers();
        const results: DiskUsageInfo[] = [];

        for (const server of servers) {
            if (!server.workingDirectory) continue;

            try {
                const dirPath = server.workingDirectory;
                if (!await fs.pathExists(dirPath)) continue;

                const sizeBytes = await this.getDirSizeRecursive(dirPath);
                const worldSizeBytes = await this.getWorldSize(server);

                results.push({
                    serverId: server.id,
                    serverName: server.name,
                    sizeBytes,
                    sizeMB: Math.round(sizeBytes / 1024 / 1024),
                    fileCount: await this.countFiles(dirPath),
                    worldSizeBytes,
                    worldSizeMB: Math.round(worldSizeBytes / 1024 / 1024)
                });
            } catch (e: any) {
                logger.warn(`[HostingOS] Failed to scan disk for ${server.name}: ${e.message}`);
            }
        }

        // Sort by size descending
        results.sort((a, b) => b.sizeBytes - a.sizeBytes);
        return results;
    }

    /**
     * Get world folder size for a server
     */
    private async getWorldSize(server: ServerConfig): Promise<number> {
        const worldFolders = ['world', 'world_nether', 'world_the_end', 'worlds', 'db'];
        let totalSize = 0;

        for (const folder of worldFolders) {
            const worldPath = path.join(server.workingDirectory, folder);
            if (await fs.pathExists(worldPath)) {
                totalSize += await this.getDirSizeRecursive(worldPath);
            }
        }
        return totalSize;
    }

    /**
     * Recursive directory size calculation
     */
    private async getDirSizeRecursive(dir: string): Promise<number> {
        let size = 0;
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    size += await this.getDirSizeRecursive(fullPath);
                } else {
                    const stats = await fs.stat(fullPath);
                    size += stats.size;
                }
            }
        } catch { /* Permission denied or broken symlink */ }
        return size;
    }

    /**
     * Count files in a directory (non-recursive, fast)
     */
    private async countFiles(dir: string): Promise<number> {
        try {
            const entries = await fs.readdir(dir);
            return entries.length;
        } catch {
            return 0;
        }
    }

    // ─── Disk Quota Enforcement ───────────────────────────

    /**
     * Check all servers against their disk quotas.
     * Returns servers exceeding their quota.
     */
    async checkDiskQuotas(defaultQuotaMB: number = 10_000): Promise<DiskQuotaViolation[]> {
        const diskUsage = await this.getServerDiskUsage();
        const violations: DiskQuotaViolation[] = [];

        for (const usage of diskUsage) {
            const quotaMB = defaultQuotaMB; // Could be per-server in future
            const usagePercent = (usage.sizeMB / quotaMB) * 100;

            if (usagePercent > 80) {
                violations.push({
                    serverId: usage.serverId,
                    serverName: usage.serverName,
                    currentMB: usage.sizeMB,
                    quotaMB,
                    usagePercent: Math.round(usagePercent),
                    worldMB: usage.worldSizeMB,
                    severity: usagePercent > 100 ? 'exceeded' : 'warning',
                    recommendation: this.getQuotaRecommendation(usage, quotaMB)
                });
            }
        }

        return violations;
    }

    /**
     * Generate a recommendation for reducing disk usage.
     */
    private getQuotaRecommendation(usage: DiskUsageInfo, quotaMB: number): string {
        const overageMB = usage.sizeMB - quotaMB;
        const worldPercent = Math.round((usage.worldSizeMB / usage.sizeMB) * 100);

        if (overageMB > 0 && worldPercent > 70) {
            return `World data is ${worldPercent}% of total (${usage.worldSizeMB}MB). Consider trimming world border or pruning old chunks.`;
        } else if (overageMB > 0) {
            return `Server is ${overageMB}MB over quota. Check for excessive logs, old backups, or unused plugins.`;
        }
        return `Approaching quota (${Math.round(usage.sizeMB / quotaMB * 100)}%). Monitor growth.`;
    }

    /**
     * Get servers sorted by disk usage (heaviest first).
     * Useful for UI display and admin alerts.
     */
    async getTopDiskConsumers(limit: number = 5): Promise<DiskUsageInfo[]> {
        const usage = await this.getServerDiskUsage();
        return usage.slice(0, limit);
    }
}

export interface DiskQuotaViolation {
    serverId: string;
    serverName: string;
    currentMB: number;
    quotaMB: number;
    usagePercent: number;
    worldMB: number;
    severity: 'warning' | 'exceeded';
    recommendation: string;
}

export const hostingOSService = new HostingOSService();

