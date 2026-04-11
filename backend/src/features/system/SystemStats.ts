
import si from 'systeminformation';
import fs from 'fs-extra';
import { logger } from '../../utils/logger';

export const getSystemStats = async (targetPath?: string) => {
    try {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        
        let totalMem = mem.total;
        let usedMem = mem.active;
        let freeMem = mem.available;

        // Docker/Container Awareness (v1.12.5)
        // If running in a container, si.mem() might report host memory.
        // We check cgroup limits for more accurate reporting in restricted environments.
        try {
            const limitPath = '/sys/fs/cgroup/memory/memory.limit_in_bytes';
            const usagePath = '/sys/fs/cgroup/memory/memory.usage_in_bytes';
            
            if (await fs.pathExists(limitPath)) {
                const limit = parseInt(await fs.readFile(limitPath, 'utf8'), 10);
                const usage = parseInt(await fs.readFile(usagePath, 'utf8'), 10);
                
                // If limit is a reasonable number (not the default host max)
                if (limit > 0 && limit < 1024 * 1024 * 1024 * 1024) { 
                    totalMem = limit;
                    usedMem = usage;
                    freeMem = limit - usage;
                }
            }
        } catch (cgErr) {
            // Fallback to systeminformation if cgroup fails
        }

        return {
            cpu: Math.round(cpu.currentLoad),
            memory: {
                total: totalMem,
                used: usedMem,
                free: freeMem
            }
        };
    } catch (e) {
        logger.error(`Failed to get system stats: ${e}`);
        return null;
    }
};
