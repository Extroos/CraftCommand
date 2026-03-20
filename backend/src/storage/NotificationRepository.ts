import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import {  Notification  } from '@shared/types';

class NotificationRepository implements StorageProvider<Notification> {
    private provider: StorageProvider<Notification>;

    constructor() {
        this.provider = StorageFactory.get<Notification>('notifications');
        this.init(); // Auto-initialize for SQLite migration/tables
    }

    init() { return this.provider.init(); }

    public async rebind() {
        this.provider = StorageFactory.get<Notification>('notifications');
        await this.init();
    }
    findAll() { return this.provider.findAll(); }
    findById(id: string) { return this.provider.findById(id); }
    findOne(criteria: Partial<Notification>) { return this.provider.findOne(criteria); }
    create(item: Notification) { return this.provider.create(item); }
    update(id: string, updates: Partial<Notification>) { return this.provider.update(id, updates); }
    saveAll(items: Notification[]) { return this.provider.saveAll(items); }

    public delete(id: string): boolean {
        const notification = this.findById(id);
        if (notification && notification.dismissible === false) {
            return false; // Cannot delete
        }
        return this.provider.delete(id);
    }

    public getForUser(userId: string, options: { limit?: number, unreadOnly?: boolean } = {}): Notification[] {
        let notifications = this.findAll().filter(n => n.userId === userId || n.userId === 'ALL');
        
        if (options.unreadOnly) {
            notifications = notifications.filter(n => !n.read);
        }

        notifications.sort((a, b) => b.createdAt - a.createdAt);

        if (options.limit) {
            notifications = notifications.slice(0, options.limit);
        }

        return notifications;
    }

    public getUnreadCount(userId: string): number {
        return this.getForUser(userId).filter(n => !n.read).length;
    }

    public markAsRead(id: string): void {
        const notification = this.findById(id);
        if (notification) {
            this.update(id, { read: true });
        }
    }

    public markAllAsRead(userId: string): void {
        const notifications = this.findAll();
        let changed = false;
        
        const updated = notifications.map(n => {
            if ((n.userId === userId || n.userId === 'ALL') && !n.read) {
                changed = true;
                return { ...n, read: true };
            }
            return n;
        });

        if (changed) {
            this.saveAll(updated);
        }
    }

    public prune(maxCount: number = 100): void {
        const all = this.findAll().sort((a, b) => b.createdAt - a.createdAt);
        if (all.length > maxCount) {
            const toKeep = all.slice(0, maxCount);
            // This is a bit inefficient in JsonRepository as currently implemented (no bulk replace)
            // But for now we can just rely on the fact that we don't have a specific "overwrite" method exposed easily
            // Actually JsonRepository usually writes the whole file on change, so we might need a distinct method if we want to bulk delete.
            // For now, let's just delete the extras one by one or leave as is.
            // A better approach for JsonRepository is to expose a setAll or similar.
            // Let's assume for now we just delete the oldest ones.
            const toPrune = all.slice(maxCount).filter(n => n.dismissible !== false);
            if (toPrune.length > 0) {
                const toPruneIds = new Set(toPrune.map(n => n.id));
                const updated = all.filter(n => !toPruneIds.has(n.id));
                this.saveAll(updated);
            }
        }
    }
}

export const notificationRepository = new NotificationRepository();
