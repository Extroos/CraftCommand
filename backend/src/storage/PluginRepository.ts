import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import {  InstalledPlugin  } from '@shared/types';

class PluginRepository implements StorageProvider<InstalledPlugin> {
    private provider: StorageProvider<InstalledPlugin>;

    constructor() {
        this.provider = StorageFactory.get<InstalledPlugin>('plugins');
        this.init();
    }

    init() { return this.provider.init(); }

    public async rebind() {
        this.provider = StorageFactory.get<InstalledPlugin>('plugins');
        await this.init();
    }
    findAll() { return this.provider.findAll(); }
    findById(id: string) { return this.provider.findById(id); }
    findOne(criteria: Partial<InstalledPlugin>) { return this.provider.findOne(criteria); }
    create(item: InstalledPlugin) { return this.provider.create(item); }
    update(id: string, updates: Partial<InstalledPlugin>) { return this.provider.update(id, updates); }
    delete(id: string) { return this.provider.delete(id); }
    saveAll(items: InstalledPlugin[]) { return this.provider.saveAll(items); }

    /**
     * Get all installed plugins for a specific server.
     */
    findByServer(serverId: string): InstalledPlugin[] {
        return this.findAll().filter(p => p.serverId === serverId);
    }

    /**
     * Find a plugin by its external source ID and server.
     */
    findBySourceId(sourceId: string, serverId: string): InstalledPlugin | undefined {
        return this.findAll().find(p => p.sourceId === sourceId && p.serverId === serverId);
    }

    /**
     * Find a plugin by its filename on a server.
     */
    findByFileName(fileName: string, serverId: string): InstalledPlugin | undefined {
        return this.findAll().find(p => 
            (p.fileName === fileName || p.fileName === `${fileName}.disabled`) && p.serverId === serverId
        );
    }
}

export const pluginRepository = new PluginRepository();
