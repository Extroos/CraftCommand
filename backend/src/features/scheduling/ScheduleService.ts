import { scheduleRepository } from '../../storage/ScheduleRepository';
import { processManager } from '../processes/ProcessManager';
import { backupService } from '../backups/BackupService';
import { startServer } from '../servers/ServerService';
import { auditService } from '../system/AuditService';
import { logger } from '../../utils/logger';

import { EventEmitter } from 'events';
import {  ScheduleTask  } from '@shared/types';

// --- Full 5-field Cron Parser ---
// Supports: *, */N, N, N-M, N,M,O, and named days (SUN-SAT) / months (JAN-DEC)

const DAY_NAMES: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
const MONTH_NAMES: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

function resolveNamedValue(token: string, names: Record<string, number>): string {
    const upper = token.toUpperCase();
    return names[upper] !== undefined ? String(names[upper]) : token;
}

function matchesCronField(value: number, field: string, names: Record<string, number> = {}): boolean {
    // Handle comma-separated list: "1,5,10"
    const parts = field.split(',');
    for (const part of parts) {
        const resolved = resolveNamedValue(part.trim(), names);

        // Wildcard
        if (resolved === '*') return true;

        // Step: */N or N-M/S
        if (resolved.includes('/')) {
            const [rangeStr, stepStr] = resolved.split('/');
            const step = parseInt(stepStr, 10);
            if (isNaN(step) || step <= 0) continue;

            if (rangeStr === '*') {
                if (value % step === 0) return true;
            } else if (rangeStr.includes('-')) {
                const [start, end] = rangeStr.split('-').map(Number);
                if (value >= start && value <= end && (value - start) % step === 0) return true;
            }
            continue;
        }

        // Range: N-M
        if (resolved.includes('-')) {
            const [start, end] = resolved.split('-').map(s => {
                const named = resolveNamedValue(s.trim(), names);
                return parseInt(named, 10);
            });
            if (value >= start && value <= end) return true;
            continue;
        }

        // Exact value
        if (parseInt(resolved, 10) === value) return true;
    }

    return false;
}

function isDue(cron: string, now: Date): boolean {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return false;

    const [minField, hourField, domField, monthField, dowField] = parts;

    const minute = now.getMinutes();
    const hour = now.getHours();
    const dayOfMonth = now.getDate();
    const month = now.getMonth() + 1; // JS months are 0-indexed
    const dayOfWeek = now.getDay(); // 0 = Sunday

    return (
        matchesCronField(minute, minField) &&
        matchesCronField(hour, hourField) &&
        matchesCronField(dayOfMonth, domField) &&
        matchesCronField(month, monthField, MONTH_NAMES) &&
        matchesCronField(dayOfWeek, dowField, DAY_NAMES)
    );
}

// --- Next Run Calculator ---
// Brute-force scans future minutes to find the next match (capped at 7 days)

function calculateNextRun(cron: string): string {
    try {
        const now = new Date();
        const candidate = new Date(now);
        candidate.setSeconds(0, 0);
        candidate.setMinutes(candidate.getMinutes() + 1); // Start from next minute

        const maxIterations = 7 * 24 * 60; // 7 days of minutes
        for (let i = 0; i < maxIterations; i++) {
            if (isDue(cron, candidate)) {
                return candidate.toISOString();
            }
            candidate.setMinutes(candidate.getMinutes() + 1);
        }
        return 'No match within 7 days';
    } catch {
        return 'Invalid cron';
    }
}

// --- Human-Readable Cron Description ---

function describeCron(cron: string): string {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return 'Invalid';

    const [min, hour, dom, month, dow] = parts;

    if (cron === '* * * * *') return 'Every minute';
    if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
        return `Every ${min.substring(2)} minutes`;
    }
    if (min === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') return 'Every hour';
    if (min === '0' && hour === '0' && dom === '*' && month === '*' && dow === '*') return 'Daily at midnight';
    if (min === '0' && hour !== '*' && dom === '*' && month === '*' && dow === '*') return `Daily at ${hour}:00`;
    if (dow !== '*' && dom === '*' && month === '*') {
        const dayName = Object.entries(DAY_NAMES).find(([, v]) => String(v) === dow)?.[0] || dow;
        const timeStr = hour !== '*' ? ` at ${hour}:${min.padStart(2, '0')}` : '';
        return `Every ${dayName}${timeStr}`;
    }
    return `Cron: ${cron}`;
}

export class ScheduleService extends EventEmitter {
    private timer: NodeJS.Timeout | null = null;
    private tasks: Map<string, ScheduleTask[]> = new Map();

    constructor() {
        super();
        this.preloadAllSchedules();
        this.startScheduler();
    }

    // Pre-load ALL schedules from repository on boot so we never miss a first-minute run
    private async preloadAllSchedules() {
        try {
            const allTasks = await scheduleRepository.getAllSchedules();
            for (const task of allTasks) {
                const serverId = task.serverId;
                if (!this.tasks.has(serverId)) {
                    this.tasks.set(serverId, []);
                }
                this.tasks.get(serverId)!.push(task);
            }
            const serverCount = this.tasks.size;
            const taskCount = allTasks.length;
            if (taskCount > 0) {
                logger.info(`[ScheduleService] Pre-loaded ${taskCount} tasks across ${serverCount} servers.`);
            }
        } catch (e) {
            logger.error(`[ScheduleService] Failed to preload schedules: ${e}`);
        }
    }

    private startScheduler() {
        logger.info('[ScheduleService] Scheduler started (full 5-field cron).');
        // Check every minute
        this.timer = setInterval(() => this.checkSchedules(), 60 * 1000);
    }

