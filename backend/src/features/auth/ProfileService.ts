import fs from 'fs-extra';
import path from 'path';
import { getServer } from '../servers/ServerService';
import {  ServerProfile  } from '@shared/types';
import { systemSettingsService } from '../system/SystemSettingsService';
import { logger } from '../../utils/logger';

export class ProfileService {
    
    /**
     * Exports a minimalist JSON profile from an existing server.
     * Strips secrets, IPs, and heavy data. Includes plugin list.
     */
    async exportProfile(serverId: string): Promise<ServerProfile> {
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        // Scan plugins to include in the profile manifest
        const pluginsDir = path.join(server.workingDirectory, 'plugins');
        const plugins: { name: string }[] = [];
        
        try {
            if (await fs.pathExists(pluginsDir)) {
                const files = await fs.readdir(pluginsDir);
                files.filter(f => f.endsWith('.jar')).forEach(f => {
                    plugins.push({ name: f.replace('.jar', '') });
                });
            }
        } catch (e) {
            logger.warn(`[ProfileService] Failed to scan plugins for ${serverId}: ${e}`);
        }

        const profile: ServerProfile = {
            name: server.name,
            description: `Exported profile from ${server.name}`,
            version: server.version,
            software: server.software,
            javaVersion: server.javaVersion,
            ram: server.ram,
            port: server.port, // Included as a suggestion
            advancedFlags: server.advancedFlags,
            plugins: plugins.length > 0 ? plugins : undefined,
            platformVersion: '1.0.0' // Placeholder for actual app version
        };

        return profile;
    }

    /**
     * Validates that a JSON object matches the ServerProfile interface.
     */
    validateProfile(data: any): ServerProfile {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid profile format: Not a JSON object');
        }

        const requiredFields = ['version', 'software', 'javaVersion', 'ram'];
        const missing = requiredFields.filter(field => !data[field]);

        if (missing.length > 0) {
            throw new Error(`Invalid profile: Missing fields [${missing.join(', ')}]`);
        }

        // Additional validation
        if (typeof data.ram !== 'number') throw new Error('Invalid profile: RAM must be a number');
        
        return data as ServerProfile;
    }
}

export const profileService = new ProfileService();
