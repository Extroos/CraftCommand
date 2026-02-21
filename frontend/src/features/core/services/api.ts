import { 
    ServerConfig, 
    LogEntry, 
    ServerStatus, 
    UserProfile, 
    GlobalSettings,
    ServerTemplate,
    ImportAnalysis,
    PluginSearchQuery,
    PluginSearchResult,
    InstalledPlugin,
    PluginUpdateInfo,
    PluginSource,
    NodeInfo,
    SyncReport
} from '@shared/types';

const API_URL = '/api';

class ApiService {
    private getAuthHeader() {
        const token = localStorage.getItem('cc_token');
        if (!token) {
            console.warn('[ApiService] No cc_token found in localStorage!');
        }
        return token ? { 'Authorization': `Bearer ${token}` } : {};
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
        
        if (!res.ok) {
            const data = await res.json();
            const error: any = new Error(data.message || data.error || 'Failed to create server');
            error.code = data.code;
            throw error;
        }

        return res.json();
    }

    async importLocal(name: string, path: string, config: Partial<ServerConfig> = {}): Promise<ServerConfig> {
        const res = await fetch(`${API_URL}/servers/import/local`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ name, path, config })
        });
        
        if (!res.ok) {
            const data = await res.json();
            const error: any = new Error(data.message || data.error || 'Failed to import local server');
            error.code = data.code;
            throw error;
        }

        return res.json();
    }

    async analyzeLocal(path: string): Promise<ImportAnalysis> {
        const res = await fetch(`${API_URL}/servers/import/analyze-local`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ path })
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to analyze local folder');
        }

        return res.json();
    }

    async importArchive(name: string, file: File, config: Partial<ServerConfig> = {}): Promise<ServerConfig> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        formData.append('config', JSON.stringify(config));
        
        const res = await fetch(`${API_URL}/servers/import/archive`, {
            method: 'POST',
            headers: this.getAuthHeader(),
            body: formData
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to import archive');
        }

        return res.json();
    }

    async analyzeArchive(file: File): Promise<ImportAnalysis> {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(`${API_URL}/servers/import/analyze-archive`, {
            method: 'POST',
            headers: this.getAuthHeader(),
            body: formData
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to analyze archive');
        }

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
            const error: any = new Error(data.message || data.error || 'Failed to start server');
            error.code = data.code;
            error.details = data.details;
            error.safetyError = data.safetyError;
            throw error;
        }
    }

    async stopServer(id: string): Promise<void> {
        const res = await fetch(`${API_URL}/servers/${id}/stop`, { 
            method: 'POST',
            headers: this.getAuthHeader()
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || data.error || 'Failed to stop server');
        }
    }
    
    // --- File Management ---
    
    async getFiles(id: string, path: string = '.'): Promise<any[]> {
        const res = await fetch(`${API_URL}/servers/${id}/files?path=${encodeURIComponent(path)}`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to list files');
        }
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

    async getBedrockVersions(): Promise<{ latest: string, versions: string[] }> {
        const res = await fetch(`${API_URL}/system/bedrock/versions`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) throw new Error('Failed to fetch Bedrock versions');
        return res.json();
    }
    
    async getSystemStats(): Promise<any> {
        const res = await fetch(`${API_URL}/system/stats`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async getSystemHealth(): Promise<any> {
        const res = await fetch(`${API_URL}/system/health`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) throw new Error('Failed to fetch system health');
        return res.json();
    }

    async getDockerStatus(): Promise<{ online: boolean, version?: string, error?: string }> {
        const res = await fetch(`${API_URL}/system/docker/status`, {
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

    async installServer(id: string, type: 'paper'|'modpack'|'vanilla'|'fabric'|'forge'|'spigot'|'neoforge'|'purpur'|'bedrock'|'velocity', data: any): Promise<void> {
        const res = await fetch(`${API_URL}/servers/${id}/install`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ type, ...data })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to install server software');
        }
    }
    
    async deleteServer(id: string): Promise<void> {
        await fetch(`${API_URL}/servers/${id}`, { 
            method: 'DELETE',
            headers: this.getAuthHeader()
        });
    }

    async fixNodeCapability(nodeId: string, capability: string): Promise<{ ok: boolean, message?: string }> {
        const res = await fetch(`${API_URL}/nodes/${nodeId}/fix`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ capability })
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to trigger fix');
        }

        return res.json();
    }

    async shutdownNode(nodeId: string): Promise<void> {
        const res = await fetch(`${API_URL}/nodes/${nodeId}/shutdown`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to shutdown node');
        }
    }

    // --- Proxy Networking ---

    async linkServerToProxy(proxyId: string, backendId: string, alias: string): Promise<void> {
        const res = await fetch(`${API_URL}/network/proxy/link`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ proxyId, backendId, alias })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to link server');
        }
    }

    async unlinkServerFromProxy(proxyId: string, backendId: string): Promise<void> {
        const res = await fetch(`${API_URL}/network/proxy/unlink`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ proxyId, backendId })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to unlink server');
        }
    }

    async unlinkProxyByServer(serverId: string): Promise<void> {
        const res = await fetch(`${API_URL}/network/proxy/unlink-by-server`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ serverId })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to unlink proxy for server');
        }
    }

    async installViaSuite(proxyId: string): Promise<void> {
        const res = await fetch(`${API_URL}/network/proxy/install-via-suite`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ proxyId })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to install Via Suite');
        }
    }
    
    async deleteFiles(id: string, paths: string[]): Promise<void> {

        const res = await fetch(`${API_URL}/servers/${id}/files`, {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ paths })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to delete files');
        }
    }

    async uploadFile(id: string, file: File, path: string = ''): Promise<void> {
        const formData = new FormData();
        formData.append('file', file);
        const uploadUrl = path 
            ? `${API_URL}/servers/${id}/files/upload?path=${encodeURIComponent(path)}`
            : `${API_URL}/servers/${id}/files/upload`;
        
        const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: this.getAuthHeader(),
            body: formData
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to upload file');
        }
    }

    async uploadServerIcon(serverId: string, file: File): Promise<{ success: boolean, iconName: string }> {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(`${API_URL}/servers/${serverId}/icon`, {
            method: 'POST',
            headers: this.getAuthHeader(),
            body: formData
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to upload server icon');
        }

        return res.json();
    }

    async extractFile(id: string, filePath: string): Promise<void> {
        const res = await fetch(`${API_URL}/servers/${id}/files/extract`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ filePath })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to extract file');
        }
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
        const res = await fetch(`${API_URL}/servers/${id}/files/content`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ path, content })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to save file content');
        }
    }

    async createFolder(id: string, path: string): Promise<void> {
        const res = await fetch(`${API_URL}/servers/${id}/files/folder`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ path })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to create folder');
        }
    }

    // --- Backups ---

    async createBackup(id: string, description?: string, worldOnly?: boolean): Promise<any> {
        const res = await fetch(`${API_URL}/servers/${id}/backups`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ description, worldOnly })
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

    async healServer(id: string, type: string, payload: any = {}): Promise<void> {
        const res = await fetch(`${API_URL}/servers/${id}/heal`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify({ type, payload })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to apply fix');
        }
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

    async checkConfigSync(id: string): Promise<SyncReport> {
        const res = await fetch(`${API_URL}/servers/${id}/config/check`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) throw new Error('Failed to check configuration sync');
        return res.json();
    }

    async syncConfig(id: string): Promise<void> {
        const res = await fetch(`${API_URL}/servers/${id}/config/sync`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to sync configuration');
        }
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
        await fetch(`${API_URL}/servers/${id}/kick-player`, {
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

    async login(email: string, password: string): Promise<{ success: boolean, user: UserProfile, token: string, twoFactorRequired?: boolean }> {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (res.status === 401) return { success: false, user: null as any, token: '', twoFactorRequired: false };
        
        const data = await res.json();
        return { 
            success: true, 
            user: data.user, 
            token: data.token, 
            twoFactorRequired: data.twoFactorRequired 
        };
    }

    async verify2FA(code: string, token: string, isRecovery: boolean = false): Promise<{ success: boolean, token?: string, user?: UserProfile }> {
        const res = await fetch(`${API_URL}/auth/2fa/verify`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ code, isRecovery })
        });

        if (!res.ok) return { success: false };
        const data = await res.json();
        return { success: true, token: data.token, user: data.user };
    }

    async start2FASetup(token: string): Promise<{ qrCode: string, secret: string }> {
        const res = await fetch(`${API_URL}/auth/2fa/setup/start`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) throw new Error('Failed to start 2FA setup');
        return res.json();
    }

    async confirm2FASetup(code: string, token: string): Promise<{ backupCodes: string[] }> {
        const res = await fetch(`${API_URL}/auth/2fa/setup/confirm`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ code })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to confirm 2FA setup');
        }
        return res.json();
    }

    async disable2FA(password: string, code: string, token: string): Promise<void> {
        const res = await fetch(`${API_URL}/auth/2fa/disable`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password, code })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to disable 2FA');
        }
    }

    // --- Notifications ---

    async getNotifications(limit: number = 50, unreadOnly?: boolean): Promise<any[]> {
        const query = new URLSearchParams({ limit: limit.toString() });
        if (unreadOnly) query.append('unreadOnly', 'true');

        const res = await fetch(`${API_URL}/notifications?${query.toString()}`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to fetch notifications');
        }
        return res.json();
    }

    async markNotificationRead(id: string): Promise<void> {
        await fetch(`${API_URL}/notifications/${id}/read`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });
    }

    async markAllNotificationsRead(): Promise<void> {
        await fetch(`${API_URL}/notifications/read-all`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });
    }

    async deleteNotification(id: string): Promise<void> {
        await fetch(`${API_URL}/notifications/${id}`, {
            method: 'DELETE',
            headers: this.getAuthHeader()
        });
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

    async installTemplate(token: string, serverId: string, templateId: string, options: { customUrl?: string } = {}): Promise<void> {
        const res = await fetch(`${API_URL}/templates/install`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ serverId, templateId, options })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to install template');
        }
    }

    // --- Server Profiles ---

    async exportProfile(token: string, serverId: string): Promise<void> {
        // We use a direct window.open with the token in the Authorization header? 
        // No, window.open cannot set headers.
        // We must fetch the blob and trigger a download, OR use a temporary token in query param.
        // Given the current architecture, let's fetch blob.
        
        const res = await fetch(`${API_URL}/profiles/${serverId}/export`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to export profile');
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Content-Disposition should give the filename, but if not we guess
        const disposition = res.headers.get('Content-Disposition');
        let filename = `${serverId}-profile.json`;
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) { 
                filename = matches[1].replace(/['"]/g, '');
            }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    async validateProfile(token: string, profile: any): Promise<{ valid: boolean, profile?: any, error?: string }> {
        const res = await fetch(`${API_URL}/profiles/validate`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(profile)
        });
        return res.json();
    }

    // --- Webhooks (Extensions) ---

    async getWebhooks(token: string, serverId: string): Promise<any[]> {
        const res = await fetch(`${API_URL}/webhooks/servers/${serverId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch webhooks');
        return res.json();
    }

    async createWebhook(token: string, serverId: string, webhook: any): Promise<any> {
        const res = await fetch(`${API_URL}/webhooks/servers/${serverId}`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(webhook)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to create webhook');
        }
        return res.json();
    }

    async updateWebhook(token: string, webhook: any): Promise<any> {
        const res = await fetch(`${API_URL}/webhooks/${webhook.id}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(webhook)
        });
        if (!res.ok) throw new Error('Failed to update webhook');
        return res.json();
    }

    async deleteWebhook(token: string, webhookId: string): Promise<void> {
        const res = await fetch(`${API_URL}/webhooks/${webhookId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to delete webhook');
    }

    async testWebhook(token: string, webhookId: string): Promise<{ success: boolean, status: number }> {
        const res = await fetch(`${API_URL}/webhooks/${webhookId}/test`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.json();
    }
    
    // --- Audit Logs ---
    
    async getAuditLogs(options: { 
        limit?: number, 
        offset?: number, 
        action?: string, 
        userId?: string, 
        search?: string 
    } = {}): Promise<{ logs: any[], total: number }> {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit.toString());
        if (options.offset) params.append('offset', options.offset.toString());
        if (options.action) params.append('action', options.action);
        if (options.userId) params.append('userId', options.userId);
        if (options.search) params.append('search', options.search);

        const token = localStorage.getItem('cc_token');
        const headers: HeadersInit = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${API_URL}/system/audit?${params.toString()}`, { headers });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to fetch audit logs');
        }
        return res.json();
    }

    // Generic Request Helpers
    async get(path: string): Promise<any> {
        const fullPath = path.startsWith(API_URL) ? path : `${API_URL}${path}`;
        const res = await fetch(fullPath, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `GET ${fullPath} failed: ${res.status}`);
        }
        return res.json();
    }

    async post(path: string, body: any): Promise<any> {
        const fullPath = path.startsWith(API_URL) ? path : `${API_URL}${path}`;
        const res = await fetch(fullPath, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `POST ${fullPath} failed: ${res.status}`);
        }
        return res.json();
    }

    // Global Settings
    async getGlobalSettings(): Promise<GlobalSettings> {
        return this.get('/api/settings/global');
    }

    async updateGlobalSettings(settings: Partial<GlobalSettings>): Promise<void> {
        const token = localStorage.getItem('cc_token');
        if (!token) throw new Error('Not authenticated');

        const response = await fetch('/api/settings/global', {
            method: 'PUT',
            headers: {
                ...this.getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        if (!response.ok) throw new Error('Failed to update global settings');
    }

    // --- Dynmap Integration ---
    async getMapStatus(serverId: string): Promise<{ installed: boolean; port: number | null; verified: boolean; error?: string; internalUrl?: string }> {
        return this.get(`/api/servers/${serverId}/map/status`);
    }

    async verifyMap(serverId: string): Promise<{ verified: boolean; error?: string }> {
        return this.post(`/api/servers/${serverId}/map/verify`, {});
    }

    async installMap(serverId: string): Promise<any> {
        return this.post(`/api/servers/${serverId}/map/install`, {});
    }

    async renderMap(serverId: string, mode: 'update' | 'full' | 'radius' = 'update', radius?: number): Promise<{ success: boolean }> {
        return this.post(`/api/servers/${serverId}/map/render`, { mode, radius });
    }

    // --- Remote Access ---
    async getRemoteAccessStatus(): Promise<{ enabled: boolean, method?: string, bindAddress: string }> {
        const res = await fetch(`${API_URL}/system/remote-access/status`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async enableRemoteAccess(method: 'vpn' | 'proxy' | 'direct'): Promise<void> {
        const res = await fetch(`${API_URL}/system/remote-access/enable`, {
            method: 'POST',
            headers: {
                ...this.getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ method })
        });
        if (!res.ok) throw new Error('Failed to enable remote access');
    }

    async disableRemoteAccess(): Promise<void> {
        const res = await fetch(`${API_URL}/system/remote-access/disable`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to disable remote access');
        }
    }

    async uploadBackground(file: File): Promise<{ url: string }> {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(`${API_URL}/assets/background`, {
            method: 'POST',
            headers: this.getAuthHeader(),
            body: formData
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to upload background');
        }
        
        return res.json();
    }

    async uploadAvatar(file: File): Promise<{ url: string }> {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(`${API_URL}/assets/avatar`, {
            method: 'POST',
            headers: this.getAuthHeader(),
            body: formData
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to upload avatar');
        }
        
        return res.json();
    }

    // --- Plugin Marketplace ---

    async searchPlugins(query: PluginSearchQuery, serverId: string): Promise<PluginSearchResult> {
        const params = new URLSearchParams({
            serverId,
            query: query.query || '',
            page: String(query.page || 1),
            limit: String(query.limit || 20),
            sort: query.sort || 'downloads',
        });
        if (query.category) params.set('category', query.category);
        if (query.source) params.set('source', query.source);
        if (query.gameVersion) params.set('gameVersion', query.gameVersion);

        const res = await fetch(`${API_URL}/plugins/search?${params}`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Search failed'); }
        return res.json();
    }

    async getInstalledPlugins(serverId: string): Promise<InstalledPlugin[]> {
        const res = await fetch(`${API_URL}/plugins/servers/${serverId}`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to fetch plugins'); }
        return res.json();
    }

    async installPlugin(serverId: string, sourceId: string, source: PluginSource): Promise<InstalledPlugin> {
        const res = await fetch(`${API_URL}/plugins/servers/${serverId}/install`, {
            method: 'POST',
            headers: { ...this.getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId, source })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Install failed'); }
        return res.json();
    }

    async uninstallPlugin(serverId: string, pluginId: string): Promise<void> {
        const res = await fetch(`${API_URL}/plugins/servers/${serverId}/${pluginId}`, {
            method: 'DELETE',
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Uninstall failed'); }
    }

    async togglePlugin(serverId: string, pluginId: string): Promise<InstalledPlugin> {
        const res = await fetch(`${API_URL}/plugins/servers/${serverId}/${pluginId}/toggle`, {
            method: 'PATCH',
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Toggle failed'); }
        return res.json();
    }

    async updatePlugin(serverId: string, pluginId: string): Promise<InstalledPlugin> {
        const res = await fetch(`${API_URL}/plugins/servers/${serverId}/${pluginId}/update`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Update failed'); }
        return res.json();
    }

    async checkPluginUpdates(serverId: string): Promise<PluginUpdateInfo[]> {
        const res = await fetch(`${API_URL}/plugins/servers/${serverId}/updates`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Update check failed'); }
        return res.json();
    }

    async getActivityHistory(serverId: string): Promise<any[]> {
        return this.get(`/api/servers/${serverId}/activity`);
    }

    async scanPlugins(serverId: string): Promise<InstalledPlugin[]> {
        const res = await fetch(`${API_URL}/plugins/servers/${serverId}/scan`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Scan failed'); }
        return res.json();
    }

    // --- Distributed Nodes ---

    async getNodes(): Promise<{ nodes: NodeInfo[]; total: number }> {
        const res = await fetch(`${API_URL}/nodes`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to fetch nodes'); }
        return res.json();
    }

    async getNode(nodeId: string): Promise<NodeInfo> {
        const res = await fetch(`${API_URL}/nodes/${nodeId}`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to get node'); }
        return res.json();
    }

    async enrollNode(data: { name: string; host: string; port: number; labels?: string[] }): Promise<NodeInfo> {
        const res = await fetch(`${API_URL}/nodes/enroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
            body: JSON.stringify(data)
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to enroll node'); }
        return res.json();
    }

    async preEnrollNode(data: { name: string; mode: string }): Promise<{ id: string; secret: string; token: string }> {
        const res = await fetch(`${API_URL}/nodes/enroll-wizard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
            body: JSON.stringify(data)
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to pre-enroll node'); }
        return res.json();
    }

    async removeNode(nodeId: string): Promise<void> {
        const res = await fetch(`${API_URL}/nodes/${nodeId}`, {
            method: 'DELETE',
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to remove node'); }
    }

    async getNodeHealth(nodeId: string): Promise<any> {
        const res = await fetch(`${API_URL}/nodes/${nodeId}/health`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to get node health'); }
        return res.json();
    }

    async checkForUpdates(force = false): Promise<any> {
        const res = await fetch(`${API_URL}/system/updates/check?force=${force}`, {
            headers: this.getAuthHeader()
        });
        if (!res.ok) throw new Error('Failed to check for updates');
        return res.json();
    }

    async getSystemStatus(): Promise<any> {
        const res = await fetch(`${API_URL}/status`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async getDiscordStatus(): Promise<any> {
        const res = await fetch(`${API_URL}/system/discord/status`, {
            headers: this.getAuthHeader()
        });
        return res.json();
    }

    async reconnectDiscord(): Promise<void> {
        const res = await fetch(`${API_URL}/system/discord/reconnect`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to reconnect Discord');
        }
    }

    async syncDiscordCommands(): Promise<void> {
        const res = await fetch(`${API_URL}/system/discord/sync`, {
            method: 'POST',
            headers: this.getAuthHeader()
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to sync Discord commands');
        }
    }

    // --- Safe System Updates ---

    async getUpdateStatus(): Promise<{ status: string; progress: number; currentStep?: string; error?: string; targetVersion?: string }> {
        // Note: The route in update.routes.ts is router.get('/status') mounted at /api/system/update
        // So the full URL is /api/system/update/status
        return this.get('/system/update/status');
    }

    async checkSystemUpdates(force: boolean = false): Promise<any> {
        // Route: POST /api/system/update/check
        // Note: The generic post helper handles /api prefix.
        // We pass { force } in body, although updated.routes.ts reads from query?
        // Let's check update.routes.ts again.
        // Line 135: const { force } = req.query;
        // So I should send it as query param in URL, not body.
        
        // Wait, line 14: router.post('/check' ...
        // Line 135: const { force } = req.query; 
        // This is a mismatch in my backend code? 
        // Usually POST uses body. But req.query works if I append query params.
        
        // Let's assume I fix backend or send query here.
        // I will use query params to be safe matching the backend implementation.
        return this.post(`/system/update/check?force=${force}`, {}); 
    }

    async downloadUpdate(version: string): Promise<any> {
        return this.post('/system/update/download', { version });
    }

    async restartSystem(): Promise<void> {
        // Using Generic post helper which does not await response if I don't want to?
        // Actually post awaited response.
        // My backend route sends response then exists.
        await this.post('/system/update/restart', {});
    }
}

export const API = new ApiService();
