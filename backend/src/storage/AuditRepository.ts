import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import {  AuditLog  } from '@shared/types';
import { logger } from '../utils/logger';

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

    private addCount = 0;
    private readonly MAX_LOGS = 5000;
    private readonly PRUNE_THRESHOLD = 100;

    public async add(entry: AuditLog) {
        this.create(entry);
        this.addCount++;

        // --- BACKGROUND PRUNING (v1.16.0) ---
        // Only run prune every 100 logs to minimize IO/CPU overhead
        if (this.addCount >= this.PRUNE_THRESHOLD) {
            this.addCount = 0;
            this.prune();
        }
    }

    /**
     * Optimized FIFO pruning for system stability.
     */
    private prune() {
        try {
            const all = this.findAll();
            if (all.length > this.MAX_LOGS) {
                logger.info(`[AuditRepository] Pruning audit history (${all.length} -> ${this.MAX_LOGS})`);
                const sorted = all.sort((a, b) => b.timestamp - a.timestamp);
                const toKeep = sorted.slice(0, this.MAX_LOGS);
                this.saveAll(toKeep);
            }
        } catch (e) {
            logger.error(`[AuditRepository] Pruning failed: ${e.message}`);
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
