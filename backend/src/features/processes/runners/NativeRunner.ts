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

/**
 * NativeRunner (Enterprise Scale)
 * Features a Top-Down Process Aggregation map to prevent O(N^2) CPU overhead
 * when monitoring 1000+ separate child processes.
 */
export class NativeRunner extends EventEmitter implements IServerRunner {
    private processes: Map<string, ChildProcess> = new Map();

    // --- GLOBAL PROCESS CACHE (v1.14.0: Top-Down Aggregation) ---
    private static cachedProcessList: any[] = [];
    private static processIndex: Map<number, any> = new Map(); 
    private static serverResourceMap: Map<number, { cpu: number, mem: number, targetPid: number, commandLine: string }> = new Map();
    private static lastGlobalScan = 0;
    private static scanPromise: Promise<void> | null = null;

    private async updateGlobalProcessCache() {
        const now = Date.now();
        if (now - NativeRunner.lastGlobalScan < 1000) return; // Limit to 1Hz
        if (NativeRunner.scanPromise) return NativeRunner.scanPromise;

        NativeRunner.scanPromise = (async () => {
            try {
                const procs = await si.processes();
                const newList = procs.list;
                const newIndex = new Map();
                const parentChildMap = new Map<number, number[]>();

                // 1. Index everything
                for (const p of newList) {
                    newIndex.set(p.pid, p);
                    if (!parentChildMap.has(p.parentPid)) parentChildMap.set(p.parentPid, []);
                    parentChildMap.get(p.parentPid)!.push(p.pid);
                }

                // 2. Pre-calculate Aggregates for ALL nodes (O(N) Post-Order Traversal)
                const newResourceMap = new Map<number, { cpu: number, mem: number, targetPid: number, commandLine: string }>();
                const memo = new Map<number, { cpu: number, mem: number, targetPid: number, commandLine: string }>();

                const getAggregate = (pid: number): { cpu: number, mem: number, targetPid: number, commandLine: string } => {
                    if (memo.has(pid)) return memo.get(pid)!;

                    const p = newIndex.get(pid);
                    if (!p) return { cpu: 0, mem: 0, targetPid: pid, commandLine: '' };

                    let totalCpu = p.cpu;
                    let totalMem = p.memRss;
                    let targetPid = p.pid;
                    let targetCommandLine = `${p.command} ${p.params}`.trim();
                    let isTargetFound = p.command.toLowerCase().includes('java') || p.command.toLowerCase().includes('bedrock_server');

                    const children = parentChildMap.get(pid) || [];
                    for (const cId of children) {
                        const childAgg = getAggregate(cId);
                        totalCpu += childAgg.cpu;
                        totalMem += childAgg.mem * 1024; // Convert back to bytes for consistency in this loop
                        
                        if (!isTargetFound && childAgg.commandLine !== '') {
                            targetPid = childAgg.targetPid;
                            targetCommandLine = childAgg.commandLine;
                            isTargetFound = true;
                        }
                    }

                    const result = { cpu: totalCpu, mem: totalMem / 1024, targetPid, commandLine: targetCommandLine };
                    memo.set(pid, result);
                    return result;
                };

                for (const p of newList) {
                    newResourceMap.set(p.pid, getAggregate(p.pid));
                }

                NativeRunner.cachedProcessList = newList;
                NativeRunner.processIndex = newIndex;
                NativeRunner.serverResourceMap = newResourceMap;
                NativeRunner.lastGlobalScan = Date.now();
            } finally {
                NativeRunner.scanPromise = null;
            }
        })();

        return NativeRunner.scanPromise;
    }

    private async fixPermissions(cwd: string) {
        if (process.platform === 'win32') {
            try {
                await execAsync(`icacls "${cwd}" /grant "%USERNAME%":F /T /C /Q`);
            } catch (e) { /* Ignore */ }
        }
    }

    async start(id: string, runCommand: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
        if (this.processes.has(id)) throw new Error(`Process for ${id} already running.`);
        await this.fixPermissions(cwd);
        const child = spawn(runCommand, { cwd, shell: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
        this.processes.set(id, child);

        let stdoutBuffer = '', stderrBuffer = '';
        child.stdout?.on('data', (data) => {
            stdoutBuffer += data.toString();
            let lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || '';
            for (const line of lines) this.emit('log', { id, line: line.trim(), type: 'stdout' });
        });
        child.stderr?.on('data', (data) => {
            stderrBuffer += data.toString();
            let lines = stderrBuffer.split('\n');
            stderrBuffer = lines.pop() || '';
            for (const line of lines) this.emit('log', { id, line: line.trim(), type: 'stderr' });
        });
        child.on('close', (code) => {
            this.processes.delete(id);
            this.emit('close', { id, code });
        });
    }

    async stop(id: string, force: boolean = false): Promise<void> {
        const child = this.processes.get(id);
        if (child && child.pid) {
            if (force) {
                treeKill(child.pid, 'SIGKILL', () => {});
                this.processes.delete(id);
            } else {
                child.stdin?.write("stop\n");
                setTimeout(() => { if (this.processes.has(id)) this.stop(id, true); }, 15000);
            }
        }
    }

    async kill(id: string, signal: NodeJS.Signals = 'SIGKILL'): Promise<void> {
        const proc = this.processes.get(id);
        if (proc) proc.kill(signal);
    }

    async sendCommand(id: string, command: string): Promise<void> {
        const proc = this.processes.get(id);
        if (proc) proc.stdin?.write(command + "\n");
    }

    async getStats(id: string): Promise<RunnerStats> {
        const child = this.processes.get(id);
        if (!child || !child.pid) return { cpu: 0, memory: 0 };

        try {
            await this.updateGlobalProcessCache();
            const aggregate = NativeRunner.serverResourceMap.get(child.pid);
            if (aggregate) {
                return {
                    cpu: aggregate.cpu,
                    memory: aggregate.mem,
                    pid: aggregate.targetPid,
                    commandLine: aggregate.commandLine
                };
            }
        } catch (e) { /* Ignore */ }
        return { cpu: 0, memory: 0 };
    }

    isRunning(id: string): boolean {
        return this.processes.has(id);
    }

    async createBackup(id: string, serverDir: string, options: any): Promise<any> {
        return backupService.createBackup(serverDir, id, options.description, options.worldOnly);
    }

    async restoreBackup(id: string, serverDir: string, backupId: string, options: any): Promise<void> {
        return backupService.restoreBackup(serverDir, id, backupId, options);
    }
}