    private async checkSchedules() {
        const now = new Date();
        
        for (const [serverId, tasks] of this.tasks.entries()) {
            for (const task of tasks) {
                if (!task.isActive) continue;

                // One-time task: check if runAt date has passed
                if (task.runOnce && task.runAt) {
                    const runAt = new Date(task.runAt);
                    if (now >= runAt && (!task.lastRun || new Date(task.lastRun as string) < runAt)) {
                        logger.info(`[ScheduleService] Executing one-time task "${task.name}" for server ${serverId}`);
                        await this.executeTask(serverId, task);
                        task.lastRun = now.toISOString();
                        task.isActive = false; // Auto-disable after one-time execution
                        this.saveSchedules(serverId, tasks);
                        continue;
                    }
                }

                // Standard cron task
                if (isDue(task.cron, now)) {
                    logger.info(`[ScheduleService] Executing task "${task.name}" for server ${serverId}`);
                    await this.executeTask(serverId, task);
                    
                    // Update last run and next run
                    task.lastRun = now.toISOString();
                    task.nextRun = calculateNextRun(task.cron);
                    this.saveSchedules(serverId, tasks);
                }
            }
        }
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
            const actions = task.actions && task.actions.length > 0 
                ? task.actions 
                : [{ type: (task.command === 'backup' || task.command === 'restart') ? task.command : 'command', command: task.command } as any];

            logger.info(`[ScheduleService] Executing ${actions.length} actions for task "${task.name}"`);

            for (const action of actions) {
                await this.executeSingleAction(serverId, task.name, action);
            }
        } catch (e: any) {
            logger.error(`[ScheduleService] Task "${task.name}" failed: ${e}`);
            await this.logExecution(serverId, task.name, false, e.message || "Execution failed");
        }
    }

    private async executeSingleAction(serverId: string, taskName: string, action: any) {
        const type = action.type;
        const command = action.command;

        try {
            if (type === 'backup') {
                const { getServer } = require('../servers/ServerService');
                const server = getServer(serverId);
                const worldOnly = server?.backupConfig?.worldOnly ?? false;
                
                await backupService.createBackup(
                    await this.getServerDir(serverId), 
                    serverId, 
                    `Scheduled: ${taskName}`,
                    worldOnly
                );
                await this.logExecution(serverId, taskName, true, `Backup created (${worldOnly ? "world" : "full"})`);

                // Hardening - Log to System Audit Trail
                await auditService.log(
                    'SYSTEM',
                    'BACKUP_CREATE',
                    serverId,
                    { taskName, automated: true, scope: worldOnly ? 'world' : 'full' },
                    '127.0.0.1',
                    'system@craftcommand.internal'
                );
            } else if (type === 'restart') {
                processManager.stopServer(serverId);
                await this.logExecution(serverId, taskName, true, "Restart: Stop initiated");
                
                // Wait for graceful shutdown (max 30s)
                let attempts = 0;
                while (processManager.isRunning(serverId) && attempts < 30) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    attempts++;
                }

                try {
                    await startServer(serverId);
                    await this.logExecution(serverId, taskName, true, "Restart: Server started");

                    // Phase 8: Hardening - Log to System Audit Trail
                    await auditService.log(
                        'SYSTEM',
                        'SERVER_RESTART',
                        serverId,
                        { taskName, automated: true },
                        '127.0.0.1',
                        'system@craftcommand.internal'
                    );
                } catch (e: any) {
                    throw new Error(`Restart start failed: ${e.message}`);
                }
            } else if (type === 'start') {
                await startServer(serverId);
                await this.logExecution(serverId, taskName, true, "Server started");
            } else if (type === 'stop') {
                processManager.stopServer(serverId);
                await this.logExecution(serverId, taskName, true, "Server stop initiated");
            } else {
                // Console Command
                if (processManager.isRunning(serverId)) {
                    await processManager.sendCommand(serverId, command);
                    await this.logExecution(serverId, taskName, true, `Executed command: ${command}`);
                } else {
                    throw new Error("Cannot send command: Server not running");
                }
            }
        } catch (e: any) {
            throw e; // Bubble up to executeTask for final logging
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
        
        // Recalculate next run for all tasks before returning
        const tasks = this.tasks.get(serverId) || [];
        for (const task of tasks) {
            if (task.isActive && task.cron) {
                task.nextRun = calculateNextRun(task.cron);
            }
        }
        
        return tasks;
    }

    async getHistory(serverId: string): Promise<any[]> {
        return scheduleRepository.getHistory(serverId);
    }

    async addTask(serverId: string, task: ScheduleTask): Promise<void> {
        // Compute next run on creation
        task.nextRun = task.runOnce && task.runAt ? task.runAt : calculateNextRun(task.cron);
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
             // Recompute next run if cron changed
             task.nextRun = task.runOnce && task.runAt ? task.runAt : calculateNextRun(task.cron);
             tasks[idx] = task;
             await this.saveSchedules(serverId, tasks);
         }
    }

    // Utility for frontend: describe a cron expression in human-readable form
    describeCron(cron: string): string {
        return describeCron(cron);
    }

    // Manual trigger: execute a task immediately on demand
    async runTaskNow(serverId: string, taskId: string): Promise<void> {
        const tasks = await this.getSchedules(serverId);
        const task = tasks.find(t => t.id === taskId);
        if (!task) throw new Error('Schedule task not found');

        logger.info(`[ScheduleService] Manual trigger: "${task.name}" for server ${serverId}`);
        await this.executeTask(serverId, task);
        task.lastRun = new Date().toISOString();
        await this.saveSchedules(serverId, tasks);
    }

    private async saveSchedules(serverId: string, tasks: ScheduleTask[]) {
        this.tasks.set(serverId, tasks);
        await scheduleRepository.saveSchedules(serverId, tasks);
    }
}

export const scheduleService = new ScheduleService();
