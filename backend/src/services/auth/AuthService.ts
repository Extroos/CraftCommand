
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { UserProfile, UserRole } from '../../../../shared/types';
import { auditService } from '../system/AuditService';
import bcrypt from 'bcryptjs';
import { userRepository } from '../../storage/UserRepository';

export class AuthService {
    
    constructor() {
        // Migration logic could be moved or kept here, but for now assuming Migration is done or handled by Repo (Repo doesn't do migration though)
        // Let's keep strict repo usage.
        // If we really need migration checks, they should be a separate utility or run once.
        // For simplicity in this refactor, we'll assume standard users.json exists via Repository load.
        this.ensureAdminExists();
        
        // Trigger Migration (Phase 5)
        import('./MigrationService').then(({ migrationService }) => {
            migrationService.migrateUsers();
        });
    }

    private ensureAdminExists() {
        const users = userRepository.findAll();
        if (users.length === 0) {
             this.initDefault();
        }
    }



    private initDefault() {
        const passwordHash = bcrypt.hashSync('admin', 10);
        const admin: UserProfile = {
            id: '00000000-0000-0000-0000-000000000000',
            email: process.env.ADMIN_EMAIL || 'admin@craftcommand.io',
            username: 'Administrator',
            role: 'OWNER',
            passwordHash,
            avatarUrl: `https://mc-heads.net/avatar/Administrator/64`,
            preferences: {
                accentColor: 'emerald',
                reducedMotion: false,
                notifications: { browser: true, sound: true, events: { onJoin: true, onCrash: true } },
                terminal: { fontSize: 13, fontFamily: 'monospace' }
            }
        };
        userRepository.create(admin);
    }

    getUsers(): UserProfile[] {
        return userRepository.findAll().map(u => {
            const { passwordHash, ...rest } = u;
            return rest as UserProfile;
        });
    }

    getUser(id: string): UserProfile | undefined {
        return userRepository.findById(id);
    }

    getOwner(): UserProfile {
        return userRepository.findOwner() || userRepository.findAll()[0];
    }

    async login(email: string, pass: string): Promise<{ user: UserProfile, token: string } | null> {
        const user = userRepository.findByEmail(email);
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(pass, user.passwordHash);
        if (!valid) {
            auditService.log(user.id, 'LOGIN_FAIL', undefined, undefined, undefined, user.email);
            return null;
        }

        // Update last login
        userRepository.update(user.id, { lastLogin: Date.now() });
        
        auditService.log(user.id, 'LOGIN_SUCCESS', undefined, undefined, undefined, user.email);

        const { passwordHash, ...safeUser } = user;
        
        // Use JWT for secure session management
        const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: '7d' });
        
        return { user: safeUser as UserProfile, token };
    }

    async createUser(data: Partial<UserProfile>, password: string): Promise<UserProfile> {
        if (userRepository.findByEmail(data.email!)) {
             throw new Error('User already exists');
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUser: UserProfile = {
            id: crypto.randomUUID(),
            email: data.email!,
            username: data.username!,
            role: data.role || 'VIEWER',
            preferences: {
                accentColor: 'emerald',
                reducedMotion: false,
                notifications: { browser: true, sound: true, events: { onJoin: true, onCrash: true } },
                terminal: { fontSize: 13, fontFamily: 'monospace' }
            },
            passwordHash,
            avatarUrl: `https://mc-heads.net/avatar/${data.username}/64`,
            permissions: data.permissions || {}
        };

        userRepository.create(newUser);

        const { passwordHash: _, ...safeUser } = newUser;
        return safeUser as UserProfile;
    }

    updateUser(id: string, updates: Partial<UserProfile>) {
        const current = userRepository.findById(id);
        if (!current) throw new Error('User not found');

        // Prevent downgrading the last Owner
        if (current.role === 'OWNER' && updates.role && updates.role !== 'OWNER') {
             const ownerCount = userRepository.findAll().filter(u => u.role === 'OWNER').length;
             if (ownerCount <= 1) throw new Error('Cannot remove the last Owner');
        }

        if (updates.username && !updates.avatarUrl) {
            updates.avatarUrl = `https://mc-heads.net/avatar/${updates.username}/64`;
        }

        const updated = userRepository.update(id, updates);
        if (!updated) throw new Error('User not found'); // Should accept above check
        
        const { passwordHash, ...safeUser } = updated;
        return safeUser;
    }

    deleteUser(id: string) {
        const user = userRepository.findById(id);
        if (!user) throw new Error('User not found');
        if (user.role === 'OWNER') throw new Error('Cannot delete Owner. Demote first.');

        userRepository.delete(id);
    }
}

export const authService = new AuthService();
