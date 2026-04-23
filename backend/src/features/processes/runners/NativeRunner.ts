import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { IServerRunner, RunnerStats } from './IServerRunner';
import si from 'systeminformation';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import treeKill from 'tree-kill';
import { backupService } from '../../backups/BackupService';
import { logger } from '../../../utils/logger';

const execAsync = util.promisify(exec);

import { javaManager } from '../../processes/JavaManager';

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
    private static serverResourceMap: Map<number, { cpu: number, memory: number, targetPid: number, commandLine: string }> = new Map();
    private static lastGlobalScan = 0;
    private static scanPromise: Promise<void> | null = null;

    private async updateGlobalProcessCache(): Promise<void> {
        const now = Date.now();
        if (now - NativeRunner.lastGlobalScan < 1000 && NativeRunner.lastGlobalScan !== 0) return;
        if (NativeRunner.scanPromise) return NativeRunner.scanPromise;

        NativeRunner.scanPromise = (async () => {
            try {
                const isWindows = process.platform === 'win32';
                const newList: any[] = [];
                const newIndex = new Map<number, any>();
                const parentChildMap = new Map<number, number[]>();

                // 1. Fetch Process Inventory
                if (isWindows) {
                    try {
                        const { stdout } = await execAsync('powershell -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,WorkingSetSize,Caption | ConvertTo-Csv -NoTypeInformation"');
                        const lines = stdout.split('\n');
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || trimmed.startsWith('"ProcessId"')) continue;
                            
                            const parts = trimmed.split(',');
                            if (parts.length < 5) continue;

                            const pid = parseInt(parts[0].replace(/"/g, ''));
                            const ppid = parseInt(parts[1].replace(/"/g, ''));
                            const mem = parseInt(parts[3].replace(/"/g, '')) || 0;
                            const name = parts[4].replace(/"/g, '');
                            const cmd = parts.slice(2, parts.length - 2).join(',').replace(/^"|"$/g, '').replace(/""/g, '"').trim();
                            
                            if (!isNaN(pid)) {
                                const p = { 
                                    pid, 
                                    parentPid: ppid, 
                                    command: cmd || name,
                                    params: '',
                                    cpu: 0, 
                                    memRss: Math.floor(mem / 1024) 
                                };
                                newList.push(p);
                                newIndex.set(pid, p);
                            }
                        }

                        const siStats = await si.processes();
                        for (const sip of siStats.list) {
                            const p = newIndex.get(sip.pid);
                            if (p) p.cpu = sip.cpu;
                        }
                    } catch (e) {
                         logger.error(`[NativeRunner] PowerShell Tree Inventory failed: ${e}`);
                         const siStats = await si.processes();
                         newList.push(...siStats.list);
                    }
                } else {
                    const procs = await si.processes();
                    newList.push(...procs.list);
                }

                for (const p of newList) {
                    if (!newIndex.has(p.pid)) newIndex.set(p.pid, p);
                    if (!parentChildMap.has(p.parentPid)) parentChildMap.set(p.parentPid, []);
                    parentChildMap.get(p.parentPid)!.push(p.pid);
                }

                const newResourceMap = new Map<number, { cpu: number, memory: number, targetPid: number, commandLine: string }>();
                const memo = new Map<number, { cpu: number, memory: number, targetPid: number, commandLine: string }>();
                const inProgress = new Set<number>();

                const getAggregate = (pid: number): { cpu: number, memory: number, targetPid: number, commandLine: string } => {
                    if (memo.has(pid)) return memo.get(pid)!;
                    if (inProgress.has(pid)) return { cpu: 0, memory: 0, targetPid: pid, commandLine: '' };

                    inProgress.add(pid);

                    const p = newIndex.get(pid);
                    if (!p) return { cpu: 0, memory: 0, targetPid: pid, commandLine: '' };

                    let baseCpu = typeof p.cpu === 'number' ? p.cpu : (parseFloat(p.cpu) || 0);
                    let baseMem = typeof p.memRss === 'number' ? p.memRss : (parseFloat(p.memRss) || 0);

                    let totalCpu = baseCpu;
                    let totalMem = baseMem; 
                    let targetPid = p.pid;
                    let targetCommandLine = `${p.command} ${p.params || ''}`.trim();
                    let commandStr = p.command.toLowerCase();
                    let isTargetFound = commandStr.includes('java') || commandStr.includes('bedrock_server') || commandStr.includes('node');

                    const children = parentChildMap.get(pid) || [];
                    for (const cId of children) {
                        const childAgg = getAggregate(cId);
                        totalCpu += childAgg.cpu;
                        totalMem += (childAgg.memory * 1024);
                        
                        if (!isTargetFound && childAgg.commandLine !== '') {
                            targetPid = childAgg.targetPid;
                            targetCommandLine = childAgg.commandLine;
                            isTargetFound = true;
                        }
                    }

                    const result = { 
                        cpu: Math.max(0, totalCpu), 
                        memory: Math.max(0, totalMem / 1024), 
                        targetPid, 
                        commandLine: targetCommandLine 
                    };
                    inProgress.delete(pid);
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
            } catch (err) {
                logger.error(`[NativeRunner] Global background scan failing: ${err}`);
            } finally {
                NativeRunner.scanPromise = null;
            }
        })();

        return NativeRunner.scanPromise;
    }

    private async fixPermissions(cwd: string) {
        if (process.platform === 'win32') {
            return new Promise<void>((resolve) => {
                // v1.14.2: Use spawn for security (array-based arguments bypass the shell)
                const proc = spawn('icacls', [cwd, '/grant', '%USERNAME%:F', '/T', '/C', '/Q'], { shell: false });
                proc.on('close', () => resolve());
                proc.on('error', () => resolve()); // Non-fatal
            });
        }
    }

    // Environment whitelist: only pass safe variables to spawned server processes
    // This prevents secrets like JWT_SECRET from leaking to child processes
    private static SAFE_ENV_KEYS = new Set([
        'PATH', 'JAVA_HOME', 'SERVER_PORT', 'JAVA_VERSION',
        'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'APPDATA',
        'SystemRoot', 'SYSTEMROOT', 'windir',
        'LANG', 'LC_ALL', 'TERM',
        'PROGRAMFILES', 'PROGRAMFILES(X86)', 'COMMONPROGRAMFILES',
        'PATHEXT', 'COMSPEC', 'OS', 'PROCESSOR_ARCHITECTURE',
        'APPDATA', 'LOCALAPPDATA'
    ]);

    private buildSafeEnv(env: NodeJS.ProcessEnv, runtimeEnv: any = {}): NodeJS.ProcessEnv {
        const safe: NodeJS.ProcessEnv = {};
        // Copy only safe keys from host environment
        for (const key of NativeRunner.SAFE_ENV_KEYS) {
            if (process.env[key]) safe[key] = process.env[key];
        }
        // Merge caller-provided env (these are server-specific like SERVER_PORT)
        for (const [key, value] of Object.entries(env)) {
            safe[key] = value;
        }
        // Merge runtime overrides (JAVA_HOME, isolated PATH)
        for (const [key, value] of Object.entries(runtimeEnv)) {
            safe[key] = value as string;
        }
        return safe;
    }

    private parseCommand(cmd: string): { executable: string; args: string[] } {
        const parts: string[] = [];
        const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
        let match;
        while ((match = regex.exec(cmd)) !== null) {
            parts.push(match[1] || match[2] || match[3]);
        }
        
        if (parts.length === 0) return { executable: '', args: [] };
        const executable = parts[0];
        const args = parts.slice(1);
        return { executable, args };
    }

    async start(id: string, runCommand: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
        if (this.processes.has(id)) throw new Error(`Process for ${id} already running.`);
        await this.fixPermissions(cwd);
        
        // --- PROCESS TAGGING (v1.12.11: Support quoted paths) ---
        const { executable, args: originalArgs } = this.parseCommand(runCommand);
        let finalArgs = [...originalArgs];
        const exeLower = executable.toLowerCase();
        
        // --- PROCESS TAGGING (v1.12.11: Support orphan recovery) ---
        if (exeLower.includes('java')) {
            finalArgs.unshift(`-Dcraftcommand.id=${id}`);
        } else if (exeLower.includes('node')) {
             finalArgs.unshift(`--title=craftcommand-${id}`);
        }

        // --- RUNTIME PROVISIONING (v1.14.0: Zero-Config Java) ---
        let runtimeEnv = {};
        let finalExecutable = executable;

        if (exeLower === 'java' || exeLower === 'java.exe' || exeLower.endsWith('/java')) {
            const requestedVersion = env.JAVA_VERSION || '17';
            try {
                // v1.14.0: Use central JavaManager for status reporting and isolation
                const result = await javaManager.ensureJava(requestedVersion, id);
                runtimeEnv = result.env;
                finalExecutable = result.path;
            } catch (err) {
                logger.warn(`[NativeRunner:${id}] Runtime provisioner failed. Falling back to system Java.`);
            }
        }

        // --- HARDWARE THROTTLING (Windows Job Objects / Linux Cgroups) ---
        // Detached: env.CC_DETACHED determines if the process survives panel restart
        const isDetached = env.CC_DETACHED !== 'false';
        const options: any = { 
            cwd, 
            shell: false, 
            detached: isDetached, 
            windowsHide: true, 
            stdio: ['pipe', 'pipe', 'pipe'], 
            env: this.buildSafeEnv(env, runtimeEnv) 
        };
        
        const child = spawn(finalExecutable, finalArgs, options);
        
        // If detached, we must unref it to let the parent exit independently
        if (isDetached) child.unref();
        
        this.processes.set(id, child);
        
        logger.info(`[NativeRunner:${id}] Process spawned. Executable: ${executable}...`);

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

    /**
     * Re-attaches to existing processes after a backend restart.
     * Uses heuristic tagging to find orphans.
     */
    async sync(): Promise<void> {
        logger.info('[NativeRunner] Running process synchronization...');
        await this.updateGlobalProcessCache();

        const { getServers } = require('../../servers/ServerService');
        const servers = getServers();

        for (const server of servers) {
            if (this.processes.has(server.id)) continue;

            // Search for tagged process
            for (const [pid, agg] of NativeRunner.serverResourceMap.entries()) {
                const cmd = agg.commandLine.toLowerCase();
                const identifiesAsThisServer = 
                    cmd.includes(`-dcraftcommand.id=${server.id.toLowerCase()}`) || 
                    cmd.includes(`--title=craftcommand-${server.id.toLowerCase()}`);

                if (identifiesAsThisServer) {
                    logger.info(`[NativeRunner:${server.id}] Recovery: Found orphaned process (PID: ${pid}). Re-binding...`);
                    
                    // Artificial "ghost" child process to satisfy the state map
                    // We can't get real stdout/stderr pipes back, so management will rely on logs and RCON
                    const ghostChild = { 
                        pid, 
                        kill: (sig: any) => treeKill(pid, sig || 'SIGKILL'),
                        stdin: { write: () => false }, // Stdin is lost forever on restart
                        stdout: { on: () => {} },
                        stderr: { on: () => {} },
                        on: () => {} 
                    } as any;

                    this.processes.set(server.id, ghostChild);
                    this.emit('recovered', { id: server.id, pid });
                    break;
                }
            }
        }
    }

    async stop(id: string, force: boolean = false): Promise<void> {
        const child = this.processes.get(id);
        if (!child || !child.pid) return;

        if (force) {
            logger.info(`[NativeRunner:${id}] Force-killing process tree (PID: ${child.pid})...`);
            treeKill(child.pid, 'SIGKILL', () => {});
            this.processes.delete(id);
        } else {
            logger.info(`[NativeRunner:${id}] Requesting graceful stop...`);
            // v2.0: Use sendCommand to leverage RCON fallback if stdin is dead
            await this.sendCommand(id, "stop");
            
            // Still set a safety timeout for forced kill if it ignores the stop command
            setTimeout(() => { 
                if (this.processes.has(id)) {
                    logger.warn(`[NativeRunner:${id}] Graceful stop timed out after 15s. Escalating to SIGKILL.`);
                    this.stop(id, true); 
                }
            }, 15000);
        }
    }

    async kill(id: string, signal: NodeJS.Signals = 'SIGKILL'): Promise<void> {
        const proc = this.processes.get(id);
        if (proc) proc.kill(signal);
    }

    async sendCommand(id: string, command: string): Promise<void> {
        const proc = this.processes.get(id);
        if (!proc) return;

        // If stdin is writable (Managed Process), use it directly
        if (proc.stdin && (proc.stdin as any).writable !== false) {
             proc.stdin.write(command + "\n");
             return;
        }

        // --- RCON FALLBACK (v2.0) ---
        // If stdin is dead (Ghost), we must use RCON to control the process.
        try {
            const { getServer } = require('../../servers/ServerService');
            const server = getServer(id);
            if (!server || server.software === 'Bedrock') return;

            const propsPath = path.join(server.workingDirectory, 'server.properties');
            if (await fs.pathExists(propsPath)) {
                const props = await require('../../../utils/ConfigReader').ConfigReader.readProperties(propsPath);
                
                const rconEnabled = props['enable-rcon'] === 'true';
                const rconPort = parseInt(props['rcon.port'] || '25575');
                const rconPass = props['rcon.password'];

                if (rconEnabled && rconPass) {
                    const { RconService } = require('../../../utils/RconService');
                    await RconService.sendCommand('127.0.0.1', rconPort, rconPass, command);
                    logger.debug(`[NativeRunner:${id}] Command sent via RCON fallback.`);
                } else {
                    logger.warn(`[NativeRunner:${id}] Stdin is dead and RCON is not configured. Command lost.`);
                }
            }
        } catch (e) {
            logger.error(`[NativeRunner:${id}] RCON fallback failed: ${e}`);
        }
    }

    async getStats(id: string): Promise<RunnerStats> {
        const child = this.processes.get(id);
        const managedPid = child?.pid;

        try {
            await this.updateGlobalProcessCache();
            let aggregate = managedPid ? NativeRunner.serverResourceMap.get(managedPid) : null;
            
            // --- HEURISTIC FALLBACK (v1.12.8) ---
            if (!aggregate || (aggregate.cpu === 0 && aggregate.memory === 0)) {
                // Search the entire process list for a match
                for (const [pid, agg] of NativeRunner.serverResourceMap.entries()) {
                    // We check if the command line contains the server ID (usually in the path)
                    // and it's a main process type.
                    const cmd = agg.commandLine.toLowerCase();
                    const isCandidate = cmd.includes('java') || cmd.includes('bedrock_server') || cmd.includes('node');
                    
                    // We check for the server ID in the command line (heuristic)
                    if (isCandidate && cmd.includes(id.toLowerCase())) {
                        aggregate = agg;
                        break;
                    }
                }
            }

            if (aggregate) {
                return {
                    cpu: aggregate.cpu,
                    memory: aggregate.memory,
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
