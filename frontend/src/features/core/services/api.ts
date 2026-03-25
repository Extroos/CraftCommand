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
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

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

    async patch(path: string, body: any): Promise<any> {
        const fullPath = path.startsWith(API_URL) ? path : `${API_URL}${path}`;
        const res = await fetch(fullPath, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `PATCH ${fullPath} failed: ${res.status}`);
        }
        return res.json();
    }

    async put(path: string, body: any): Promise<any> {
        const fullPath = path.startsWith(API_URL) ? path : `${API_URL}${path}`;
        const res = await fetch(fullPath, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeader()
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `PUT ${fullPath} failed: ${res.status}`);
        }
        return res.json();
    }

    async delete(path: string, body?: any): Promise<any> {
        const fullPath = path.startsWith(API_URL) ? path : `${API_URL}${path}`;
        const res = await fetch(fullPath, {
            method: 'DELETE',
            headers: {
                ...this.getAuthHeader(),
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `DELETE ${fullPath} failed: ${res.status}`);
        }
        return res.json();
    }

    // --- Server Management ---

    async getServers(): Promise<ServerConfig[]> {
        return this.get('/servers');
    }

    async createServer(config: Partial<ServerConfig>): Promise<ServerConfig> {
        return this.post('/servers', config);
    }

    async importLocal(name: string, path: string, config: Partial<ServerConfig> = {}): Promise<ServerConfig> {
        return this.post('/servers/import/local', { name, path, config });
    }

    async analyzeLocal(path: string): Promise<ImportAnalysis> {
        return this.post('/servers/import/analyze-local', { path });
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
        await this.post(`/servers/${id}/start`, { force }).catch(err => {
            // Re-throw if it's already an error from post, but startServer expected more metadata.
            // Since the original code had very specific error metadata, I'll keep it as a raw fetch
            // OR I can improve the helpers. For now, I'll keep this one as raw fetch to NOT break logic.
            throw err;
        });
    }

    async stopServer(id: string): Promise<void> {
        await this.post(`/servers/${id}/stop`, {});
    }

    async gracefulStopServer(id: string, delay: number = 30): Promise<{ delay: number; message: string }> {
        return this.post(`/servers/${id}/stop/graceful`, { delay });
    }

    async cancelGracefulStop(id: string): Promise<void> {
        await this.post(`/servers/${id}/stop/cancel`, {});
    }
    
    // --- File Management ---
    
    async getFiles(id: string, path: string = '.'): Promise<any[]> {
        return this.get(`/servers/${id}/files?path=${encodeURIComponent(path)}`);
    }
    
    // --- System & Install ---
    

    async getJavaVersions(): Promise<any[]> {
        return this.get('/system/java');
    }

    async getBedrockVersions(): Promise<{ latest: string, versions: string[] }> {
        return this.get('/system/bedrock/versions');
    }
    
    async getSystemStats(): Promise<any> {
        return this.get('/system/stats');
    }

    async getSystemHealth(): Promise<any> {
        return this.get('/system/health');
    }

    // --- Global Webhooks ---

    async getGlobalWebhooks(): Promise<any[]> {
        return this.get('/system/webhooks');
    }

    async createGlobalWebhook(webhook: any): Promise<any> {
        return this.post('/system/webhooks', webhook);
    }

    async deleteGlobalWebhook(id: string): Promise<void> {
        await this.delete(`/system/webhooks/${id}`);
    }

    async updateGlobalWebhook(id: string, webhook: any): Promise<any> {
        return this.put(`/system/webhooks/${id}`, webhook);
    }

    async testGlobalWebhook(id: string): Promise<any> {
        return this.post(`/system/webhooks/${id}/test`, {});
    }

    // --- API Tokens ---

    async getApiTokens(): Promise<any[]> {
        return this.get('/system/tokens');
    }

    async createApiToken(name: string, scopes: string[]): Promise<any> {
        return this.post('/system/tokens', { name, scopes });
    }

    async deleteApiToken(id: string): Promise<void> {
        await this.delete(`/system/tokens/${id}`);
    }

    async getDockerStatus(): Promise<{ online: boolean, version?: string, error?: string }> {
        return this.get('/system/docker/status');
    }

    async getServerStatus(id: string): Promise<any> {
        return this.get(`/servers/${id}/query`);
    }

    async getServerStats(id: string): Promise<any> {
        return this.get(`/servers/${id}/stats`);
    }

    async installServer(id: string, type: 'paper'|'modpack'|'vanilla'|'fabric'|'forge'|'spigot'|'neoforge'|'purpur'|'bedrock'|'velocity', data: any): Promise<void> {
        await this.post(`/servers/${id}/install`, { type, ...data });
    }
    
    async deleteServer(id: string): Promise<void> {
        await this.delete(`/servers/${id}`);
    }

    async fixNodeCapability(nodeId: string, capability: string): Promise<{ ok: boolean, message?: string }> {
        return this.post(`/nodes/${nodeId}/fix`, { capability });
    }

    async shutdownNode(nodeId: string): Promise<void> {
        await this.post(`/nodes/${nodeId}/shutdown`, {});
    }

    // --- Proxy Networking ---

    async linkServerToProxy(proxyId: string, backendId: string, alias: string): Promise<void> {
        await this.post('/network/proxy/link', { proxyId, backendId, alias });
    }

    async unlinkServerFromProxy(proxyId: string, backendId: string): Promise<void> {
        await this.post('/network/proxy/unlink', { proxyId, backendId });
    }

    async unlinkProxyByServer(serverId: string): Promise<void> {
        await this.post('/network/proxy/unlink-by-server', { serverId });
    }

    async installViaSuite(proxyId: string): Promise<void> {
        await this.post('/network/proxy/install-via-suite', { proxyId });
    }
    
    async searchFiles(id: string, query: string, dir: string = '.', content: boolean = false): Promise<any[]> {
        return this.get(`/servers/${id}/files/search?query=${encodeURIComponent(query)}&dir=${encodeURIComponent(dir)}&content=${content}`);
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
        await this.post(`/servers/${id}/files/extract`, { filePath });
    }

    async downloadFile(id: string, path: string): Promise<void> {
        // Trigger direct browser download with authentication
        const url = `${API_URL}/servers/${id}/files/download?path=${encodeURIComponent(path)}`;
        const res = await fetch(url, {
            headers: this.getAuthHeader()
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to initialize download');
        }

        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        
        // Try to get filename from content-disposition
        const disposition = res.headers.get('Content-Disposition');
        let filename = path.split('/').pop() || 'download';
        if (disposition && disposition.includes('filename=')) {
            filename = disposition.split('filename=')[1].replace(/['"]/g, '');
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
    }

    async fileExists(id: string, path: string): Promise<boolean> {
        const data = await this.get(`/servers/${id}/files/exists?path=${encodeURIComponent(path)}`).catch(() => ({ exists: false }));
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
        await this.post(`/servers/${id}/files/folder`, { path });
    }

    async deleteFiles(id: string, paths: string[]): Promise<void> {
        await this.post(`/servers/${id}/files/delete-bulk`, { paths });
    }

    async moveFile(id: string, source: string, dest: string): Promise<void> {
        await this.post(`/servers/${id}/files/move`, { source, dest });
    }

    async archiveFiles(id: string, paths: string[], archiveName: string): Promise<void> {
        await this.post(`/servers/${id}/files/archive`, { paths, archiveName });
    }

    // --- Databases ---

    async getDatabases(id: string): Promise<any[]> {
        return this.get(`/servers/${id}/databases`);
    }

    async createDatabase(id: string, data: { name: string, type: string, host: string }): Promise<any> {
        return this.post(`/servers/${id}/databases`, data);
    }

    async deleteDatabase(serverId: string, dbId: string): Promise<void> {
        await this.delete(`/servers/${serverId}/databases/${dbId}`);
    }

    async rotateDatabasePassword(serverId: string, dbId: string): Promise<{ password: string }> {
        return this.post(`/servers/${serverId}/databases/${dbId}/rotate`, {});
    }

    // --- Server Members ---

    async getServerMembers(id: string): Promise<any[]> {
        return this.get(`/servers/${id}/members`);
    }

    async addServerMember(id: string, email: string, role: string): Promise<any> {
        return this.post(`/servers/${id}/members`, { email, role });
    }

    async getServerPorts(id: string): Promise<any[]> {
        return this.get(`/servers/${id}/ports`);
    }

    async assignServerPort(id: string): Promise<any> {
        return this.post(`/servers/${id}/ports`, {});
    }

    async rotateServerPort(serverId: string, portId: string): Promise<any> {
        return this.patch(`/servers/${serverId}/ports/${portId}/rotate`, {});
    }

    async resetSftpPassword(serverId: string): Promise<any> {
        return this.post(`/servers/${serverId}/sftp/reset`, {});
    }

    async removeServerMember(serverId: string, userId: string): Promise<void> {
        await this.delete(`/servers/${serverId}/members/${userId}`);
    }

    // --- Backups ---

    async createBackup(id: string, description?: string, worldOnly?: boolean): Promise<any> {
        return this.post(`/servers/${id}/backups`, { description, worldOnly });
    }

    async getBackups(id: string): Promise<any[]> {
        return this.get(`/servers/${id}/backups`);
    }

    async restoreBackup(id: string, backupId: string, worldOnly?: boolean): Promise<void> {
        await this.post(`/servers/${id}/backups/${backupId}/restore`, { worldOnly });
    }

    async deleteBackup(id: string, backupId: string): Promise<void> {
        await this.delete(`/servers/${id}/backups/${backupId}`);
    }

    async downloadBackup(id: string, backupId: string): Promise<void> {
        // Trigger direct browser download
        window.open(`${API_URL}/servers/${id}/backups/${backupId}/download`, '_blank');
    }

    async toggleBackupLock(id: string, backupId: string): Promise<{ success: boolean, locked: boolean }> {
        return this.post(`/servers/${id}/backups/${backupId}/lock`, {});
    }

    // --- Schedules ---

    async getSchedules(id: string): Promise<any[]> {
        return this.get(`/servers/${id}/schedules`);
    }

    async getScheduleHistory(id: string): Promise<any[]> {
        return this.get(`/servers/${id}/schedules/history`);
    }

    async createSchedule(id: string, task: any): Promise<void> {
        await this.post(`/servers/${id}/schedules`, task);
    }

    async updateSchedule(id: string, task: any): Promise<void> {
        await this.put(`/servers/${id}/schedules/${task.id}`, task);
    }

    async deleteSchedule(id: string, taskId: string): Promise<void> {
        await this.delete(`/servers/${id}/schedules/${taskId}`);
    }

    async runScheduleNow(id: string, taskId: string): Promise<void> {
        await this.post(`/servers/${id}/schedules/${taskId}/run`, {});
    }

    async getLogs(id: string): Promise<string[]> {
        return this.get(`/servers/${id}/logs`);
    }

    async downloadServerLog(id: string): Promise<void> {
        // Trigger direct browser download
        const url = `${API_URL}/servers/${id}/logs/download`;
        const res = await fetch(url, {
            headers: this.getAuthHeader()
        });

        if (!res.ok) {
            throw new Error('Failed to download server log');
        }

        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `server-${id}-latest.log`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
    }

    async getCrashReport(id: string): Promise<any> {
        return this.get(`/servers/${id}/crash-report`);
    }

    async runDiagnosis(id: string): Promise<any> {
        return this.get(`/servers/${id}/diagnosis`);
    }

    async healServer(id: string, type: string, payload: any = {}): Promise<void> {
        await this.post(`/servers/${id}/heal`, { type, payload });
    }

    async resetStabilityMarker(id: string): Promise<void> {
        await this.post(`/servers/${id}/health/reset`, {});
    }

    async updateServer(id: string, updates: any): Promise<void> {
        await this.patch(`/servers/${id}`, updates);
    }

    async cloneServer(id: string, name?: string): Promise<any> {
        return this.post(`/servers/${id}/clone`, { name });
    }

    async checkConfigSync(id: string): Promise<SyncReport> {
        return this.get(`/servers/${id}/config/check`);
    }

    async syncConfig(id: string): Promise<void> {
        await this.post(`/servers/${id}/config/sync`, {});
    }

    // --- Players ---

    async getPlayers(id: string, type: string): Promise<any[]> {
        return this.get(`/servers/${id}/players/${type}`);
    }

    async addPlayer(id: string, type: string, identifier: string): Promise<any> {
        return this.post(`/servers/${id}/players/${type}`, { identifier });
    }

    async removePlayer(id: string, type: string, identifier: string): Promise<any> {
        return this.delete(`/servers/${id}/players/${type}/${identifier}`);
    }

    async kickPlayer(id: string, name: string, reason?: string): Promise<void> {
        await this.post(`/servers/${id}/kick-player`, { name, reason });
    }

    // --- User ---

    // --- User & Auth ---

    async getCurrentUser(): Promise<UserProfile> {
        return this.get('/auth/me');
    }

    async getUsers(): Promise<UserProfile[]> {
        return this.get('/auth/users');
    }

    async createUser(data: any): Promise<UserProfile> {
        return this.post('/auth/users', data);
    }

    async deleteUser(id: string): Promise<void> {
        await this.delete(`/auth/users/${id}`);
    }

    async updateUser(updates: Partial<UserProfile>): Promise<UserProfile> {
        return this.patch('/auth/me', updates);
    }

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        await this.post('/auth/change-password', { currentPassword, newPassword });
    }

    async rotateApiKey(): Promise<{ apiKey: string }> {
        return this.post('/auth/rotate-api-key', {});
    }

    async updateUserAdmin(id: string, updates: Partial<UserProfile>): Promise<UserProfile> {
        return this.patch(`/auth/users/${id}`, updates);
    }

    async login(email: string, password: string): Promise<{ success: boolean, user: UserProfile, token: string, twoFactorRequired?: boolean }> {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const error = new Error(data.error || `Login failed: ${res.status}`);
            (error as any).status = res.status;
            throw error;
        }
        
        const data = await res.json();
        return { 
            success: true, 
            user: data.user, 
            token: data.token, 
            twoFactorRequired: data.twoFactorRequired 
        };
    }

    async verify2FA(code: string, loginToken: string, isRecovery: boolean = false): Promise<{ success: boolean, token?: string, user?: UserProfile }> {
        return this.post('/auth/2fa/verify', { code, loginToken, isRecovery }).catch(() => ({ success: false }));
    }

    async start2FASetup(): Promise<{ qrCode: string, secret: string }> {
        return this.post('/auth/2fa/setup/start', {});
    }

    async confirm2FASetup(code: string): Promise<{ backupCodes: string[] }> {
        return this.post('/auth/2fa/setup/confirm', { code });
    }

    async disable2FA(password: string, code: string): Promise<void> {
        await this.post('/auth/2fa/disable', { password, code });
    }

    // --- Notifications ---

    async getNotifications(limit: number = 50, unreadOnly?: boolean): Promise<any[]> {
        const query = new URLSearchParams({ limit: limit.toString() });
        if (unreadOnly) query.append('unreadOnly', 'true');
        return this.get(`/notifications?${query.toString()}`);
    }

    async markNotificationRead(id: string): Promise<void> {
        await this.post(`/notifications/${id}/read`, {});
    }

    async markAllNotificationsRead(): Promise<void> {
        await this.post('/notifications/read-all', {});
    }

    async deleteNotification(id: string): Promise<void> {
        await this.delete(`/notifications/${id}`);
    }

    async getSystemCache(): Promise<{ java: { size: number, count: number }, temp: { size: number, count: number } }> {
        return this.get('/system/cache');
    }

    async clearSystemCache(type: 'java' | 'temp'): Promise<void> {
        await this.post('/system/cache/clear', { type });
    }

    async checkSystemUpdates(force: boolean = false): Promise<any> {
        return this.post(`/system/update/check?force=${force}`, {});
    }

    async getTemplates(): Promise<ServerTemplate[]> {
        return this.get('/templates');
    }

    async installTemplate(serverId: string, templateId: string, options: { customUrl?: string } = {}): Promise<void> {
        await this.post('/templates/install', { serverId, templateId, options });
    }

    // --- Server Profiles ---

    async exportProfile(serverId: string): Promise<void> {
        const res = await fetch(`${API_URL}/profiles/${serverId}/export`, {
            headers: this.getAuthHeader()
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

    async validateProfile(profile: any): Promise<{ valid: boolean, profile?: any, error?: string }> {
        return this.post('/profiles/validate', profile);
    }

    // --- Webhooks (Extensions) ---

    async getWebhooks(serverId: string): Promise<any[]> {
        return this.get(`/webhooks/servers/${serverId}`);
    }

    async createWebhook(serverId: string, webhook: any): Promise<any> {
        return this.post(`/webhooks/servers/${serverId}`, webhook);
    }

    async updateWebhook(webhook: any): Promise<any> {
        return this.put(`/webhooks/${webhook.id}`, webhook);
    }

    async deleteWebhook(webhookId: string): Promise<void> {
        await this.delete(`/webhooks/${webhookId}`);
    }

    async testWebhook(webhookId: string): Promise<{ success: boolean, status: number }> {
        return this.post(`/webhooks/${webhookId}/test`, {});
    }
    
    // --- Audit Logs ---
    
    async getAuditLogs(options: { 
        limit?: number, 
        offset?: number, 
        action?: string, 
        userId?: string, 
        search?: string,
        startDate?: string,
        endDate?: string
    } = {}): Promise<{ logs: any[], total: number }> {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit.toString());
        if (options.offset) params.append('offset', options.offset.toString());
        if (options.action) params.append('action', options.action);
        if (options.userId) params.append('userId', options.userId);
        if (options.search) params.append('search', options.search);
        if (options.startDate) params.append('startDate', options.startDate);
        if (options.endDate) params.append('endDate', options.endDate);

        return this.get(`/system/audit?${params.toString()}`);
    }


    // Global Settings
    async getGlobalSettings(): Promise<GlobalSettings> {
        return this.get('/settings/global');
    }

    async updateGlobalSettings(settings: Partial<GlobalSettings>): Promise<void> {
        await this.put('/settings/global', settings);
    }

    // --- Dynmap Integration ---
    async getMapStatus(serverId: string): Promise<{ installed: boolean; port: number | null; verified: boolean; error?: string; internalUrl?: string }> {
        return this.get(`/servers/${serverId}/map/status`);
    }

    async verifyMap(serverId: string): Promise<{ verified: boolean; error?: string }> {
        return this.post(`/servers/${serverId}/map/verify`, {});
    }

    async installMap(serverId: string): Promise<any> {
        return this.post(`/servers/${serverId}/map/install`, {});
    }

    async renderMap(serverId: string, mode: 'update' | 'full' | 'radius' = 'update', radius?: number): Promise<{ success: boolean }> {
        return this.post(`/servers/${serverId}/map/render`, { mode, radius });
    }

    // --- Remote Access ---
    async getRemoteAccessStatus(): Promise<{ enabled: boolean, method?: string, bindAddress: string }> {
        return this.get('/system/remote-access/status');
    }

    async enableRemoteAccess(method: 'vpn' | 'proxy' | 'direct'): Promise<void> {
        await this.post('/system/remote-access/enable', { method });
    }

    async disableRemoteAccess(): Promise<void> {
        await this.post('/system/remote-access/disable', {});
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

        return this.get(`/plugins/search?${params.toString()}`);
    }

    async getInstalledPlugins(serverId: string): Promise<InstalledPlugin[]> {
        return this.get(`/plugins/servers/${serverId}`);
    }

    async installPlugin(serverId: string, sourceId: string, source: PluginSource): Promise<InstalledPlugin> {
        return this.post(`/plugins/servers/${serverId}/install`, { sourceId, source });
    }

    async uninstallPlugin(serverId: string, pluginId: string): Promise<void> {
        await this.delete(`/plugins/servers/${serverId}/${pluginId}`);
    }

    async togglePlugin(serverId: string, pluginId: string): Promise<InstalledPlugin> {
        return this.patch(`/plugins/servers/${serverId}/${pluginId}/toggle`, {});
    }

    async updatePlugin(serverId: string, pluginId: string): Promise<InstalledPlugin> {
        return this.post(`/plugins/servers/${serverId}/${pluginId}/update`, {});
    }

    async bulkUpdatePlugins(serverId: string, pluginIds: string[]): Promise<Array<{ pluginId: string; success: boolean; error?: string }>> {
        return this.post(`/plugins/servers/${serverId}/bulk-update`, { pluginIds });
    }

    async checkPluginUpdates(serverId: string): Promise<PluginUpdateInfo[]> {
        return this.get(`/plugins/servers/${serverId}/updates`);
    }

    async getActivityHistory(serverId: string): Promise<any[]> {
        return this.get(`/servers/${serverId}/activity`);
    }

    async scanPlugins(serverId: string): Promise<InstalledPlugin[]> {
        return this.get(`/plugins/servers/${serverId}/scan`);
    }

    // --- Distributed Nodes ---

    async getNodes(): Promise<{ nodes: NodeInfo[]; total: number }> {
        return this.get('/nodes');
    }

    async getNode(nodeId: string): Promise<NodeInfo> {
        return this.get(`/nodes/${nodeId}`);
    }

    async enrollNode(data: { name: string; host: string; port: number; labels?: string[] }): Promise<NodeInfo> {
        return this.post('/nodes/enroll', data);
    }

    async preEnrollNode(data: { name: string; mode: string }): Promise<{ id: string; secret: string; token: string }> {
        return this.post('/nodes/enroll-wizard', data);
    }

    async removeNode(nodeId: string): Promise<void> {
        await this.delete(`/nodes/${nodeId}`);
    }

    async getNodeHealth(nodeId: string): Promise<any> {
        return this.get(`/nodes/${nodeId}/health`);
    }


    async getSystemStatus(): Promise<any> {
        return this.get('/status');
    }

    async getDiscordStatus(): Promise<any> {
        return this.get('/system/discord/status');
    }

    async reconnectDiscord(): Promise<void> {
        await this.post('/system/discord/reconnect', {});
    }

    async syncDiscordCommands(): Promise<void> {
        await this.post('/system/discord/sync-commands', {});
    }

    // --- Safe System Updates ---

    // --- Cloud Backup Destinations ---

    async getCloudDestinations(): Promise<any[]> {
        return this.get('/servers/cloud-destinations');
    }

    async addCloudDestination(destination: any): Promise<any[]> {
        return this.post('/servers/cloud-destinations', destination);
    }

    async testCloudDestination(destination: any): Promise<{ success: boolean; message: string }> {
        return this.post('/servers/cloud-destinations/test', destination);
    }

    async deleteCloudDestination(name: string): Promise<any[]> {
        return this.delete(`/servers/cloud-destinations/${encodeURIComponent(name)}`);
    }

    // --- Update System ---

    async getUpdateStatus(): Promise<{ status: string; progress: number; currentStep?: string; error?: string; targetVersion?: string }> {
        return this.get('/system/update/status');
    }


    async downloadUpdate(version: string): Promise<any> {
        return this.post('/system/update/download', { version });
    }


    async restartSystem(): Promise<void> {
        await this.post('/system/update/restart', {});
    }
}

export const API = new ApiService();
