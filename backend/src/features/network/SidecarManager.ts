import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import path from 'path';
import fs from 'fs-extra';
import treeKill from 'tree-kill';
import { binaryProvisioner } from '../../utils/BinaryProvisioner';

/**
 * SidecarManager (v1.14.0)
 * Manages "Sidecar" processes for servers (Tunnels, Proxies, Watchdogs)
 * Ensures these processes are tied to server lifecycle.
 */
export class SidecarManager extends EventEmitter {
    private sidecars: Map<string, Map<string, ChildProcess>> = new Map(); // serverId -> { type -> process }
    private watchdogTimers: Map<string, NodeJS.Timeout> = new Map();

    /**
     * Start a networking sidecar
     */
    async startSidecar(serverId: string, type: string, command: string, args: string[], cwd: string): Promise<void> {
        this.stopSidecar(serverId, type); // Ensure clean start

        logger.info(`[SidecarManager:${serverId}] Starting ${type} sidecar...`);
        
        const child = spawn(command, args, {
            cwd,
            shell: process.platform === 'win32',
            windowsHide: true,
            detached: false // Sidecars should die with the panel
        });

        if (!this.sidecars.has(serverId)) this.sidecars.set(serverId, new Map());
        this.sidecars.get(serverId)!.set(type, child);

        child.stdout?.on('data', (data) => {
            const line = data.toString().trim();
            if (line) logger.debug(`[Sidecar:${serverId}:${type}] ${line}`);
            this.emit('log', { serverId, type, line, stream: 'stdout' });
        });

        child.stderr?.on('data', (data) => {
            const line = data.toString().trim();
            if (line) logger.warn(`[Sidecar:${serverId}:${type}] ${line}`);
            this.emit('log', { serverId, type, line, stream: 'stderr' });
        });

        child.on('close', (code) => {
            logger.info(`[Sidecar:${serverId}:${type}] Process exited with code ${code}`);
            const serverMap = this.sidecars.get(serverId);
            if (serverMap && serverMap.get(type) === child) {
                serverMap.delete(type);
                this.emit('exit', { serverId, type, code });
            }
        });

        child.on('error', (err) => {
            logger.error(`[Sidecar:${serverId}:${type}] Spawn error: ${err.message}`);
        });
    }

    /**
     * Stop a specific sidecar
     */
    stopSidecar(serverId: string, type: string): void {
        const serverMap = this.sidecars.get(serverId);
        if (serverMap && serverMap.has(type)) {
            const child = serverMap.get(type)!;
            if (child.pid) {
                logger.info(`[SidecarManager:${serverId}] Terminating ${type} (PID: ${child.pid})...`);
                treeKill(child.pid, 'SIGKILL');
            }
            serverMap.delete(type);
        }
    }

    /**
     * Stop all sidecars for a server (called on server stop)
     */
    stopAllForServer(serverId: string): void {
        const serverMap = this.sidecars.get(serverId);
        if (serverMap) {
            for (const type of serverMap.keys()) {
                this.stopSidecar(serverId, type);
            }
            this.sidecars.delete(serverId);
        }
    }

    /**
     * Convenience: Start Cloudflare Tunnel
     */
    async startCloudflare(serverId: string, token: string): Promise<void> {
        try {
            const binPath = await binaryProvisioner.getBinaryPath('cloudflare');
            await this.startSidecar(serverId, 'cloudflare', binPath, ['tunnel', '--no-autoupdate', 'run', '--token', token], process.cwd());
        } catch (err: any) {
            logger.error(`[SidecarManager:${serverId}] Failed to provision cloudflared: ${err.message}`);
        }
    }

    /**
     * Convenience: Start Playit Agent
     */
    async startPlayit(serverId: string, secretPath: string): Promise<void> {
        try {
            const binPath = await binaryProvisioner.getBinaryPath('playit');
            await this.startSidecar(serverId, 'playit', binPath, ['--secret-path', secretPath], process.cwd());
        } catch (err: any) {
            logger.error(`[SidecarManager:${serverId}] Failed to provision playit: ${err.message}`);
        }
    }
}

export const sidecarManager = new SidecarManager();
