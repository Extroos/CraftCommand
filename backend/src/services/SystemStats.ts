
import si from 'systeminformation';

export const getSystemStats = async () => {
    try {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        
        return {
            cpu: Math.round(cpu.currentLoad),
            memory: {
                total: mem.total,
                used: mem.active,
                free: mem.available
            }
        };
    } catch (e) {
        console.error('Failed to get system stats', e);
        return null;
    }
};
