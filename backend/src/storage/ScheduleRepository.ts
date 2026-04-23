import fs from 'fs-extra';
import path from 'path';
import { ScheduleTask } from '@shared/types';
import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import { logger } from '../utils/logger';

export class ScheduleRepository {
    private scheduleTasks: StorageProvider<ScheduleTask>;
    private historyLogs: StorageProvider<{ id: string, serverId: string, entry: any }>;
    private schedulesDir: string;

    constructor() {
        this.schedulesDir = path.join(process.cwd(), 'data', 'schedules');
        this.scheduleTasks = StorageFactory.get<ScheduleTask>('schedules');
        this.historyLogs = StorageFactory.get<{ id: string, serverId: string, entry: any }>('schedules_history');
        
        this.init();
    }

    private init() {
        this.scheduleTasks.init();
        this.historyLogs.init();
        this.runMigration();
    }

    public async rebind() {
        this.scheduleTasks = StorageFactory.get<ScheduleTask>('schedules');
        this.historyLogs = StorageFactory.get<{ id: string, serverId: string, entry: any }>('schedules_history');
        this.init();
    }

    /**
     * Migration logic: Moves data from per-server JSON files into unified SQLite storage.
     */
    private runMigration() {
        if (!fs.existsSync(this.schedulesDir)) return;

        try {
            const files = fs.readdirSync(this.schedulesDir);
            let migratedCount = 0;

            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                if (file.endsWith('.history.json')) {
                    // Handle history migration
                    const serverId = file.replace('.history.json', '');
                    const history = fs.readJSONSync(path.join(this.schedulesDir, file));
                    if (Array.isArray(history)) {
                        for (const entry of history) {
                            const id = entry.id || `${serverId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            this.historyLogs.create({ id, serverId, entry });
                        }
                    }
                } else {
                    // Handle schedule task migration
                    const serverId = file.replace('.json', '');
                    const tasks = fs.readJSONSync(path.join(this.schedulesDir, file));
                    if (Array.isArray(tasks)) {
                        for (const task of tasks) {
                            this.scheduleTasks.create({ ...task, serverId });
                        }
                        migratedCount += tasks.length;
                    }
                }
            }

            if (migratedCount > 0) {
                logger.info(`[ScheduleRepo] Migrated ${migratedCount} schedules to unified storage.`);
                // Rename to prevent re-migration
                fs.renameSync(this.schedulesDir, `${this.schedulesDir}.migrated_${Date.now()}`);
            }
        } catch (e) {
            logger.error(`[ScheduleRepo] Migration failed: ${e}`);
        }
    }

    public async getSchedules(serverId: string): Promise<ScheduleTask[]> {
        return this.scheduleTasks.findAll().filter(t => t.serverId === serverId);
    }

    public async getAllSchedules(): Promise<ScheduleTask[]> {
        return this.scheduleTasks.findAll();
    }

    public async saveSchedules(serverId: string, tasks: ScheduleTask[]) {
        // Simple strategy: Clear existing for this server and re-create
        const existing = await this.getSchedules(serverId);
        for (const t of existing) {
            this.scheduleTasks.delete(t.id);
        }

        for (const t of tasks) {
            this.scheduleTasks.create({ ...t, serverId });
        }
    }

    public async getHistory(serverId: string): Promise<any[]> {
        const history = this.historyLogs.findAll().filter(h => h.serverId === serverId);
        return history.map(h => h.entry);
    }

    public async saveHistory(serverId: string, history: any[]) {
        // Capping history is usually a good idea
        const capped = history.slice(-100); // Keep last 100 for storage sanity
        
        // Clear old
        const existing = this.historyLogs.findAll().filter(h => h.serverId === serverId);
        for (const h of existing) {
            this.historyLogs.delete(h.id);
        }

        // Add new
        for (const entry of capped) {
            const id = entry.id || `${serverId}-${Date.now()}-${Math.random()}`;
            this.historyLogs.create({ id, serverId, entry });
        }
    }

    /**
     * Purges all schedules and history for a deleted server.
     */
    public async deleteForServer(serverId: string) {
        logger.info(`[ScheduleRepo] Purging data for server ${serverId}`);
        
        // 1. Delete tasks
        const tasks = this.scheduleTasks.findAll().filter(t => t.serverId === serverId);
        for (const t of tasks) {
            this.scheduleTasks.delete(t.id);
        }

        // 2. Delete history
        const history = this.historyLogs.findAll().filter(h => h.serverId === serverId);
        for (const h of history) {
            this.historyLogs.delete(h.id);
        }
    }

    /**
     * Cleans up migration backup directories older than 24 hours.
     */
    public async pruneMigrationBackups() {
        if (!fs.existsSync(this.schedulesDir)) return;
        
        const parentDir = path.dirname(this.schedulesDir);
        const items = await fs.readdir(parentDir);
        const now = Date.now();
        const TTL = 24 * 60 * 60 * 1000; // 24 hours

        for (const item of items) {
            if (item.includes('.migrated_')) {
                const itemPath = path.join(parentDir, item);
                const stats = await fs.stat(itemPath);
                if (now - stats.mtimeMs > TTL) {
                    logger.info(`[ScheduleRepo] Pruning old migration backup: ${item}`);
                    await fs.remove(itemPath);
                }
            }
        }
    }
}

export const scheduleRepository = new ScheduleRepository();
