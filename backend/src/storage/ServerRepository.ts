import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import {  ServerConfig  } from '@shared/types';
// import { systemSettingsService } from '../features/system/SystemSettingsService'; // No longer needed directly here

export class ServerRepository implements StorageProvider<ServerConfig> {
    private provider: StorageProvider<ServerConfig>;

    constructor() {
        this.provider = StorageFactory.get<ServerConfig>('servers');
        this.init(); // Auto-initialize for SQLite migration/tables
    }

    init() { return this.provider.init(); }

    public async rebind() {
        this.provider = StorageFactory.get<ServerConfig>('servers');
        await this.init();
    }
    
    public findAll(): ServerConfig[] {
        const data = this.provider.findAll();
        if (!Array.isArray(data)) return [];
        return data.map(s => this.sanitizeServerConfig(s));
    }

    public findById(id: string): ServerConfig | undefined {
        const item = this.provider.findById(id);
        if (!item) return undefined;
        return this.sanitizeServerConfig(item);
    }

    findOne(criteria: Partial<ServerConfig>) { 
        const item = this.provider.findOne(criteria); 
        if (!item) return undefined;
        return this.sanitizeServerConfig(item);
    }

    create(item: ServerConfig) { 
        const sanitized = this.sanitizeServerConfig(item);
        return this.provider.create(sanitized); 
    }

    update(id: string, updates: Partial<ServerConfig>) { 
        return this.provider.update(id, updates); 
    }

    delete(id: string) { return this.provider.delete(id); }

    saveAll(items: ServerConfig[]) { return this.provider.saveAll(items); }

    /**
     * Data Healing Layer (v1.7.11)
     * Automatically repairs missing or corrupted field defaults.
     */
    private sanitizeServerConfig(server: ServerConfig): ServerConfig {
        const sanitized = { ...server };

        // 1. Executable Fallback (v1.10.1: Added Bedrock support)
        const isBedrock = sanitized.software === 'Bedrock';
        const isJavaExe = sanitized.executable === 'server.jar';
        
        if (!sanitized.executable || sanitized.executable === 'undefined' || sanitized.executable === 'null' || (isBedrock && isJavaExe)) {
            if (isBedrock) {
                sanitized.executable = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
            } else if (sanitized.software === 'Velocity') {
                sanitized.executable = 'velocity.jar';
            } else if (sanitized.software === 'Purpur' || sanitized.software === 'Paper') {
                sanitized.executable = 'server.jar';
            } else {
                sanitized.executable = 'server.jar';
            }
        }

        // 2. Resource Defaults
        if (sanitized.ram === undefined || sanitized.ram === null || isNaN(sanitized.ram)) {
            sanitized.ram = 4;
        }

        // 3. Command Regeneration (If missing, empty, or Java-ism for Bedrock)
        const isJavaCommand = sanitized.executionCommand?.includes('java') || sanitized.executionCommand === 'server.jar';
        
        if (!sanitized.executionCommand || sanitized.executionCommand.trim().length === 0 || (isBedrock && isJavaCommand)) {
            if (isBedrock) {
                const exe = sanitized.executable;
                sanitized.executionCommand = process.platform === 'win32' ? exe : `LD_LIBRARY_PATH=. ./${exe}`;
            } else {
                sanitized.executionCommand = `java -Xmx${sanitized.ram}G -jar ${sanitized.executable} nogui`;
            }
        }

        // 4. Critical Navigation Fields
        if (!sanitized.workingDirectory) {
            sanitized.workingDirectory = `C:/servers/${sanitized.id}`;
        }

        return sanitized;
    }

    // Specific queries
    public findByPort(port: number): ServerConfig | undefined {
        return this.findOne({ port });
    }

    // Member management (scoping logic moved from routes to repository)

    public async getMembers(serverId: string) {
        // Dynamic import to avoid potential circular dependency with UserRepository
        const { userRepository } = await import('./UserRepository');
        const users = userRepository.findAll();
        
        // Return users who have an explicit ACL entry for this server
        return users
            .filter(u => u.serverAcl && u.serverAcl[serverId])
            .map(u => ({
                id: u.id,
                email: u.email,
                role: u.role // Use global role for UI display
            }));
    }

    public async addMember(serverId: string, email: string, role: string) {
        const { userRepository } = await import('./UserRepository');
        const user = userRepository.findByEmail(email);
        if (!user) throw new Error('User not found');

        const serverAcl = user.serverAcl || {};
        
        // Initialize or update ACL. Permissions are usually inherited from role,
        // but we ensure the entry exists to mark membership.
        serverAcl[serverId] = serverAcl[serverId] || { allow: [], deny: [] };
        
        // If the user's global role is lower than the desired role, we might need 
        // to handle permission mapping here, but for now we just link the user.
        
        await userRepository.update(user.id, { serverAcl });
    }

    public async removeMember(serverId: string, userId: string) {
        const { userRepository } = await import('./UserRepository');
        const user = userRepository.findById(userId);
        if (!user) return;

        const serverAcl = user.serverAcl || {};
        delete serverAcl[serverId];
        
        await userRepository.update(userId, { serverAcl });
    }
}

export const serverRepository = new ServerRepository();
