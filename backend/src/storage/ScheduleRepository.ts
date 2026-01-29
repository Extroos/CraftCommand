import fs from 'fs-extra';
import path from 'path';
import { ScheduleTask } from '../../../shared/types';

export class ScheduleRepository {
    private schedulesDir: string;

    constructor() {
        this.schedulesDir = path.join(process.cwd(), 'data', 'schedules');
        fs.ensureDirSync(this.schedulesDir);
    }

    public async getSchedules(serverId: string): Promise<ScheduleTask[]> {
        const file = path.join(this.schedulesDir, `${serverId}.json`);
        try {
            if (await fs.pathExists(file)) {
                return await fs.readJSON(file);
            }
        } catch (e) {
            console.error(`[ScheduleRepo] Failed to read schedules for ${serverId}:`, e);
        }
        return [];
    }

    public async saveSchedules(serverId: string, tasks: ScheduleTask[]) {
        const file = path.join(this.schedulesDir, `${serverId}.json`);
        try {
            await fs.writeJSON(file, tasks, { spaces: 2 });
        } catch (e) {
            console.error(`[ScheduleRepo] Failed to save schedules for ${serverId}:`, e);
        }
    }

    public async getHistory(serverId: string): Promise<any[]> {
        const historyFile = path.join(this.schedulesDir, `${serverId}.history.json`);
         try {
            if (await fs.pathExists(historyFile)) {
                return await fs.readJSON(historyFile);
            }
        } catch (e) {
             console.error(`[ScheduleRepo] Failed to read history for ${serverId}:`, e);
        }
        return [];
    }

    public async saveHistory(serverId: string, history: any[]) {
        const historyFile = path.join(this.schedulesDir, `${serverId}.history.json`);
        try {
            await fs.writeJSON(historyFile, history, { spaces: 2 });
        } catch (e) {
            console.error(`[ScheduleRepo] Failed to save history for ${serverId}:`, e);
        }
    }
}

export const scheduleRepository = new ScheduleRepository();
