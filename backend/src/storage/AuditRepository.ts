import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import {  AuditLog  } from '@shared/types';

export class AuditRepository implements StorageProvider<AuditLog> {
    private provider: StorageProvider<AuditLog>;

    constructor() {
        this.provider = StorageFactory.get<AuditLog>('audit');
        this.init();
    }

    init() { return this.provider.init(); }
    findAll() { return this.provider.findAll(); }
    findById(id: string) { return this.provider.findById(id); }
    findOne(criteria: Partial<AuditLog>) { return this.provider.findOne(criteria); }
    create(item: AuditLog) { return this.provider.create(item); }
    update(id: string, updates: Partial<AuditLog>) { return this.provider.update(id, updates); }
    delete(id: string) { return this.provider.delete(id); }
    saveAll(items: AuditLog[]) { return this.provider.saveAll(items); }

    public async add(entry: AuditLog) {
        // We use create for consistency. 
        // Note: Capping logic could be done here, but unshift is easier in memory.
        // For SQLite, we should probably delete oldest if count > 5000.
        this.create(entry);
        
        // Background pruning (Async-ish)
        const all = this.findAll();
        if (all.length > 5000) {
            const sorted = all.sort((a, b) => b.timestamp - a.timestamp);
            const toKeep = sorted.slice(0, 5000);
            this.saveAll(toKeep);
        }
    }

    public getLogs(options: { 
        limit?: number, 
        offset?: number, 
        action?: string, 
        userId?: string, 
        resourceId?: string, 
        search?: string,
        startDate?: string,
        endDate?: string
    } = {}): { logs: AuditLog[], total: number } {
        let filtered = this.findAll().sort((a, b) => b.timestamp - a.timestamp);

        if (options.action) {
            filtered = filtered.filter(l => l.action === options.action);
        }
        if (options.userId) {
            const uid = options.userId.toLowerCase();
            filtered = filtered.filter(l => 
                l.userId.toLowerCase() === uid || 
                (l.userEmail && l.userEmail.toLowerCase().includes(uid))
            );
        }
        if (options.resourceId) {
            filtered = filtered.filter(l => l.resourceId === options.resourceId);
        }
        if (options.search) {
            const s = options.search.toLowerCase();
            filtered = filtered.filter(l => 
                l.action.toLowerCase().includes(s) ||
                (l.userEmail && l.userEmail.toLowerCase().includes(s)) ||
                (l.resourceId && l.resourceId.toLowerCase().includes(s)) ||
                (l.metadata && JSON.stringify(l.metadata).toLowerCase().includes(s))
            );
        }

        if (options.startDate) {
            const start = new Date(options.startDate).getTime();
            if (!isNaN(start)) filtered = filtered.filter(l => l.timestamp >= start);
        }
        if (options.endDate) {
            const end = new Date(options.endDate).getTime();
            // inclusive of the end date till 23:59:59
            if (!isNaN(end)) filtered = filtered.filter(l => l.timestamp <= end + 86399999);
        }

        const total = filtered.length;
        const limit = options.limit || 100;
        const offset = options.offset || 0;

        return {
            logs: filtered.slice(offset, offset + limit),
            total
        };
    }
}

export const auditRepository = new AuditRepository();
