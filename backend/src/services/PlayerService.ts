
import fs from 'fs-extra';
import path from 'path';
import { processManager } from './ProcessManager';
import { getServer } from './ServerService';
import axios from 'axios'; 

export class PlayerService {
    
    // Helpers
    private getFilePath(serverDir: string, file: string) {
        return path.join(serverDir, file);
    }

    private async readJsonFile(serverDir: string, file: string): Promise<any[]> {
        const filePath = this.getFilePath(serverDir, file);
        if (await fs.pathExists(filePath)) {
            try {
                return await fs.readJSON(filePath);
            } catch (e) {
                console.error(`[PlayerService] Failed to read ${file}:`, e);
                return [];
            }
        }
        return [];
    }

    // --- Offline/Online Handling ---

    async getPlayerList(serverId: string, type: 'ops' | 'whitelist' | 'banned-players' | 'banned-ips' | 'online' | 'all') {
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');
        
        const status = processManager.getCachedStatus(serverId);
        const onlineNames: string[] = status.playerList || [];

        // All Known Players (History + Online)
        if (type === 'all') {
            const userCache = await this.readJsonFile(server.workingDirectory, 'usercache.json');
            
            // We also want to check OPS status for the roster
            const ops = await this.readJsonFile(server.workingDirectory, 'ops.json');
            const opNames = new Set(ops.map((o: any) => o.name.toLowerCase()));
            const onlineSet = new Set(onlineNames.map(n => n.toLowerCase()));

            // Map cache to Player objects
            // usercache.json: [{"name":"Player","uuid":"...","expiresOn":"..."}]
            const history = userCache.map((p: any) => ({
                name: p.name,
                uuid: p.uuid,
                skinUrl: `https://mc-heads.net/avatar/${p.name}/64`,
                isOp: opNames.has(p.name.toLowerCase()),
                online: onlineSet.has(p.name.toLowerCase()),
                lastSeen: p.expiresOn // Not exactly last seen, but close enough for cache
            }));

            // Ensure current online players are in the list (if not in cache yet)
            for (const onlineName of onlineNames) {
                if (!history.find(p => p.name.toLowerCase() === onlineName.toLowerCase())) {
                    history.unshift({
                        name: onlineName,
                        uuid: 'runtime-' + onlineName,
                        skinUrl: `https://mc-heads.net/avatar/${onlineName}/64`,
                        isOp: opNames.has(onlineName.toLowerCase()),
                        online: true,
                        lastSeen: new Date().toISOString()
                    });
                }
            }
            
            return history;
        }

        // Online Players (Runtime)
        if (type === 'online') {
            // Convert simple string list to Player objects
            // status.playerList is string[]
            const onlineNames: string[] = status.playerList || [];
            
            console.log(`[PlayerService] ${serverId} Online Names:`, onlineNames);

            // We can check ops status effectively since we have access to the ops list
            const ops = await this.readJsonFile(server.workingDirectory, 'ops.json');
            const opNames = new Set(ops.map((o: any) => o.name.toLowerCase()));

            return onlineNames.map(name => ({
                name,
                uuid: 'runtime-' + name, // Placeholder, skins work by name
                skinUrl: `https://mc-heads.net/avatar/${name}/64`,
                isOp: opNames.has(name.toLowerCase()),
                online: true,
                ping: 0 // We don't track per-player ping yet
            }));
        }

        // File-based Lists
        const filename = type === 'ops' ? 'ops.json' : 
                         type === 'whitelist' ? 'whitelist.json' : 
                         type === 'banned-players' ? 'banned-players.json' : 'banned-ips.json';
                         
        return this.readJsonFile(server.workingDirectory, filename);
    }

    async kickPlayer(serverId: string, name: string, reason: string = 'Kicked by operator') {
         if (processManager.isRunning(serverId)) {
             processManager.sendCommand(serverId, `kick ${name} ${reason}`);
             return { success: true };
         }
         throw new Error('Server is offline');
    }

