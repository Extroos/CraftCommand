import { spawn, exec, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { IServerRunner, RunnerStats } from './IServerRunner';
import util from 'util';
import os from 'os';
import { Writable } from 'stream';
import { backupService } from '../../backups/BackupService';

const execAsync = util.promisify(exec);

export class DockerRunner extends EventEmitter implements IServerRunner {
    private containers: Map<string, string> = new Map(); // serverId -> containerName/Id
    private stdinStreams: Map<string, Writable> = new Map(); // serverId -> stdin
    private cpuHistory: Map<string, number> = new Map(); // serverId -> lastCpuValue
    private readonly CPU_CORES = os.cpus().length;
    private readonly SMOOTHING_FACTOR = 0.3; // EMA factor (lower = smoother)

    async start(id: string, runCommand: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
        const containerName = `craftcommand-server-${id}`;
        
        // 1. Verify Docker Daemon is accessible
        try {
            await execAsync('docker ps');
        } catch (e) {
            throw new Error('Docker Daemon is unreachable. Please ensure Docker Desktop is running.');
        }

        const image = env.dockerImage || env.DOCKER_IMAGE || 'eclipse-temurin:17-jre'; 
        console.log(`[DockerRunner] Pulling image ${image} (if missing)...`);
        this.emit('log', { id, line: `[DockerRunner] Pulling/Verifying image ${image}...`, type: 'stdout' });
        
        try {
            await execAsync(`docker pull ${image}`);
        } catch (e) {
            console.warn(`[DockerRunner] Pull failed or image local: ${e.message}`);
        }

        console.log(`[DockerRunner] Starting container ${containerName} for ${id}...`);

        // 2. Ensure previous container is gone
        try {
            await execAsync(`docker rm -f ${containerName}`);
        } catch (e) {}

        // 3. Build Docker Run Command
        const port = env.SERVER_PORT || '25565';
        const ram = env.SERVER_RAM || '2';
        const cpus = env.DOCKER_CPUS || '0.000'; // 0.000 = unlimited
        
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

        // 5. Native Health Check (Port-based)
        // Note: Using nc -z for TCP, but Bedrock UDP might need a different approach 
        // We'll stick to a generic one that works for most if nc is installed, else fail silently
        if (protocol === '') {
             dockerCmd += ` --health-cmd "nc -z localhost ${port} || exit 1" --health-interval 30s --health-retries 3`;
        }

        // 6. Multi-Port Support
        if (env.EXTRA_PORTS) {
            const extra = env.EXTRA_PORTS.split(',');
            for (const p of extra) {
                if (p.trim()) dockerCmd += ` -p ${p.trim()}`;
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
            console.error(`[DockerRunner:${id}] Child process error:`, err);
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
     * and re-register them if they are still running.
     */
    async syncActiveContainers(): Promise<void> {
        try {
            const { stdout } = await execAsync('docker ps --filter "name=craftcommand-server-" --format "{{.ID}},{{.Names}}"');
            const lines = stdout.split('\n').filter(l => l.trim() !== '');
            
            for (const line of lines) {
                let [containerId, name] = line.split(',');
                // Format: craftcommand-server-SERVER_ID
                // Docker names occasionally have a leading slash
                name = name.replace(/^\//, '');
                const serverId = name.replace('craftcommand-server-', '');
                if (serverId && !this.containers.has(serverId)) {
                    console.log(`[DockerRunner] Re-mapped existing container ${name} to server ${serverId}`);
                    this.containers.set(serverId, name);
                }
            }
        } catch (e) {
            console.warn(`[DockerRunner] Failed to sync active containers: ${e.message}`);
        }
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
                console.error(`[DockerRunner:${id}] Stop failed:`, e.message);
                await execAsync(`docker rm -f ${containerName}`).catch(() => {});
            }
        }
    }

    async kill(id: string, signal: string = 'SIGKILL'): Promise<void> {
        const containerName = this.containers.get(id);
        if (containerName) {
            try {
                // Signals in docker kill are passed via --signal
                await execAsync(`docker kill --signal ${signal} ${containerName}`);
            } catch (e) {
                console.error(`[DockerRunner:${id}] Kill (${signal}) failed:`, e.message);
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
                // Persistent STDIN absent (e.g. after backend restart), fallback to exec injection
                await execAsync(`echo "${command}" | docker exec -i ${containerName} sh -c "cat >> /proc/1/fd/0"`);
            } catch (e) {
                console.warn(`[DockerRunner:${id}] SendCommand fallback failed: ${e.message}`);
            }
        }
    }

    async getStats(id: string): Promise<RunnerStats> {
        const containerName = this.containers.get(id);
        if (!containerName) return { cpu: 0, memory: 0 };

        try {
            const { stdout } = await execAsync(`docker stats ${containerName} --no-stream --format "{{.CPUPerc}},{{.MemUsage}}"`);
            const [cpu, mem] = stdout.split(',');
            
            // 1. Parse CPU (e.g., "0.50%")
            let cpuVal = parseFloat(cpu.replace('%', ''));

            // 2. Normalize CPU by core count (docker stats returns sum of all cores)
            // This brings 500% down to ~41% on 12 cores.
            cpuVal = cpuVal / this.CPU_CORES;

            // 3. Apply Smoothing (Exponential Moving Average)
            const lastCpu = this.cpuHistory.get(id) || cpuVal;
            const smoothedCpu = (cpuVal * this.SMOOTHING_FACTOR) + (lastCpu * (1 - this.SMOOTHING_FACTOR));
            this.cpuHistory.set(id, smoothedCpu);

            // 4. Parse Memory Usage (e.g., "1.2MiB / 4GiB")
            const memPart = mem.split('/')[0].trim().toLowerCase();
            let memVal = parseFloat(memPart);
            
            if (memPart.includes('g')) { // Handles GiB, GB, g
                memVal *= 1024;
            } else if (memPart.includes('k')) { // Handles KiB, kB, k
                memVal /= 1024;
            } else if (memPart.includes('b') && !memPart.includes('m')) {
                // Raw bytes (B), not MB or MiB
                memVal /= (1024 * 1024);
            }
            // Default is MiB/MB

            return {
                cpu: parseFloat(smoothedCpu.toFixed(2)),
                memory: memVal,
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
