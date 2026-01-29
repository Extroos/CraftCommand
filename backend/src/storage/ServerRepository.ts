import { StorageProvider } from './StorageProvider';
import { GenericJsonProvider } from './JsonRepository';
import { SqliteProvider } from './SqliteProvider';
import { ServerConfig } from '../../../shared/types';
import { systemSettingsService } from '../services/system/SystemSettingsService';

export class ServerRepository implements StorageProvider<ServerConfig> {
    private provider: StorageProvider<ServerConfig>;

    constructor() {
        const settings = systemSettingsService.getSettings();
        // Check for provider setting, default to JSON if not present or 'json'
        // We might need to add 'storageProvider' to SystemSettings first, or read generic 'app' config.
        // For now, let's look for a flag or default to JSON.
        const useSqlite = (settings.app as any).storageProvider === 'sqlite';

        if (useSqlite) {
            console.log('[ServerRepository] Using SQLite Storage');
            this.provider = new SqliteProvider<ServerConfig>('servers.db', 'servers');
        } else {
            console.log('[ServerRepository] Using JSON Storage');
            this.provider = new GenericJsonProvider<ServerConfig>('servers.json');
        }
    }

    init() { return this.provider.init(); }
    findAll() { return this.provider.findAll(); }
    findById(id: string) { return this.provider.findById(id); }
    findOne(criteria: Partial<ServerConfig>) { return this.provider.findOne(criteria); }
    create(item: ServerConfig) { return this.provider.create(item); }
    update(id: string, updates: Partial<ServerConfig>) { return this.provider.update(id, updates); }
    delete(id: string) { return this.provider.delete(id); }

    // Specific queries
    public findByPort(port: number): ServerConfig | undefined {
        return this.findOne({ port });
    }
}

export const serverRepository = new ServerRepository();
