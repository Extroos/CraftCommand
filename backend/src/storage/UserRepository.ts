import { JsonRepository } from './JsonRepository';
import { UserProfile } from '../../../shared/types';

export class UserRepository extends JsonRepository<UserProfile> {
    constructor() {
        super('users.json');
    }

    public findByEmail(email: string): UserProfile | undefined {
        return this.data.find(u => u.email === email);
    }

    public findOwner(): UserProfile | undefined {
        return this.data.find(u => u.role === 'OWNER');
    }
}

export const userRepository = new UserRepository();
