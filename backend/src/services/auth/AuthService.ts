
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { UserProfile, UserRole } from '../../../../shared/types';
import { auditService } from '../system/AuditService';
import bcrypt from 'bcryptjs';
import { userRepository } from '../../storage/UserRepository';

export class AuthService {
    
    private readonly ROLE_HIERARCHY: Record<UserRole, number> = {
        'OWNER': 3,
        'ADMIN': 2,
        'MANAGER': 1,
        'VIEWER': 0
    };

    constructor() {
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
            email: process.env.ADMIN_EMAIL || 'admin@craftcommands.io',
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

    public canManage(actorRole: UserRole, targetRole: UserRole): boolean {
        return this.ROLE_HIERARCHY[actorRole] > this.ROLE_HIERARCHY[targetRole] || (actorRole === 'OWNER' && targetRole === 'OWNER');
    }

    private validateEmail(email: string) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!regex.test(email)) throw new Error('Invalid email format');
    }

    private validatePassword(password: string) {
        if (password.length < 8) throw new Error('Password must be at least 8 characters long');
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

    async createUser(data: Partial<UserProfile>, password: string, actor?: UserProfile): Promise<UserProfile> {
        this.validateEmail(data.email!);
        this.validatePassword(password);

        const targetRole = data.role || 'VIEWER';

        if (actor) {
            // Role Elevation Guard: Prevent non-OWNERs from creating OWNERs
            if (actor.role !== 'OWNER' && targetRole === 'OWNER') {
                throw new Error('Only Owners can create Owner accounts');
            }

            // Hierarchy Check: Cannot create a user with a role >= your own (except OWNERs)
            if (actor.role !== 'OWNER' && this.ROLE_HIERARCHY[targetRole] >= this.ROLE_HIERARCHY[actor.role]) {
                throw new Error(`Hierarchy violation: ${actor.role} cannot create ${targetRole} accounts`);
            }
        }

        if (userRepository.findByEmail(data.email!)) {
             throw new Error('User already exists');
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUser: UserProfile = {
            id: crypto.randomUUID(),
            email: data.email!,
            username: data.username!,
            role: data.role || 'VIEWER',
            customRoleName: data.customRoleName,
            preferences: {
                accentColor: 'emerald',
                reducedMotion: false,
                notifications: { browser: true, sound: true, events: { onJoin: true, onCrash: true } },
                terminal: { fontSize: 13, fontFamily: 'monospace' }
            },
            passwordHash,
            avatarUrl: `https://mc-heads.net/avatar/${data.username}/64`,
            serverAcl: {}
        };

        userRepository.create(newUser);

        const { passwordHash: _, ...safeUser } = newUser;
        return safeUser as UserProfile;
    }

    updateUser(id: string, updates: any, actor?: UserProfile) {
        const current = userRepository.findById(id);
        if (!current) throw new Error('User not found');

        // Security: If an actor is provided, check if they can manage the target
        if (actor) {
            const isSelf = actor.id === current.id;
            const hasHierarchyPower = this.canManage(actor.role, current.role);
            
            if (!hasHierarchyPower && !isSelf) {
                throw new Error(`Hierarchy violation: ${actor.role} cannot modify ${current.role}`);
            }

            // Role Elevation Guard: Prevent non-OWNERs from ever promoting anyone (including self) to OWNER
            if (updates.role && updates.role !== current.role) {
                if (actor.role !== 'OWNER' && updates.role === 'OWNER') {
                    throw new Error('Only Owners can promote to Owner');
                }
                
                if (isSelf && actor.role !== 'OWNER') {
                    throw new Error('You cannot change your own role');
                }

                // Generic hierarchy check for role changes: cannot promote someone to a role >= your own (except OWNERs)
                if (actor.role !== 'OWNER' && this.ROLE_HIERARCHY[updates.role] >= this.ROLE_HIERARCHY[actor.role]) {
                    throw new Error(`Hierarchy violation: ${actor.role} cannot promote users to ${updates.role}`);
                }
            }

            // --- Scoped Management (Admin managing Manager/Viewer) ---
            if (actor.role === 'ADMIN' && (current.role === 'MANAGER' || current.role === 'VIEWER')) {
                // Admins can ONLY change serverAcl (except global) and basic preferences.
                // Block core identity changes.
                const forbiddenFields = ['email', 'password', 'passwordHash', 'role', 'username', 'customRoleName'];
                const illegalChanges = Object.keys(updates).filter(key => forbiddenFields.includes(key));
                
                if (illegalChanges.length > 0) {
                    throw new Error(`Limited Access: Admins cannot modify ${illegalChanges.join(', ')} for other users.`);
                }

                // Block modification of 'global' ACL scope by non-owners
                if (updates.serverAcl && updates.serverAcl.global) {
                    throw new Error('Limited Access: Only the Owner can manage Global System Permissions.');
                }
            }
        }

        // Prevent downgrading the last Owner
        if (current.role === 'OWNER' && updates.role && updates.role !== 'OWNER') {
             const ownerCount = userRepository.findAll().filter(u => u.role === 'OWNER').length;
             if (ownerCount <= 1) throw new Error('Cannot remove the last Owner');
        }

        // --- Deep Merge Logic for Persistence Sync (Prevents overwriting whole ACLs) ---
        const finalUpdates = { ...updates };

        // 1. Merge serverAcl instead of replacing
        if (updates.serverAcl) {
            finalUpdates.serverAcl = {
                ...(current.serverAcl || {}),
                ...updates.serverAcl
            };
        }

        // 2. Merge preferences instead of replacing
        if (updates.preferences) {
            finalUpdates.preferences = {
                ...current.preferences,
                ...updates.preferences,
                notifications: {
                    ...current.preferences.notifications,
                    ...(updates.preferences.notifications || {})
                },
                terminal: {
                    ...current.preferences.terminal,
                    ...(updates.preferences.terminal || {})
                }
            };
        }

        if (finalUpdates.username && !finalUpdates.avatarUrl) {
            finalUpdates.avatarUrl = `https://mc-heads.net/avatar/${finalUpdates.username}/64`;
        }

        const updated = userRepository.update(id, finalUpdates);
        if (!updated) throw new Error('User update failed');
        
        const { passwordHash, ...safeUser } = updated;
        return safeUser;
    }

    deleteUser(id: string, actor?: UserProfile) {
        const user = userRepository.findById(id);
        if (!user) throw new Error('User not found');

        if (actor) {
            if (!this.canManage(actor.role, user.role)) {
                throw new Error(`Hierarchy violation: ${actor.role} cannot delete ${user.role}`);
            }
        }

        if (user.role === 'OWNER') throw new Error('Cannot delete Owner. Demote first.');

        userRepository.delete(id);
    }
}

export const authService = new AuthService();
