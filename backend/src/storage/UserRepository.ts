import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import {  UserProfile  } from '@shared/types';
// import { systemSettingsService } from '../features/system/SystemSettingsService';

export class UserRepository implements StorageProvider<UserProfile> {
    private provider: StorageProvider<UserProfile>;

    constructor() {
        this.provider = StorageFactory.get<UserProfile>('users');
        this.init(); // Auto-initialize for SQLite migration/tables
    }

    init() { return this.provider.init(); }

    public async rebind() {
        this.provider = StorageFactory.get<UserProfile>('users');
        await this.init();
    }
    findAll() { return this.provider.findAll(); }
    findById(id: string) { return this.provider.findById(id); }
    findOne(criteria: Partial<UserProfile>) { return this.provider.findOne(criteria); }
    create(item: UserProfile) { return this.provider.create(item); }
    update(id: string, updates: Partial<UserProfile>) { return this.provider.update(id, updates); }
    delete(id: string) { return this.provider.delete(id); }
    saveAll(items: UserProfile[]) { return this.provider.saveAll(items); }

    public findByEmail(email: string): UserProfile | undefined {
        return this.findOne({ email });
    }

    public findOwner(): UserProfile | undefined {
        return this.findOne({ role: 'OWNER' });
    }
}

export const userRepository = new UserRepository();
