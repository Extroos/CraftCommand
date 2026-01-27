import { ServerConfig, ServerStatus, LogEntry, UserProfile, GlobalSettings } from '../types';

const API_URL = '/api';

class ApiService {
    
    // --- Global Settings ---

    async getGlobalSettings(): Promise<GlobalSettings> {
        const res = await fetch(`${API_URL}/system/settings`);
        return res.json();
    }

    async updateGlobalSettings(updates: Partial<GlobalSettings>): Promise<GlobalSettings> {
        const res = await fetch(`${API_URL}/system/settings`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        return res.json();
    }

    async getDiscordStatus(): Promise<any> {
        const res = await fetch(`${API_URL}/system/discord/status`);
        return res.json();
    }

    async reconnectDiscord(): Promise<void> {
        const res = await fetch(`${API_URL}/system/discord/reconnect`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error('Failed to reconnect Discord bot');
    }

    async syncDiscordCommands(): Promise<void> {
        const res = await fetch(`${API_URL}/system/discord/sync-commands`, {
            method: 'POST'
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to sync commands');
        }
    }

    // --- Server Management ---

    async getServers(): Promise<ServerConfig[]> {
        const res = await fetch(`${API_URL}/servers`);
        return res.json();
    }

    async createServer(config: Partial<ServerConfig>): Promise<ServerConfig> {
        const res = await fetch(`${API_URL}/servers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        return res.json();
    }
    
    // --- Power Actions ---

    async startServer(id: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/start`, { method: 'POST' });
    }

    async stopServer(id: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/stop`, { method: 'POST' });
    }
    
    // --- File Management ---
    
    async getFiles(id: string, path: string = '.'): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/files?path=${encodeURIComponent(path)}`);
        return res.json();
    }
    
    // --- System & Install ---
    

    // --- System & Install ---
    
    async getJavaVersions(): Promise<any[]> {
        const res = await fetch(`${API_URL}/system/java`);
        return res.json();
    }
    
    async getSystemStats(): Promise<any> {
        const res = await fetch(`${API_URL}/system/stats`);
        return res.json();
    }

    async getServerStatus(id: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/query`);
        return res.json();
    }

    async getServerStats(id: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/stats`);
        return res.json();
    }

    async installServer(id: string, type: 'paper'|'modpack'|'vanilla'|'fabric'|'forge'|'spigot'|'neoforge'|'purpur', data: any): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/install`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, ...data })
        });
    }
    
    async deleteServer(id: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}`, { method: 'DELETE' });
    }
    
    async deleteFiles(id: string, paths: string[]): Promise<void> {

        await fetch(`${API_URL}/servers/${id}/files`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths })
        });
    }

    async uploadFile(id: string, file: File): Promise<void> {
        const formData = new FormData();
        formData.append('file', file);
        
        await fetch(`${API_URL}/servers/${id}/files/upload`, {
            method: 'POST',
            body: formData
        });
    }

    async extractFile(id: string, filePath: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/files/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath })
        });
    }

    async getFileContent(id: string, path: string): Promise<string> {
        const res = await fetch(`${API_URL}/servers/${id}/files/content?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        return data.content;
    }

    async saveFileContent(id: string, path: string, content: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/files/content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content })
        });
    }

    async createFolder(id: string, path: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/files/folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
    }

    // --- Backups ---

    async createBackup(id: string, description?: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/backups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
        });
        return res.json();
    }

    async getBackups(id: string): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/backups`);
        return res.json();
    }

    async restoreBackup(id: string, backupId: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/backups/${backupId}/restore`, {
            method: 'POST'
        });
    }

    async deleteBackup(id: string, backupId: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/backups/${backupId}`, {
            method: 'DELETE'
        });
    }

    async downloadBackup(id: string, backupId: string): Promise<void> {
        // Trigger direct browser download
        window.open(`${API_URL}/servers/${id}/backups/${backupId}/download`, '_blank');
    }

    async toggleBackupLock(id: string, backupId: string): Promise<{ success: boolean, locked: boolean }> {
        const res = await fetch(`${API_URL}/servers/${id}/backups/${backupId}/lock`, {
            method: 'POST'
        });
        return res.json();
    }

    // --- Schedules ---

    async getSchedules(id: string): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/schedules`);
        return res.json();
    }

    async getScheduleHistory(id: string): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/schedules/history`);
        return res.json();
    }

    async createSchedule(id: string, task: any): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        });
    }

    async updateSchedule(id: string, task: any): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/schedules/${task.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        });
    }

    async deleteSchedule(id: string, taskId: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/schedules/${taskId}`, {
            method: 'DELETE'
        });
    }

    async getLogs(id: string): Promise<string[]> {
        const res = await fetch(`${API_URL}/servers/${id}/logs`);
        return res.json();
    }

    async getCrashReport(id: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/crash-report`);
        return res.json();
    }

    async updateServer(id: string, updates: any): Promise<void> {
        await fetch(`${API_URL}/servers/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
    }

    // --- Players ---

    async getPlayers(id: string, type: string): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/players/${type}`);
        return res.json();
    }

    async addPlayer(id: string, type: string, identifier: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/players/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        return res.json();
    }

    async removePlayer(id: string, type: string, identifier: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/players/${type}/${identifier}`, {
            method: 'DELETE'
        });
        return res.json();
    }

    async kickPlayer(id: string, name: string, reason?: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/players/kick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, reason })
        });
    }

    // --- User ---

    async getUser(): Promise<UserProfile> {
        const res = await fetch(`${API_URL}/system/user`);
        return res.json();
    }

    async updateUser(updates: Partial<UserProfile>): Promise<UserProfile> {
        const res = await fetch(`${API_URL}/system/user`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        return res.json();
    }

    async login(email: string, password: string): Promise<boolean> {
        const res = await fetch(`${API_URL}/system/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (res.status === 401) return false;
        const data = await res.json();
        return data.success;
    }

    async getSystemCache(): Promise<{ java: { size: number, count: number }, temp: { size: number, count: number } }> {
        const res = await fetch(`${API_URL}/system/cache`);
        return res.json();
    }

    async clearSystemCache(type: 'java' | 'temp'): Promise<void> {
        await fetch(`${API_URL}/system/cache/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        });
    }

    async checkUpdates(force: boolean = false): Promise<any> {
        const res = await fetch(`${API_URL}/system/updates/check?force=${force}`);
        return res.json();
    }
}

export const API = new ApiService();
