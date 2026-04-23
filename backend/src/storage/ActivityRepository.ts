import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import { ActivityEvent } from '@shared/types';

class ActivityRepository implements StorageProvider<ActivityEvent> {
    private provider: StorageProvider<ActivityEvent>;
    private readonly MAX_HISTORY = 1000;

    constructor() {
        this.provider = StorageFactory.get<ActivityEvent>('activity_history', 'activity_history');
        this.init();
    }

    init() { return this.provider.init(); }

    public async rebind() {
        this.provider = StorageFactory.get<ActivityEvent>('activity_history', 'activity_history');
        await this.init();
    }

    findAll() { return this.provider.findAll(); }
    findById(id: string) { return this.provider.findById(id); }
    findOne(criteria: Partial<ActivityEvent>) { return this.provider.findOne(criteria); }
    create(item: ActivityEvent) { 
        const result = this.provider.create(item);
        this.prune();
        return result;
    }
    update(id: string, updates: Partial<ActivityEvent>) { return this.provider.update(id, updates); }
    saveAll(items: ActivityEvent[]) { return this.provider.saveAll(items); }
    delete(id: string) { return this.provider.delete(id); }

    /**
     * Get activity history for a specific server
     */
    public getHistory(serverId: string, limit: number = 30): ActivityEvent[] {
        return this.findAll()
            .filter(e => e.serverId === serverId)
            .sort((a, b) => b.timestamp - a.timestamp) // Newest first
            .slice(0, limit);
    }

    /**
     * Get aggregated global activity from all servers
     */
    public getGlobalHistory(limit: number = 50): ActivityEvent[] {
        return this.findAll()
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    /**
     * Prune global history to keep storage lean
     */
    private prune(): void {
        const all = this.findAll().sort((a, b) => b.timestamp - a.timestamp);
        if (all.length > this.MAX_HISTORY) {
            this.saveAll(all.slice(0, this.MAX_HISTORY));
        }
    }

    /**
     * Completely removes all activity for a server.
     * Use this when a server is DELETED.
     */
    public deleteForServer(serverId: string): void {
        const all = this.findAll();
        const filtered = all.filter(e => e.serverId !== serverId);
        if (filtered.length !== all.length) {
            this.saveAll(filtered);
        }
    }
}

export const activityRepository = new ActivityRepository();
