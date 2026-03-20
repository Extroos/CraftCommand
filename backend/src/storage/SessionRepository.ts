import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import { UserSession } from '@shared/types';

export class SessionRepository implements StorageProvider<UserSession> {
    private provider: StorageProvider<UserSession>;

    constructor() {
        this.provider = StorageFactory.get<UserSession>('sessions');
        this.init();
    }

    init() { return this.provider.init(); }

    public async rebind() {
        this.provider = StorageFactory.get<UserSession>('sessions');
        await this.init();
    }
    findAll() { return this.provider.findAll(); }
    findById(id: string) { return this.provider.findById(id); }
    findOne(criteria: Partial<UserSession>) { return this.provider.findOne(criteria); }
    create(item: UserSession) { return this.provider.create(item); }
    update(id: string, updates: Partial<UserSession>) { return this.provider.update(id, updates); }
    delete(id: string) { return this.provider.delete(id); }
    saveAll(items: UserSession[]) { return this.provider.saveAll(items); }

    public findByUserId(userId: string): UserSession[] {
        return this.findAll().filter(s => s.userId === userId);
    }

    public findActiveByUserId(userId: string): UserSession[] {
        const now = Date.now();
        return this.findAll().filter(s => s.userId === userId && s.expiresAt > now && !s.revokedAt);
    }
}

export const sessionRepository = new SessionRepository();
