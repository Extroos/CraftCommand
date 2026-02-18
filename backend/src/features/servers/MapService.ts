import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { getServer } from './ServerService';
import { logger } from '../../utils/logger';
import { pluginService } from '../plugins/PluginService';

import { MapStatus } from '@shared/types';

export class MapService {
    private verifiedServers: Set<string> = new Set();

    async getMapStatus(serverId: string): Promise<MapStatus> {
        const server = getServer(serverId);
        if (!server || !server.workingDirectory) throw new Error('Server not found or working directory missing');

        const pluginsPath = path.join(server.workingDirectory, 'plugins');
        const dynmapJar = await this.findDynmapJar(pluginsPath);

        if (!dynmapJar) {
            return { installed: false, port: null, verified: false };
        }

        const port = await this.detectPort(server.workingDirectory);
        const isVerified = this.verifiedServers.has(serverId);

        return {
            installed: true,
            port,
            verified: isVerified,
            internalUrl: port ? `http://127.0.0.1:${port}` : undefined
        };
    }

    private async findDynmapJar(pluginsPath: string): Promise<string | null> {
        try {
            if (!await fs.pathExists(pluginsPath)) return null;
            const files = await fs.readdir(pluginsPath);
            // Case-insensitive search for any jar starting with dynmap
            return files.find(f => {
                const lower = f.toLowerCase();
                return lower.startsWith('dynmap') && lower.endsWith('.jar');
            }) || null;
        } catch (error) {
            logger.error(`[MapService] Error searching for Dynmap jar: ${error}`);
            return null;
        }
    }

    private async detectPort(workingDirectory: string): Promise<number | null> {
        const configPath = path.join(workingDirectory, 'plugins', 'dynmap', 'configuration.txt');
        try {
            if (!await fs.pathExists(configPath)) return 8123; // Default Dynmap port

            const content = await fs.readFile(configPath, 'utf8');
            const portMatch = content.match(/^webserver-port:\s*(\d+)/m);
            if (portMatch) {
                return parseInt(portMatch[1], 10);
            }
        } catch (error) {
            logger.warn(`[MapService] Failed to read Dynmap config at ${configPath}, using default 8123`);
        }
        return 8123;
    }

    async verifyHealth(serverId: string): Promise<{ verified: boolean; error?: string }> {
        const status = await this.getMapStatus(serverId);
        if (!status.installed || !status.port) {
            return { verified: false, error: 'Dynmap not installed or port unknown' };
        }

        try {
            const res = await axios.get(`http://127.0.0.1:${status.port}/up/configuration`, { timeout: 2000 });
            if (res.status === 200) {
                this.verifiedServers.add(serverId);
                return { verified: true };
            }
            return { verified: false, error: `Unexpected response: ${res.status}` };
        } catch (error: any) {
            return { verified: false, error: error.message || 'Connection refused' };
        }
    }

    async renderWorld(serverId: string, mode: 'update' | 'full' | 'radius' = 'update', radius?: number): Promise<{ success: boolean }> {
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        const { processManager } = require('../processes/ProcessManager');
        if (!processManager.isRunning(serverId)) {
            throw new Error('Server must be online to trigger render');
        }

        let command = 'dynmap updaterender';
        if (mode === 'full') command = 'dynmap fullrender';
        else if (mode === 'radius') command = `dynmap radiusrender ${radius || 100}`;

        processManager.sendCommand(serverId, command);
        logger.info(`[MapService:${serverId}] Triggered ${mode} render: ${command}`);
        return { success: true };
    }

    async installDynmap(serverId: string): Promise<any> {
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        // Use reliable direct URL for Bukkit-family servers as Spiget/Modrinth can be unstable for this project
        if (server.software === 'Paper' || server.software === 'Spigot' || server.software === 'Purpur') {
            const directUrl = 'https://mediafilez.forgecdn.net/files/7460/127/Dynmap-3.8-spigot.jar';
            return pluginService.install(serverId, directUrl, 'direct');
        }

        // Fallback to Modrinth for Forge/Fabric
        return pluginService.install(serverId, 'fRQREgAc', 'modrinth');
    }
}

export const mapService = new MapService();
