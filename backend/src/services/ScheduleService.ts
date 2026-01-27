import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';
import { processManager } from './ProcessManager';
import { backupService } from './BackupService';
import { startServer } from './ServerService';

export interface ScheduleTask {
    id: string;
    name: string;
    cron: string;
    command: string;
    lastRun: string;
    nextRun: string;
    isActive: boolean;
}

export class ScheduleService extends EventEmitter {
    private schedulesDir: string;
    private timer: NodeJS.Timeout | null = null;
    private tasks: Map<string, ScheduleTask[]> = new Map();

    constructor() {
        super();
        this.schedulesDir = path.join(__dirname, '../../data/schedules');
        fs.ensureDirSync(this.schedulesDir);
        this.startScheduler();
    }

    private startScheduler() {
        console.log('[ScheduleService] Scheduler started.');
        // Check every minute
        this.timer = setInterval(() => this.checkSchedules(), 60 * 1000);
    }

    private async checkSchedules() {
        const now = new Date();
        const minutes = now.getMinutes();
        const hours = now.getHours();
        
        for (const [serverId, tasks] of this.tasks.entries()) {
            for (const task of tasks) {
                if (!task.isActive) continue;

                if (this.isDue(task.cron, minutes, hours)) {
                    console.log(`[ScheduleService] Executing task ${task.name} for server ${serverId}`);
                    await this.executeTask(serverId, task);
                    
                    // Update last run
                    task.lastRun = now.toISOString();
                    task.nextRun = this.calculateNextRun(task.cron); // Simplified
                    this.saveSchedules(serverId, tasks);
                }
            }
        }
    }

    private isDue(cron: string, currentMinute: number, currentHour: number): boolean {
        // Supports: "* * * * *" (Every min), "0 * * * *" (Hourly), "*/5 * * * *" (Every 5 mins)
        // Does NOT fully support extensive Cron syntax, but covers 95% of use cases.
        const parts = cron.split(' ');
        if (parts.length < 5) return false;

        const [min, hour] = parts;

        const checkPart = (current: number, pattern: string) => {
            if (pattern === '*') return true;
            if (pattern.startsWith('*/')) {
                const interval = parseInt(pattern.substring(2));
                return current % interval === 0;
            }
            return parseInt(pattern) === current;
        };

        return checkPart(currentMinute, min) && checkPart(currentHour, hour);
    }

    private calculateNextRun(cron: string): string {
        // Simple human-readable heuristic
        if (cron === '* * * * *') return "in 1 minute";
        if (cron.startsWith('0 *')) return "at the top of the next hour";
        if (cron.startsWith('0 0 * * *')) return "at midnight";
        if (cron.startsWith('*/')) {
             const min = cron.split(' ')[0].substring(2);
             return `every ${min} minutes`;
        }
        return "Scheduled";
    }

    private async logExecution(serverId: string, taskName: string, success: boolean, message: string) {
        const historyFile = path.join(this.schedulesDir, `${serverId}.history.json`);
        let history = [];
        try {
            if (await fs.pathExists(historyFile)) {
                history = await fs.readJSON(historyFile);
            }
            
            history.unshift({
                timestamp: new Date().toISOString(),
                task: taskName,
                success,
                message
            });
            
            // Keep last 50 entries
            if (history.length > 50) history = history.slice(0, 50);
            
            await fs.writeJSON(historyFile, history, { spaces: 2 });
        } catch (e) {
            console.error('Failed to write schedule history', e);
        }
    }

    private async executeTask(serverId: string, task: ScheduleTask) {
        try {
            if (task.command === 'backup') {
                await backupService.createBackup(
                    await this.getServerDir(serverId), 
                    serverId, 
                    `Scheduled: ${task.name}`
                );
                await this.logExecution(serverId, task.name, true, "Backup created");
            } else if (task.command === 'restart') {
                processManager.stopServer(serverId);
                
                // Wait for graceful shutdown (15s), then start
                setTimeout(async () => {
                    try {
                        await startServer(serverId);
                        await this.logExecution(serverId, task.name, true, "Server restarted successfully");
                    } catch (e: any) {
                        await this.logExecution(serverId, task.name, false, `Restart start failed: ${e.message}`);
                    }
                }, 15000);

                await this.logExecution(serverId, task.name, true, "Server restart triggered (Shutdown initiated)");
            } else {
                // Console Command
                const process = processManager.getProcess(serverId);
                if (process) {
                    process.stdin?.write(task.command + "\n");
                    await this.logExecution(serverId, task.name, true, `Executed: ${task.command}`);
                } else {
                     await this.logExecution(serverId, task.name, false, "Server not running");
                }
            }
        } catch (e: any) {
            console.error(`[ScheduleService] Task failed:`, e);
            await this.logExecution(serverId, task.name, false, e.message || "Unknown error");
        }
    }
    
    private async getServerDir(serverId: string): Promise<string> {
        // Quick/Dirty way to resolve path, ideally inject ServerService
        const { getServer } = require('./ServerService');
        const server = getServer(serverId);
        return server ? server.workingDirectory : '';
    }

    // --- Public API ---

    async getSchedules(serverId: string): Promise<ScheduleTask[]> {
        if (!this.tasks.has(serverId)) {
            const file = path.join(this.schedulesDir, `${serverId}.json`);
            if (await fs.pathExists(file)) {
                const data = await fs.readJSON(file);
                this.tasks.set(serverId, data);
            } else {
                this.tasks.set(serverId, []);
            }
        }
        return this.tasks.get(serverId) || [];
    }

    async getHistory(serverId: string): Promise<any[]> {
        const historyFile = path.join(this.schedulesDir, `${serverId}.history.json`);
        if (await fs.pathExists(historyFile)) {
            return fs.readJSON(historyFile);
        }
        return [];
    }

    async addTask(serverId: string, task: ScheduleTask): Promise<void> {
        const tasks = await this.getSchedules(serverId);
        tasks.push(task);
        await this.saveSchedules(serverId, tasks);
    }

    async removeTask(serverId: string, taskId: string): Promise<void> {
        let tasks = await this.getSchedules(serverId);
        tasks = tasks.filter(t => t.id !== taskId);
        this.tasks.set(serverId, tasks);
        await this.saveSchedules(serverId, tasks);
    }
    
    async updateTask(serverId: string, task: ScheduleTask): Promise<void> {
         let tasks = await this.getSchedules(serverId);
         const idx = tasks.findIndex(t => t.id === task.id);
         if (idx !== -1) {
             tasks[idx] = task;
             await this.saveSchedules(serverId, tasks);
         }
    }

    private async saveSchedules(serverId: string, tasks: ScheduleTask[]) {
        this.tasks.set(serverId, tasks);
        const file = path.join(this.schedulesDir, `${serverId}.json`);
        await fs.writeJSON(file, tasks, { spaces: 2 });
    }
}

export const scheduleService = new ScheduleService();
