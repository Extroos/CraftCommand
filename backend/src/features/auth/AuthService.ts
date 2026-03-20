import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {  UserProfile, UserRole  } from '@shared/types';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../../utils/errors';
import bcrypt from 'bcryptjs';
import { auditService } from '../system/AuditService';
import { systemSettingsService } from '../system/SystemSettingsService';
import { userRepository } from '../../storage/UserRepository';
import { sessionRepository } from '../../storage/SessionRepository';
import { ROLE_HIERARCHY } from '@shared/constants/roles';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

class AuthService {
    private readonly JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dev-key';
    private readonly ROLE_HIERARCHY = ROLE_HIERARCHY;

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
            email: process.env.ADMIN_EMAIL || 'admin@craftcommand.io',
            username: 'Administrator',
            role: 'OWNER',
            passwordHash,
            avatarUrl: `https://mc-heads.net/avatar/Administrator/64`,
            preferences: {
                accentColor: 'emerald',
                reducedMotion: false,
                visualQuality: false,
                backgrounds: {},
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

    async login(email: string, pass: string): Promise<{ user: UserProfile, token: string, twoFactorRequired?: boolean } | null> {
        const user = userRepository.findByEmail(email);
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(pass, user.passwordHash);
        if (!valid) {
            auditService.log(user.id, 'LOGIN_FAIL', undefined, undefined, undefined, user.email);
            return null;
        }

        const { passwordHash, ...safeUser } = user;
        const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';

        if (user.twoFactorEnabled) {
            // Return partial token for 2FA verification
            const loginToken = jwt.sign({ id: user.id, email: user.email, partial: true }, secret, { expiresIn: '15m' });
            return { user: safeUser as UserProfile, token: loginToken, twoFactorRequired: true };
        }

        // Create session
        const sessionId = crypto.randomUUID();
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
        
        sessionRepository.create({
            id: sessionId,
            userId: user.id,
            createdAt: Date.now(),
            expiresAt
        });

        // Update last login
        userRepository.update(user.id, { lastLogin: Date.now() });
        auditService.log(user.id, 'LOGIN_SUCCESS', undefined, undefined, undefined, user.email);
        
        const token = jwt.sign({ 
            id: user.id, 
            email: user.email, 
            role: user.role,
            jti: sessionId 
        }, secret, { expiresIn: '7d' });
        
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
                visualQuality: false,
                backgrounds: {},
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

        // SECURITY: Handle password updates
        if (updates.password) {
            this.validatePassword(updates.password);
            finalUpdates.passwordHash = bcrypt.hashSync(updates.password, 10);
            delete finalUpdates.password;
        }
        delete finalUpdates.passwordHash; // Protect against raw passwordHash updates if still present in input

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
                },
                backgrounds: {
                    ...(current.preferences.backgrounds || {}),
                    ...(updates.preferences.backgrounds || {})
                }
            };
        }

        if (finalUpdates.username && !finalUpdates.avatarUrl) {
            finalUpdates.avatarUrl = `https://mc-heads.net/avatar/${finalUpdates.username}/64`;
        }
        
        // Fix: Auto-update avatar if Minecraft IGN changes
        if (finalUpdates.minecraftIgn) {
             console.log(`[AuthService] Updating IGN for ${id} to ${finalUpdates.minecraftIgn}`);
             finalUpdates.avatarUrl = `https://minotar.net/helm/${finalUpdates.minecraftIgn}/128.png`;
             console.log(`[AuthService] New Avatar URL: ${finalUpdates.avatarUrl}`);
        }

        const updated = userRepository.update(id, finalUpdates);
        if (!updated) {
            console.error(`[AuthService] Failed to update user ${id}`);
            throw new Error('User update failed');
        }
        
        const { passwordHash, ...safeUser } = updated;
        return safeUser;
    }

    // --- Phase 64: 2FA Completion ---

    private readonly ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'craftcommand-default-key-32-chars-!!';
    private readonly ALGORITHM = 'aes-256-cbc';

    private encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.ALGORITHM, Buffer.from(this.ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    private decrypt(text: string): string {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift()!, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(this.ALGORITHM, Buffer.from(this.ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    async start2FASetup(userId: string): Promise<{ qrCode: string, secret: string }> {
        const user = userRepository.findById(userId);
        if (!user) throw new NotFoundError('User not found');

        const secret = generateSecret();
        const otpauth = generateURI({ issuer: 'CraftCommand', label: user.email, secret });
        const qrCode = await QRCode.toDataURL(otpauth);

        const encryptedSecret = this.encrypt(secret);
        userRepository.update(userId, {
            twoFactorPendingSecretEncrypted: encryptedSecret,
            twoFactorPendingCreatedAt: Date.now()
        });

        auditService.log(userId, 'USER_UPDATE', userId, { action: '2FA_SETUP_STARTED' });

        return { qrCode, secret };
    }

    async confirm2FASetup(userId: string, code: string): Promise<{ backupCodes: string[] }> {
        const user = userRepository.findById(userId);
        if (!user || !user.twoFactorPendingSecretEncrypted) {
            throw new ValidationError('2FA setup not initiated');
        }

        // Check expiration (10 mins)
        if (Date.now() - (user.twoFactorPendingCreatedAt || 0) > 10 * 60 * 1000) {
            throw new ValidationError('2FA setup expired');
        }

        const secret = this.decrypt(user.twoFactorPendingSecretEncrypted);
        const { valid } = await verify({ token: code, secret });

        if (!valid) throw new UnauthorizedError('Invalid verification code');

        // Generate backup codes
        const plainBackupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex'));
        const hashedBackupCodes = plainBackupCodes.map(c => bcrypt.hashSync(c, 10));

        userRepository.update(userId, {
            twoFactorEnabled: true,
            twoFactorSecretEncrypted: user.twoFactorPendingSecretEncrypted,
            twoFactorVerifiedAt: Date.now(),
            twoFactorBackupCodesHashed: hashedBackupCodes,
            twoFactorPendingSecretEncrypted: undefined,
            twoFactorPendingCreatedAt: undefined
        });

        auditService.log(userId, 'USER_UPDATE', userId, { action: '2FA_ENABLED' });

        return { backupCodes: plainBackupCodes };
    }

    async verify2FA(userId: string, code: string): Promise<boolean> {
        const user = userRepository.findById(userId);
        if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEncrypted) return false;

        const secret = this.decrypt(user.twoFactorSecretEncrypted);
        const { valid } = await verify({ token: code, secret });

        if (!valid) {
            // Check recovery codes
            const { valid: isValidRecovery } = await this.verifyRecoveryCode(userId, code);
            if (!isValidRecovery) {
                auditService.log(userId, 'LOGIN_FAIL', undefined, { method: '2FA', reason: 'Invalid TOTP or recovery code' });
                throw new UnauthorizedError('Invalid 2FA code or recovery code');
            } else {
                auditService.log(userId, 'LOGIN_SUCCESS', undefined, { method: 'RECOVERY_CODE' });
                return true; // Recovery code was valid
            }
        } else { // TOTP code IS valid
            auditService.log(userId, 'LOGIN_SUCCESS', undefined, { method: '2FA' });
            return true; // TOTP code was valid
        }
    }

    async verifyRecoveryCode(userId: string, code: string): Promise<{ valid: boolean }> {
        const user = userRepository.findById(userId);
        if (!user || !user.twoFactorEnabled || !user.twoFactorBackupCodesHashed) return { valid: false };

        const codes = user.twoFactorBackupCodesHashed;
        for (let i = 0; i < codes.length; i++) {
            const match = await bcrypt.compare(code, codes[i]);
            if (match) {
                // Remove used code
                codes.splice(i, 1);
                userRepository.update(userId, { twoFactorBackupCodesHashed: codes });
                return { valid: true };
            }
        }

        return { valid: false };
    }

    async disable2FA(userId: string, passwordConfirm: string, code: string): Promise<void> {
        const user = userRepository.findById(userId);
        if (!user || !user.twoFactorEnabled) throw new ValidationError('2FA not enabled');

        const passValid = await bcrypt.compare(passwordConfirm, user.passwordHash!);
        if (!passValid) throw new UnauthorizedError('Invalid password');

        const secret = this.decrypt(user.twoFactorSecretEncrypted!);
        const { valid: codeValid } = await verify({ token: code, secret });
        
        // Also allow recovery code to disable? Typically yes.
        let recoveryValid = false;
        if (!codeValid && user.twoFactorBackupCodesHashed) {
            const index = user.twoFactorBackupCodesHashed.findIndex(hash => bcrypt.compareSync(code, hash));
            if (index !== -1) {
                recoveryValid = true;
                const remainingCodes = [...user.twoFactorBackupCodesHashed];
                remainingCodes.splice(index, 1);
                userRepository.update(userId, { twoFactorBackupCodesHashed: remainingCodes });
            }
        }

        if (!codeValid && !recoveryValid) throw new UnauthorizedError('Invalid 2FA code');

        userRepository.update(userId, {
            twoFactorEnabled: false,
            twoFactorSecretEncrypted: undefined,
            twoFactorBackupCodesHashed: undefined,
            twoFactorVerifiedAt: undefined
        });

        auditService.log(userId, 'USER_UPDATE', userId, { action: '2FA_DISABLED' });
    }

    // --- Secure Password Change ---

    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
        const user = userRepository.findById(userId);
        if (!user) throw new NotFoundError('User not found');
        if (!user.passwordHash) throw new ValidationError('Account has no password set');

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) throw new UnauthorizedError('Current password is incorrect');

        // Validate new password
        this.validatePassword(newPassword);

        // Ensure new password is different
        const isSame = await bcrypt.compare(newPassword, user.passwordHash);
        if (isSame) throw new ValidationError('New password must be different from current password');

        // Hash and save
        const passwordHash = await bcrypt.hash(newPassword, 10);
        userRepository.update(userId, { passwordHash });

        auditService.log(userId, 'USER_UPDATE', userId, { action: 'PASSWORD_CHANGED' });
    }

    // --- 2FA Backup Code Regeneration ---

    async regenerateBackupCodes(userId: string, password: string, code: string): Promise<{ backupCodes: string[] }> {
        const user = userRepository.findById(userId);
        if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
            throw new ValidationError('2FA is not enabled');
        }

        // Verify password
        const passValid = await bcrypt.compare(password, user.passwordHash!);
        if (!passValid) throw new UnauthorizedError('Invalid password');

        // Verify TOTP code
        const secret = this.decrypt(user.twoFactorSecretEncrypted);
        const { valid: codeValid } = await verify({ token: code, secret });
        if (!codeValid) throw new UnauthorizedError('Invalid 2FA code');

        // Generate new backup codes
        const plainBackupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex'));
        const hashedBackupCodes = plainBackupCodes.map(c => bcrypt.hashSync(c, 10));

        userRepository.update(userId, { twoFactorBackupCodesHashed: hashedBackupCodes });
        auditService.log(userId, 'USER_UPDATE', userId, { action: '2FA_BACKUP_REGEN' });

        return { backupCodes: plainBackupCodes };
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

    // --- Session Revocation ---

    async getSessions(userId: string) {
        return sessionRepository.findByUserId(userId);
    }

    async revokeSession(sessionId: string, actorId: string) {
        const session = sessionRepository.findById(sessionId);
        if (!session) throw new NotFoundError('Session not found');

        // Security: Can only revoke own session or if admin (canManage check omitted here for simplicity, assuming UI filters)
        // Actually let's add a basic check
        if (session.userId !== actorId) {
            const actor = userRepository.findById(actorId);
            const target = userRepository.findById(session.userId);
            if (!actor || !target || !this.canManage(actor.role, target.role)) {
                throw new UnauthorizedError('Insufficient permissions to revoke this session');
            }
        }

        sessionRepository.update(sessionId, { revokedAt: Date.now() });
        auditService.log(actorId, 'USER_UPDATE', session.userId, { action: 'SESSION_REVOKED', sessionId });
    }

    async revokeAllSessions(userId: string, actorId: string) {
        const sessions = sessionRepository.findActiveByUserId(userId);
        for (const session of sessions) {
            sessionRepository.update(session.id, { revokedAt: Date.now() });
        }
        auditService.log(actorId, 'USER_UPDATE', userId, { action: 'ALL_SESSIONS_REVOKED' });
    }

    async isSessionValid(sessionId: string): Promise<boolean> {
        const session = sessionRepository.findById(sessionId);
        if (!session) return false;
        if (session.revokedAt) return false;
        if (session.expiresAt < Date.now()) return false;
        return true;
    }
}

export const authService = new AuthService();