    async addPlayer(serverId: string, type: 'ops' | 'whitelist' | 'banned-players' | 'banned-ips', identifier: string) {
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        // Validation
        if (type === 'banned-ips') {
             // Simple IP Regex (IPv4)
             const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
             if (!ipRegex.test(identifier)) throw new Error('Invalid IP address format');
        } else {
            // Minecraft Username Regex (3-16 chars, allowed chars)
            const nameRegex = /^[a-zA-Z0-9_]{3,16}$/;
            if (!nameRegex.test(identifier)) throw new Error('Invalid username format (3-16 chars, A-Z, 0-9, _)');
        }

        const isRunning = processManager.isRunning(serverId);

        // 1. If Online, use Console Commands (Safest & easiest)
        if (isRunning) {
            let cmd = '';
            switch (type) {
                case 'ops': cmd = `op ${identifier}`; break;
                case 'whitelist': cmd = `whitelist add ${identifier}`; break;
                case 'banned-players': cmd = `ban ${identifier}`; break;
                case 'banned-ips': cmd = `ban-ip ${identifier}`; break;
            }
            processManager.sendCommand(serverId, cmd);
            return { success: true, method: 'command', message: `Executed: ${cmd}` };
        }

        // 2. If Offline, modify JSON files directly
        // Note: Adding requires UUID for ops/whitelist. We'll attempt to fetch it.
        const uuid = await this.fetchUuid(identifier, type === 'banned-ips');
        
        const filename = type === 'ops' ? 'ops.json' : 
                         type === 'whitelist' ? 'whitelist.json' : 
                         type === 'banned-players' ? 'banned-players.json' : 'banned-ips.json';

        const list = await this.readJsonFile(server.workingDirectory, filename);
        
        // Prevent duplicates (Case Insensitive)
        if (list.some((p: any) => 
            (p.name && p.name.toLowerCase() === identifier.toLowerCase()) || 
            (p.ip && p.ip === identifier)
        )) {
            return { success: false, message: 'Already exists in list' };
        }

        let entry: any = {};
        const now = new Date().toISOString();

        if (type === 'ops') {
            entry = { uuid, name: identifier, level: 4, bypassesPlayerLimit: false };
        } else if (type === 'whitelist') {
            entry = { uuid, name: identifier };
        } else if (type === 'banned-players') {
            entry = { uuid, name: identifier, created: now, source: 'Console', expires: 'forever', reason: 'Banned by Admin' };
        } else if (type === 'banned-ips') {
            entry = { ip: identifier, created: now, source: 'Console', expires: 'forever', reason: 'Banned by Admin' };
        }

        list.push(entry);
        await fs.writeJSON(this.getFilePath(server.workingDirectory, filename), list, { spaces: 2 });
        return { success: true, method: 'file', message: `Added ${identifier} to ${filename}` };
    }

    async removePlayer(serverId: string, type: 'ops' | 'whitelist' | 'banned-players' | 'banned-ips', identifier: string) {
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        const isRunning = processManager.isRunning(serverId);

        if (isRunning) {
            let cmd = '';
            switch (type) {
                case 'ops': cmd = `deop ${identifier}`; break;
                case 'whitelist': cmd = `whitelist remove ${identifier}`; break;
                case 'banned-players': cmd = `pardon ${identifier}`; break;
                case 'banned-ips': cmd = `pardon-ip ${identifier}`; break;
            }
            processManager.sendCommand(serverId, cmd);
             return { success: true, method: 'command', message: `Executed: ${cmd}` };
        }

        // Offline Removal
        const filename = type === 'ops' ? 'ops.json' : 
                         type === 'whitelist' ? 'whitelist.json' : 
                         type === 'banned-players' ? 'banned-players.json' : 'banned-ips.json';
                         
        let list = await this.readJsonFile(server.workingDirectory, filename);
        
        const initialLength = list.length;
        list = list.filter((p: any) => {
            if (type === 'banned-ips') return p.ip !== identifier;
            // Match by name or uuid
            return p.name?.toLowerCase() !== identifier.toLowerCase() && p.uuid !== identifier;
        });

        if (list.length === initialLength) return { success: false, message: 'Entry not found' };

        await fs.writeJSON(this.getFilePath(server.workingDirectory, filename), list, { spaces: 2 });
        return { success: true, method: 'file', message: `Removed ${identifier} from ${filename}` };
    }

    private async fetchUuid(name: string, isIp: boolean): Promise<string> {
        if (isIp) return '';
        try {
            // Using Mojang API with Timeout
            const res = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${name}`, { timeout: 3000 });
            if (res.data && res.data.id) {
                // Format UUID (add dashes)
                const raw = res.data.id;
                return `${raw.substr(0,8)}-${raw.substr(8,4)}-${raw.substr(12,4)}-${raw.substr(16,4)}-${raw.substr(20)}`;
            }
        } catch (e) {
            console.warn(`[PlayerService] Failed to fetch UUID for ${name}. Using offline-mode UUID logic or dummy.`);
        }
        // Fallback: Generate offline UUID or dummy
        return '00000000-0000-0000-0000-000000000000'; 
    }
}

export const playerService = new PlayerService();
