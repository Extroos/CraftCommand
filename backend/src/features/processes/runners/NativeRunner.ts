import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { IServerRunner, RunnerStats } from './IServerRunner';
import si from 'systeminformation';
import fs from 'fs-extra';
import { exec } from 'child_process';
import util from 'util';
import treeKill from 'tree-kill';

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

        child.stdout?.on('data', (data) => this.emit('log', { id, line: data.toString(), type: 'stdout' }));
        child.stderr?.on('data', (data) => this.emit('log', { id, line: data.toString(), type: 'stderr' }));

        child.on('close', (code) => {
            this.processes.delete(id);
            this.emit('close', { id, code });
        });
    }

    async stop(id: string, force: boolean = false): Promise<void> {
        const process = this.processes.get(id);
        if (process && process.pid) {
            if (force) {
                // Use tree-kill to ensure the entire process tree (shell + child) is killed
                treeKill(process.pid, 'SIGKILL', (err) => {
                    if (err) console.error(`[NativeRunner] Failed to force kill ${id}:`, err);
                });
            } else {
                process.stdin?.write("stop\n");
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
    private static lastScanTime: number = 0;
    private static isScanning: boolean = false;

    private async getSystemSnapshot() {
        const now = Date.now();
        // Cache snapshot for 2.5 seconds to cover the 3s loop without overlaps
        if (NativeRunner.sharedSnapshot && (now - NativeRunner.lastScanTime < 2500)) {
            return NativeRunner.sharedSnapshot;
        }

        // Prevent concurrent identical scans
        if (NativeRunner.isScanning) {
            while (NativeRunner.isScanning) {
                await new Promise(r => setTimeout(r, 100));
            }
            return NativeRunner.sharedSnapshot;
        }

        NativeRunner.isScanning = true;
        try {
            NativeRunner.sharedSnapshot = await si.processes();
            NativeRunner.lastScanTime = Date.now();
        } finally {
            NativeRunner.isScanning = false;
        }
        return NativeRunner.sharedSnapshot;
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
}
