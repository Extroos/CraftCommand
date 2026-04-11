
import fs from 'fs-extra';
import path from 'path';
import { DATA_PATHS, JAVA_DIR, TEMP_UPLOADS_DIR } from '../../constants';
import si from 'systeminformation';
import { logger } from '../../utils/logger';

class SystemService {

    async getSystemStats() {
        const mem = await si.mem();
        const load = await si.currentLoad();
        return {
            mem: {
                total: mem.total,
                free: mem.available,
                used: mem.active
            },
            cpu: {
                load: load.currentLoad
            }
        };
    }
    
    // Get Cache Stats
    async getCacheStats() {
        // 1. Java Cache
        // 1. Java Cache
        const javaDir = JAVA_DIR;
        
        // 2. Temp Uploads
        const tempDir = TEMP_UPLOADS_DIR;
        
        // 3. Backups (Global? No, per server. Maybe list total backup size?)
        // For now just Cache (Java + Temp)

        const javaSize = await this.getDirSize(javaDir);
        const tempSize = await this.getDirSize(tempDir);

        return {
            java: {
                path: javaDir,
                size: javaSize,
                count: await this.getFileCount(javaDir)
            },
            temp: {
                path: tempDir,
                size: tempSize,
                count: await this.getFileCount(tempDir)
            }
        };
    }

    async clearCache(type: 'java' | 'temp') {
        if (type === 'java') {
             const javaDir = JAVA_DIR;
             if (await fs.pathExists(javaDir)) {
                 logger.info('[System] Clearing Java Cache...');
                 await fs.emptyDir(javaDir);
             }
        } else if (type === 'temp') {
             const tempDir = TEMP_UPLOADS_DIR;
             if (await fs.pathExists(tempDir)) {
                 logger.info('[System] Clearing Temp Uploads...');
                 await fs.emptyDir(tempDir);
             }
        }
    }

    /**
     * v4.0 Silent-Intelligence: Performs automated, background maintenance.
     * Triggered by the Diagnosis Engine when disk exhaustion is predicted.
     */
    async performSilentMaintenance(): Promise<{ freedMB: number }> {
        logger.info('[System] Starting Silent-Maintenance (Predictive Healing)...');
        
        const statsBefore = await this.getCacheStats();
        const initialSize = statsBefore.java.size + statsBefore.temp.size;

        // 1. Clear Temp Uploads (Safe - just user uploads in progress or stale)
        await this.clearCache('temp');

        // 2. Clear Java Cache (Semi-Safe - will trigger re-download on next boot if version missing)
        // We only clear this if temp wasn't enough or if disk is still critical
        await this.clearCache('java');

        const statsAfter = await this.getCacheStats();
        const finalSize = statsAfter.java.size + statsAfter.temp.size;
        
        const freedMB = Math.round((initialSize - finalSize) / 1024 / 1024);
        logger.success(`[System] Silent-Maintenance complete. Freed ${freedMB}MB.`);
        
        return { freedMB };
    }

    private async getDirSize(dir: string): Promise<number> {
        if (!await fs.pathExists(dir)) return 0;
        let size = 0;
        const files = await fs.readdir(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);
            if (stats.isDirectory()) {
                size += await this.getDirSize(filePath);
            } else {
                size += stats.size;
            }
        }
        return size;
    }

    private async getFileCount(dir: string): Promise<number> {
         if (!await fs.pathExists(dir)) return 0;
         const files = await fs.readdir(dir);
         return files.length;
    }
}

export const systemService = new SystemService();
