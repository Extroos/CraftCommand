import { spawn, exec, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { IServerRunner, RunnerStats } from './IServerRunner';
import util from 'util';
import os from 'os';
import { Writable } from 'stream';
import { backupService } from '../../backups/BackupService';
import { logger } from '../../../utils/logger';

import { javaManager } from '../JavaManager';

const execAsync = util.promisify(exec);

// Shell injection guard: only allow safe characters in Docker identifiers
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const SAFE_IMAGE_REGEX = /^[a-zA-Z0-9._\/:@-]+$/;
const SAFE_PORT_REGEX = /^\d{1,5}(\/(?:tcp|udp))?$/;
const SAFE_SIGNAL_REGEX = /^SIG[A-Z]+$/;

function validateShellArg(value: string, label: string, regex: RegExp): void {
    if (!regex.test(value)) {
        throw new Error(`[DockerRunner] Refused: ${label} contains unsafe characters: "${value.substring(0, 50)}"`);
    }
}

export class DockerRunner extends EventEmitter implements IServerRunner {
    private containers: Map<string, string> = new Map(); // serverId -> containerName/Id
    private stdinStreams: Map<string, Writable> = new Map(); // serverId -> stdin
    private logProcesses: Map<string, ChildProcess> = new Map(); // serverId -> log follow process
    private cpuHistory: Map<string, number> = new Map(); // serverId -> lastCpuValue
    private readonly CPU_CORES = os.cpus().length;
    private readonly SMOOTHING_FACTOR = 0.3; // EMA factor (lower = smoother)
    private isSupported: boolean | null = null;

    private async checkSupport(): Promise<boolean> {
        if (this.isSupported !== null) return this.isSupported;
        try {
            // Fast check for docker daemon availability
            await execAsync('docker version --format "{{.Server.Version}}"');
            this.isSupported = true;
            return true;
        } catch (e) {
            this.isSupported = false;
            return false;
        }
    }

    async start(id: string, runCommand: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
        // Shell Injection Guard: validate ID before using in shell commands
        validateShellArg(id, 'server ID', SAFE_ID_REGEX);
        const containerName = `craftcommand-server-${id}`;
        
        // 1. Verify Docker Daemon is accessible
        if (!await this.checkSupport()) {
            throw new Error('Docker Daemon is unreachable. Please ensure Docker Desktop is running and the engine is started.');
        }

        const image = env.dockerImage || env.DOCKER_IMAGE || javaManager.getDockerImageForJava(env.JAVA_VERSION || '17');
        validateShellArg(image, 'Docker image', SAFE_IMAGE_REGEX);
        logger.info(`[DockerRunner] Pulling image ${image} (if missing)...`);
        this.emit('log', { id, line: `[DockerRunner] Pulling/Verifying image ${image}...`, type: 'stdout' });
        
        try {
            await execAsync(`docker pull ${image}`);
        } catch (e) {
            logger.warn(`[DockerRunner] Pull failed or image local: ${e.message}`);
        }

        logger.info(`[DockerRunner] Starting container ${containerName} for ${id}...`);

        // 2. Ensure previous container and log followers are gone
        try {
            const oldLogProc = this.logProcesses.get(id);
            if (oldLogProc) {
                oldLogProc.kill();
                this.logProcesses.delete(id);
            }
            await execAsync(`docker rm -f ${containerName}`);
        } catch (e: any) { logger.debug(`[DockerRunner] Previous container cleanup (expected on first run): ${e.message}`); }

        // 3. Build Docker Run Command
        const port = env.SERVER_PORT || '25565';
        const ram = env.SERVER_RAM || '2';
        const cpus = env.DOCKER_CPUS || '0.000'; // 0.000 = unlimited
        const ioLimit = env.SERVER_IO_LIMIT || '0'; // 0 = unlimited, in MB/s
        
        // Protocol Detection
        let protocol = '';
        if (env.SERVER_SOFTWARE === 'Bedrock' || runCommand.includes('bedrock_server')) {
            protocol = '/udp';
        }

        let dockerCmd = `docker run --name ${containerName} -v "${cwd}":/data -w /data -p ${port}:${port}${protocol} -i`;
        
        // 4. Resource Isolation (Cgroups)
        dockerCmd += ` --memory ${ram}g`;
        if (parseFloat(cpus.toString()) > 0) {
            dockerCmd += ` --cpus ${cpus}`;
        }

        // 5. IO Throttling (v1.13.0)
        const ioLimitNum = parseInt(ioLimit.toString());
        if (ioLimitNum > 0) {
            if (os.platform() === 'linux') {
                const device = env.DOCKER_IO_DEVICE || '/dev/sda';
                dockerCmd += ` --device-read-bps ${device}:${ioLimitNum}mb --device-write-bps ${device}:${ioLimitNum}mb`;
            } else {
                // Windows/Mac weight-based fallback (10-1000)
                // Map MB/s to a weight. 10MB/s = 100, 100MB/s = 500, etc.
                const weight = Math.min(1000, Math.max(10, ioLimitNum * 10));
                dockerCmd += ` --blkio-weight ${weight}`;
            }
        }

        // 6. Native Health Check
        // Note: For TCP we use nc -z. For UDP (Bedrock), we use nc -zu.
        const healthProtocol = protocol === '/udp' ? '-zu' : '-z';
        dockerCmd += ` --health-cmd "nc ${healthProtocol} localhost ${port} || exit 1" --health-interval 30s --health-retries 3`;

        // 6. Multi-Port Support
        if (env.EXTRA_PORTS) {
            const extra = env.EXTRA_PORTS.split(',');
            for (const p of extra) {
                const trimmed = p.trim();
                if (trimmed && SAFE_PORT_REGEX.test(trimmed)) {
                    dockerCmd += ` -p ${trimmed}:${trimmed}`;
                } else if (trimmed) {
                    logger.warn(`[DockerRunner] Skipping invalid extra port: "${trimmed}"`);
                }
            }
        }

        dockerCmd += ` ${image} ${runCommand}`;

        const child = spawn(dockerCmd, {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.containers.set(id, containerName);
        if (child.stdin) {
            this.stdinStreams.set(id, child.stdin);
        }
        
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

        child.on('error', (err) => {
            logger.error(`[DockerRunner:${id}] Child process error: ${err}`);
            this.emit('close', { id, code: 1, error: err.message });
        });

        child.on('close', (code) => {
            if (stdoutBuffer) this.emit('log', { id, line: stdoutBuffer.replace(/\r$/, ''), type: 'stdout' });
            if (stderrBuffer) this.emit('log', { id, line: stderrBuffer.replace(/\r$/, ''), type: 'stderr' });

            this.containers.delete(id);
            this.stdinStreams.delete(id);
            this.cpuHistory.delete(id);
            this.emit('close', { id, code });
        });
    }
    
    /**
     * Recovery logic: Scan for existing containers that match the CraftCommand pattern
     * and re-register them, including re-attaching log streams.
     */
    async sync(): Promise<void> {
        if (!await this.checkSupport()) {
            logger.info('[DockerRunner] Docker not detected or unreachable. Skipping container sync.');
            return;
        }

        try {
            const { stdout } = await execAsync('docker ps --filter "name=craftcommand-server-" --format "{{.ID}},{{.Names}}"');
            const lines = stdout.split('\n').filter(l => l.trim() !== '');
            
            for (const line of lines) {
                let [containerId, name] = line.split(',');
                name = name.replace(/^\//, '');
                const serverId = name.replace('craftcommand-server-', '');
                
                if (serverId && !this.containers.has(serverId)) {
                    logger.info(`[DockerRunner] Re-mapped existing container ${name} to server ${serverId}`);
                    this.containers.set(serverId, name);
                    this.attachLogFollower(serverId, name);
                }
            }
        } catch (e: any) {
            logger.warn(`[DockerRunner] Unexpected error during sync: ${e.message}`);
        }
    }

    private attachLogFollower(serverId: string, containerName: string) {
        if (this.logProcesses.has(serverId)) return;

        logger.info(`[DockerRunner:${serverId}] Re-attaching log follower for ${containerName}...`);
        const logFollower = spawn(`docker logs --tail 50 --follow ${containerName}`, { shell: true });
        this.logProcesses.set(serverId, logFollower);

        let buffer = '';
        logFollower.stdout.on('data', (data) => {
            buffer += data.toString();
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const l of lines) {
                this.emit('log', { id: serverId, line: l.replace(/\r$/, ''), type: 'stdout' });
            }
        });

        logFollower.on('close', () => {
            this.logProcesses.delete(serverId);
        });
    }

    async stop(id: string, force: boolean = false): Promise<void> {
        const containerName = this.containers.get(id);
        if (containerName) {
            try {
                if (force) {
                    await execAsync(`docker kill ${containerName}`);
                } else {
                    await execAsync(`docker stop -t 30 ${containerName}`);
                }
            } catch (e) {
                logger.error(`[DockerRunner:${id}] Stop failed: ${e.message}`);
                await execAsync(`docker rm -f ${containerName}`).catch(() => {});
            }
        }
    }

    async kill(id: string, signal: string = 'SIGKILL'): Promise<void> {
        const containerName = this.containers.get(id);
        if (containerName) {
            // Sanitize signal to prevent injection
            const safeSignal = SAFE_SIGNAL_REGEX.test(signal) ? signal : 'SIGKILL';
            try {
                await execAsync(`docker kill --signal ${safeSignal} ${containerName}`);
            } catch (e) {
                logger.error(`[DockerRunner:${id}] Kill (${safeSignal}) failed: ${e.message}`);
                // Fallback to rm -f if kill fails (container might be stuck)
                await execAsync(`docker rm -f ${containerName}`).catch(() => {});
            }
        }
    }

    async sendCommand(id: string, command: string): Promise<void> {
        const stdin = this.stdinStreams.get(id);
        if (stdin) {
            stdin.write(command + '\n');
            return;
        }

        const containerName = this.containers.get(id);
        if (containerName) {
            try {
                // Sanitize command to prevent shell injection in fallback path
                const safeCommand = command.replace(/["\\$`!]/g, '');
                await execAsync(`echo "${safeCommand}" | docker exec -i ${containerName} sh -c "cat >> /proc/1/fd/0"`);
            } catch (e: any) {
                logger.warn(`[DockerRunner:${id}] SendCommand fallback failed: ${e.message}`);
            }
        }
    }

    async getStats(id: string): Promise<RunnerStats> {
        const containerName = this.containers.get(id);
        if (!containerName) return { cpu: 0, memory: 0 };

        try {
            const { stdout } = await execAsync(`docker stats ${containerName} --no-stream --format "{{.CPUPerc}},{{.MemUsage}}"`);
            if (!stdout || !stdout.includes(',')) return { cpu: 0, memory: 0 };

            const [cpuStr, memStr] = stdout.split(',');
            
            // 1. Parse CPU (e.g., "0.50%")
            let cpuVal = parseFloat(cpuStr.replace(/[^0-9.]/g, '')) || 0;

            // 2. Normalize CPU by core count (docker stats returns sum of all cores)
            cpuVal = cpuVal / (this.CPU_CORES || 1);

            // 3. Apply Smoothing (Exponential Moving Average)
            const lastCpu = this.cpuHistory.get(id) ?? cpuVal;
            const smoothedCpu = (cpuVal * this.SMOOTHING_FACTOR) + (lastCpu * (1 - this.SMOOTHING_FACTOR));
            this.cpuHistory.set(id, smoothedCpu);

            // 4. Parse Memory Usage (e.g., "1.2MiB / 4GiB")
            const memPart = memStr.split('/')[0].trim().toLowerCase();
            let memVal = parseFloat(memPart.replace(/[^0-9.]/g, '')) || 0;
            
            if (memPart.includes('g')) { 
                memVal *= 1024;
            } else if (memPart.includes('k')) { 
                memVal /= 1024;
            } else if (memPart.includes('b') && !memPart.includes('m')) {
                memVal /= (1024 * 1024);
            }
            // Default is MiB/MB

            return {
                cpu: parseFloat(smoothedCpu.toFixed(2)),
                memory: parseFloat(memVal.toFixed(2)),
                containerId: containerName
            };
        } catch (e) {
            return { cpu: 0, memory: 0 };
        }
    }

    isRunning(id: string): boolean {
        return this.containers.has(id);
    }

    async createBackup(id: string, serverDir: string, options: { description?: string, worldOnly?: boolean }): Promise<any> {
        return backupService.createBackup(serverDir, id, options.description, options.worldOnly);
    }

    async restoreBackup(id: string, serverDir: string, backupId: string, options: { scope?: 'full' | 'world' | 'configs' | 'plugins', worldOnly?: boolean }): Promise<void> {
        return backupService.restoreBackup(serverDir, id, backupId, options);
    }
}
