import { StorageProvider } from './StorageProvider';
import { GenericJsonProvider } from './JsonRepository';
import { SqliteProvider } from './SqliteProvider';
import { UserProfile } from '../../../shared/types';
import { systemSettingsService } from '../services/system/SystemSettingsService';

export class UserRepository implements StorageProvider<UserProfile> {
    private provider: StorageProvider<UserProfile>;

    constructor() {
        const settings = systemSettingsService.getSettings();
        const useSqlite = (settings.app as any).storageProvider === 'sqlite';

        if (useSqlite) {
            console.log('[UserRepository] Using SQLite Storage');
            this.provider = new SqliteProvider<UserProfile>('users.db', 'users', 'users.json');
        } else {
            console.log('[UserRepository] Using JSON Storage');
            this.provider = new GenericJsonProvider<UserProfile>('users.json');
        }
    }

    init() { return this.provider.init(); }
    findAll() { return this.provider.findAll(); }
    findById(id: string) { return this.provider.findById(id); }
    findOne(criteria: Partial<UserProfile>) { return this.provider.findOne(criteria); }
    create(item: UserProfile) { return this.provider.create(item); }
    update(id: string, updates: Partial<UserProfile>) { return this.provider.update(id, updates); }
    delete(id: string) { return this.provider.delete(id); }

    public findByEmail(email: string): UserProfile | undefined {
        return this.findOne({ email });
    }

    public findOwner(): UserProfile | undefined {
        return this.findOne({ role: 'OWNER' });
    }
}

export const userRepository = new UserRepository();
