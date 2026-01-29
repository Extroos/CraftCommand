
import fs from 'fs-extra';
import path from 'path';
import { DATA_PATHS, JAVA_DIR, TEMP_UPLOADS_DIR } from '../../constants';
import si from 'systeminformation';

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
             const javaDir = path.join(process.cwd(), 'data', 'java');
             if (await fs.pathExists(javaDir)) {
                 console.log('[System] Clearing Java Cache...');
                 await fs.emptyDir(javaDir);
             }
        } else if (type === 'temp') {
             const tempDir = TEMP_UPLOADS_DIR;
             if (await fs.pathExists(tempDir)) {
                 console.log('[System] Clearing Temp Uploads...');
                 await fs.emptyDir(tempDir);
             }
        }
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
