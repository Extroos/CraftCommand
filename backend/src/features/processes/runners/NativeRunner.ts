import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { IServerRunner, RunnerStats } from './IServerRunner';
import si from 'systeminformation';
import fs from 'fs-extra';
import { exec } from 'child_process';
import util from 'util';
import treeKill from 'tree-kill';
import { backupService } from '../../backups/BackupService';
import { logger } from '../../../utils/logger';


const execAsync = util.promisify(exec);

export class NativeRunner extends EventEmitter implements IServerRunner {
    private processes: Map<string, ChildProcess> = new Map();

    private async fixPermissions(cwd: string) {
        if (process.platform === 'win32') {
            try {
                // On Windows, use icacls to ensure the current user has full control
                // This is a safety measure if Docker bind mounts created restricted files
                console.log(`[NativeRunner] Normalizing permissions for ${cwd}...`);
                await execAsync(`icacls "${cwd}" /grant "%USERNAME%":F /T /C /Q`);
            } catch (e) {
                console.warn(`[NativeRunner] Permission normalization warning: ${e.message}`);
            }
        }
    }

    async start(id: string, runCommand: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
        if (this.processes.has(id)) {
            throw new Error(`Process for ${id} is already running.`);
        }

        // Before starting Native, ensure permissions are correct (Docker switch recovery)
        await this.fixPermissions(cwd);

        const child = spawn(runCommand, {
            cwd,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...env }
        });

        this.processes.set(id, child);

        let stdoutBuffer = '';
        child.stdout?.on('data', (data) => {
            stdoutBuffer += data.toString();
            let lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || '';
            for (const line of lines) {
                this.emit('log', { id, line: line.replace(/\r$/, ''), type: 'stdout' });
            }
        });

        let stderrBuffer = '';
        child.stderr?.on('data', (data) => {
            stderrBuffer += data.toString();
            let lines = stderrBuffer.split('\n');
            stderrBuffer = lines.pop() || '';
            for (const line of lines) {
                this.emit('log', { id, line: line.replace(/\r$/, ''), type: 'stderr' });
            }
        });

        child.on('close', (code) => {
            if (stdoutBuffer) this.emit('log', { id, line: stdoutBuffer.replace(/\r$/, ''), type: 'stdout' });
            if (stderrBuffer) this.emit('log', { id, line: stderrBuffer.replace(/\r$/, ''), type: 'stderr' });
            
            this.processes.delete(id);
            this.emit('close', { id, code });
        });
    }

    async stop(id: string, force: boolean = false): Promise<void> {
        const child = this.processes.get(id);
        if (child && child.pid) {
            const watchdogPid = child.pid;
            
            if (force) {
                // Use tree-kill to ensure the entire process tree (shell + child) is killed
                treeKill(watchdogPid, 'SIGKILL', (err) => {
                    if (err) logger.error(`[NativeRunner] Failed to force kill ${id}: ${err.message}`);
                });
                this.processes.delete(id);
            } else {
                child.stdin?.write("stop\n");
                
                // Hardening: Escalation Watchdog (v1.12.0)
                // If the server doesn't shut down gracefully within 15s, force kill it.
                setTimeout(() => {
                    const stillRunning = this.processes.get(id);
                    if (stillRunning && stillRunning.pid === watchdogPid) {
                        logger.warn(`[NativeRunner] Server ${id} (PID ${watchdogPid}) failed to stop gracefully in 15s. Escalating to SIGKILL.`);
                        treeKill(watchdogPid, 'SIGKILL', (err) => {
                            if (err) logger.error(`[NativeRunner] Watchdog failed to SIGKILL ${id}: ${err.message}`);
                        });
                        this.processes.delete(id);
                    }
                }, 15000);
            }
        }
    }

    /**
     * Send a specific signal to the process (Advanced Control)
     */
    async kill(id: string, signal: NodeJS.Signals = 'SIGKILL'): Promise<void> {
        const process = this.processes.get(id);
        if (process) {
            process.kill(signal);
        }
    }

    async sendCommand(id: string, command: string): Promise<void> {
        const process = this.processes.get(id);
        if (process) {
            process.stdin?.write(command + "\n");
        }
    }

    private static sharedSnapshot: any = null;
    private static scanPromise: Promise<any> | null = null;
    private static lastScanTime: number = 0;

    private async getSystemSnapshot() {
        const now = Date.now();
        // Cache snapshot for 2.5 seconds to cover the 3s loop without overlaps
        if (NativeRunner.sharedSnapshot && (now - NativeRunner.lastScanTime < 2500)) {
            return NativeRunner.sharedSnapshot;
        }

        // Check if a scan is already in progress
        if (NativeRunner.scanPromise) {
            return NativeRunner.scanPromise;
        }

        // Start a new scan and store the promise
        NativeRunner.scanPromise = (async () => {
            try {
                NativeRunner.sharedSnapshot = await si.processes();
                NativeRunner.lastScanTime = Date.now();
                return NativeRunner.sharedSnapshot;
            } finally {
                NativeRunner.scanPromise = null;
            }
        })();

        return NativeRunner.scanPromise;
    }

    async getStats(id: string): Promise<RunnerStats> {
        const child = this.processes.get(id);
        if (!child || !child.pid) return { cpu: 0, memory: 0 };

        try {
            const shellPid = child.pid;
            const procs = await this.getSystemSnapshot();
            
            // 1. Recursive lookup for all descendants
            const descendants: any[] = [];
            const queue = [shellPid];
            const seen = new Set<number>([shellPid]);

            while (queue.length > 0) {
                const parentId = queue.shift()!;
                const children = procs.list.filter((p: any) => p.parentPid === parentId);
                for (const c of children) {
                    if (!seen.has(c.pid)) {
                        seen.add(c.pid);
                        descendants.push(c);
                        queue.push(c.pid);
                    }
                }
            }
            
            // 2. Identify the workload process (Heuristic)
            let target = procs.list.find((p: any) => p.pid === shellPid);
            
            if (descendants.length > 0) {
                // Priority A: The descendant that looks like a workload process (Java or Bedrock)
                const workloadProc = descendants.find(p => 
                    p.command.toLowerCase().includes('java') || 
                    p.name.toLowerCase().includes('java') ||
                    p.command.toLowerCase().includes('bedrock_server') ||
                    p.name.toLowerCase().includes('bedrock_server') ||
                    (p.params && (p.params.toLowerCase().includes('java') || p.params.toLowerCase().includes('bedrock_server')))
                );
                
                if (workloadProc) {
                    target = workloadProc;
                } else {
                    // Priority B: The one using the most RAM (usually the server)
                    target = descendants.sort((a, b) => b.memRss - a.memRss)[0];
                }
            }

            if (target) {
                return {
                    cpu: target.cpu,
                    memory: target.memRss / 1024, // KB -> MB (memRss is KB on Win/Linux)
                    pid: target.pid,
                    commandLine: `${target.command} ${target.params}`.trim()
                };
            }
        } catch (e) {
            console.error(`[NativeRunner] Failed to get stats for ${id}:`, e);
        }
        return { cpu: 0, memory: 0 };
    }

    isRunning(id: string): boolean {
        return this.processes.has(id);
    }

    async createBackup(id: string, serverDir: string, options: { description?: string, worldOnly?: boolean }): Promise<any> {
        return backupService.createBackup(serverDir, id, options.description, options.worldOnly);
    }

    async restoreBackup(id: string, serverDir: string, backupId: string, options: { scope?: 'full' | 'world' | 'configs' | 'plugins', worldOnly?: boolean }): Promise<void> {
        return backupService.restoreBackup(serverDir, id, backupId, options);
    }
}
