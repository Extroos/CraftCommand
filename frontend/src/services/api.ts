import { 
    ServerConfig, 
    LogEntry, 
    ServerStatus, 
    UserProfile, 
    GlobalSettings,
    ServerTemplate 
} from '@shared/types';

const API_URL = '/api';

class ApiService {
    private getAuthHeader() {
        const token = localStorage.getItem('cc_token');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    async getDiscordStatus(): Promise<any> {
        const res = await fetch(`${API_URL}/system/discord/status`, {
            headers: this.getAuthHeader()
        });
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
        const res = await fetch(`${API_URL}/servers`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async createServer(config: Partial<ServerConfig>): Promise<ServerConfig> {
        const res = await fetch(`${API_URL}/servers`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify(config)
        });
        return res.json();
    }

    // --- Power Actions ---

    async startServer(id: string, force: boolean = false): Promise<void> {
        const res = await fetch(`${API_URL}/servers/${id}/start`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ force })
        });
        if (!res.ok) {
            const data = await res.json();
            const error: any = new Error(data.error || 'Failed to start server');
            error.code = data.code;
            error.details = data.details;
            error.safetyError = data.safetyError;
            throw error;
        }
    }

    async stopServer(id: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/stop`, { 
            method: 'POST',
            headers: this.getAuthHeader()
        });
    }
    
    // --- File Management ---
    
    async getFiles(id: string, path: string = '.'): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/files?path=${encodeURIComponent(path)}`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }
    
    // --- System & Install ---
    

    // --- System & Install ---
    
    async getJavaVersions(): Promise<any[]> {
        const res = await fetch(`${API_URL}/system/java`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }
    
    async getSystemStats(): Promise<any> {
        const res = await fetch(`${API_URL}/system/stats`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async getServerStatus(id: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/query`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async getServerStats(id: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/stats`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async installServer(id: string, type: 'paper'|'modpack'|'vanilla'|'fabric'|'forge'|'spigot'|'neoforge'|'purpur', data: any): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/install`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ type, ...data })
        });
    }
    
    async deleteServer(id: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}`, { 
            method: 'DELETE',
            headers: this.getAuthHeader()
        });
    }
    
    async deleteFiles(id: string, paths: string[]): Promise<void> {

        await fetch(`${API_URL}/servers/${id}/files`, {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ paths })
        });
    }

    async uploadFile(id: string, file: File): Promise<void> {
        const formData = new FormData();
        formData.append('file', file);
        
        await fetch(`${API_URL}/servers/${id}/files/upload`, {
            method: 'POST',
            headers: this.getAuthHeader(),
            body: formData
        });
    }

    async extractFile(id: string, filePath: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/files/extract`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ filePath })
        });
    }

    async fileExists(id: string, path: string): Promise<boolean> {
        const res = await fetch(`${API_URL}/servers/${id}/files/exists?path=${encodeURIComponent(path)}`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) {
            return false;
        }
        const data = await res.json();
        return !!data.exists;
    }

    async getFileContent(id: string, path: string, throwOn404: boolean = true): Promise<string | null> {
        const res = await fetch(`${API_URL}/servers/${id}/files/content?path=${encodeURIComponent(path)}`, {
            headers: this.getAuthHeader()
        });
        
        if (res.status === 404 && !throwOn404) {
            return null;
        }

        if (!res.ok) {
            throw new Error(`Failed to get file content: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        return data.content;
    }

    async saveFileContent(id: string, path: string, content: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/files/content`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ path, content })
        });
    }

    async createFolder(id: string, path: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/files/folder`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ path })
        });
    }

    // --- Backups ---

    async createBackup(id: string, description?: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/backups`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ description })
        });
        return res.json();
    }

    async getBackups(id: string): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/backups`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async restoreBackup(id: string, backupId: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/backups/${backupId}/restore`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });
    }

    async deleteBackup(id: string, backupId: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/backups/${backupId}`, {
            method: 'DELETE',
            headers: this.getAuthHeader()
        });
    }

    async downloadBackup(id: string, backupId: string): Promise<void> {
        // Trigger direct browser download
        window.open(`${API_URL}/servers/${id}/backups/${backupId}/download`, '_blank');
    }

    async toggleBackupLock(id: string, backupId: string): Promise<{ success: boolean, locked: boolean }> {
        const res = await fetch(`${API_URL}/servers/${id}/backups/${backupId}/lock`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    // --- Schedules ---

    async getSchedules(id: string): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/schedules`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async getScheduleHistory(id: string): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/schedules/history`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async createSchedule(id: string, task: any): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/schedules`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify(task)
        });
    }

    async updateSchedule(id: string, task: any): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/schedules/${task.id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify(task)
        });
    }

    async deleteSchedule(id: string, taskId: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/schedules/${taskId}`, {
            method: 'DELETE',
            headers: this.getAuthHeader()
        });
    }

    async getLogs(id: string): Promise<string[]> {
        const res = await fetch(`${API_URL}/servers/${id}/logs`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async getCrashReport(id: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/crash-report`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async runDiagnosis(id: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/diagnosis`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async updateServer(id: string, updates: any): Promise<void> {
        await fetch(`${API_URL}/servers/${id}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify(updates)
        });
    }

    // --- Players ---

    async getPlayers(id: string, type: string): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/players/${type}`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async addPlayer(id: string, type: string, identifier: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/players/${type}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ identifier })
        });
        return res.json();
    }

    async removePlayer(id: string, type: string, identifier: string): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/players/${type}/${identifier}`, {
            method: 'DELETE',
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async kickPlayer(id: string, name: string, reason?: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}/players/kick`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ name, reason })
        });
    }

    // --- User ---

    // --- User & Auth ---

    async getCurrentUser(token: string): Promise<UserProfile> {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to get user');
        return res.json();
    }

    async getUsers(token: string): Promise<UserProfile[]> {
        const res = await fetch(`${API_URL}/auth/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.json();
    }

    async createUser(data: any, token: string): Promise<UserProfile> {
        const res = await fetch(`${API_URL}/auth/users`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to create user');
        }
        return res.json();
    }

    async deleteUser(id: string, token: string): Promise<void> {
        await fetch(`${API_URL}/auth/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }

    async updateUser(updates: Partial<UserProfile>, token?: string): Promise<UserProfile> {
        const headers: any = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const res = await fetch(`${API_URL}/auth/me`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updates)
        });
        return res.json();
    }

    async updateUserAdmin(id: string, updates: Partial<UserProfile>, token: string): Promise<UserProfile> {
        const res = await fetch(`${API_URL}/auth/users/${id}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(updates)
        });
        if (!res.ok) throw new Error('Failed to update user');
        return res.json();
    }

    async login(email: string, password: string): Promise<{ success: boolean, user: UserProfile, token: string }> {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (res.status === 401) return { success: false, user: null as any, token: '' };
        
        const data = await res.json();
        // Backend returns: { user: UserProfile, token: string }
        return { success: true, user: data.user, token: data.token };
    }

    async getSystemCache(): Promise<{ java: { size: number, count: number }, temp: { size: number, count: number } }> {
        const res = await fetch(`${API_URL}/system/cache`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async clearSystemCache(type: 'java' | 'temp'): Promise<void> {
        await fetch(`${API_URL}/system/cache/clear`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ type })
        });
    }

    async checkUpdates(force: boolean = false): Promise<any> {
        const res = await fetch(`${API_URL}/system/updates/check?force=${force}`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async getTemplates(token: string): Promise<ServerTemplate[]> {
        const res = await fetch(`${API_URL}/templates`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch templates');
        return res.json();
    }

    async installTemplate(token: string, serverId: string, templateId: string): Promise<void> {
        const res = await fetch(`${API_URL}/templates/install`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ serverId, templateId })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to install template');
        }
    }
    
    // --- Audit Logs ---
    
    async getAuditLogs(limit?: number, action?: string, userId?: string): Promise<any[]> {
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit.toString());
        if (action) params.append('action', action);
        if (userId) params.append('userId', userId);

        const token = localStorage.getItem('cc_token');
        const headers: HeadersInit = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${API_URL}/system/audit?${params.toString()}`, { headers });
        return res.json();
    }

    // Global Settings
    async getGlobalSettings(): Promise<GlobalSettings> {
        const token = localStorage.getItem('cc_token');
        if (!token) throw new Error('Not authenticated');
        
        const response = await fetch('/api/settings/global', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch global settings');
        return response.json();
    }

    async updateGlobalSettings(settings: GlobalSettings): Promise<void> {
        const token = localStorage.getItem('cc_token');
        if (!token) throw new Error('Not authenticated');
        
        const response = await fetch('/api/settings/global', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) throw new Error('Failed to update global settings');
    }
}

export const API = new ApiService();
