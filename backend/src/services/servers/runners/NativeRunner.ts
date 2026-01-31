import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { IServerRunner, RunnerStats } from './IServerRunner';
import si from 'systeminformation';
import fs from 'fs-extra';
import { exec } from 'child_process';
import util from 'util';

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
        if (process) {
            if (force) {
                process.kill('SIGKILL');
            } else {
                process.stdin?.write("stop\n");
                // The actual removal from the map happens in the 'close' event handler
            }
        }
    }

    async sendCommand(id: string, command: string): Promise<void> {
        const process = this.processes.get(id);
        if (process) {
            process.stdin?.write(command + "\n");
        }
    }

    async getStats(id: string): Promise<RunnerStats> {
        const child = this.processes.get(id);
        if (!child) return { cpu: 0, memory: 0 };

        try {
            // This is a simplified version of the stats logic from ProcessManager
            // We'll refine this later to make it more robust (like finding PID by port)
            const pid = child.pid;
            if (!pid) return { cpu: 0, memory: 0 };

            const procs = await si.processes();
            const target = procs.list.find(p => p.pid === pid);

            if (target) {
                return {
                    cpu: target.cpu,
                    memory: target.memRss / 1024,
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
