import { scheduleRepository } from '../../storage/ScheduleRepository';
import { processManager } from '../servers/ProcessManager';
import { backupService } from '../backups/BackupService';
import { startServer } from '../servers/ServerService';

import { EventEmitter } from 'events';
import { ScheduleTask } from '../../../../shared/types';

export class ScheduleService extends EventEmitter {
    private timer: NodeJS.Timeout | null = null;
    private tasks: Map<string, ScheduleTask[]> = new Map();

    constructor() {
        super();
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
        let history = await scheduleRepository.getHistory(serverId);
        
        history.unshift({
            timestamp: new Date().toISOString(),
            task: taskName,
            success,
            message
        });
        
        // Keep last 50 entries
        if (history.length > 50) history = history.slice(0, 50);
        
        await scheduleRepository.saveHistory(serverId, history);
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
                if (processManager.isRunning(serverId)) {
                    await processManager.sendCommand(serverId, task.command);
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
        const { getServer } = require('../servers/ServerService');
        const server = getServer(serverId);
        return server ? server.workingDirectory : '';
    }

    // --- Public API ---

    async getSchedules(serverId: string): Promise<ScheduleTask[]> {
        if (!this.tasks.has(serverId)) {
            const data = await scheduleRepository.getSchedules(serverId);
            this.tasks.set(serverId, data);
        }
        return this.tasks.get(serverId) || [];
    }

    async getHistory(serverId: string): Promise<any[]> {
        return scheduleRepository.getHistory(serverId);
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
        await scheduleRepository.saveSchedules(serverId, tasks);
    }
}

export const scheduleService = new ScheduleService();
