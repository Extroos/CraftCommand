import express from 'express';
import jwt from 'jsonwebtoken';
import { authService } from './AuthService';
import { verifyToken, requirePermission, requireRole } from '../../middleware/authMiddleware';
import { userRepository } from '../../storage/UserRepository';
import { auditService } from '../system/AuditService';
import { systemSettingsService } from '../system/SystemSettingsService';

import rateLimit from 'express-rate-limit';

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: { error: 'Too many login attempts, please try again later' }
});

const verify2FALimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many 2FA attempts, please try again later' }
});

const sensitiveActionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { error: 'Too many sensitive actions, please try again later' }
});

// Login
router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await authService.login(email, password);
        if (!result) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Verify 2FA
router.post('/2fa/verify', verify2FALimiter, async (req, res) => {
    const { loginToken, code } = req.body;
    try {
        const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
        const decoded = jwt.verify(loginToken, secret) as any;
        
        if (!decoded.partial) {
            return res.status(400).json({ error: 'Invalid token type' });
        }

        const isTotp = code.length === 6;
        let success = false;
        
        if (isTotp) {
            success = await authService.verify2FA(decoded.id, code);
        } else {
            success = (await authService.verifyRecoveryCode(decoded.id, code)).valid;
        }

        if (!success) {
            auditService.log(decoded.id, 'AUTH_2FA_FAIL', undefined, { type: isTotp ? 'totp' : 'recovery' }, req.ip);
            return res.status(401).json({ error: 'Invalid code' });
        }

        const user = authService.getUser(decoded.id);
        
        // Create session on 2FA success
        const sessionId = crypto.randomUUID();
        const expiresAt = Date.now() + 1 * 24 * 60 * 60 * 1000; // 24 hours
        
        const { sessionRepository } = require('../../storage/SessionRepository');
        sessionRepository.create({
            id: sessionId,
            userId: user!.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            createdAt: Date.now(),
            expiresAt
        });

        const token = jwt.sign({ 
            id: user!.id, 
            email: user!.email, 
            role: user!.role,
            jti: sessionId
        }, secret, { expiresIn: '24h' });
        
        auditService.log(user!.id, 'AUTH_2FA_SUCCESS', undefined, { type: isTotp ? 'totp' : 'recovery' }, req.ip, user!.email);
        
        // Update last login on success
        userRepository.update(user!.id, { lastLogin: Date.now() });

        res.json({ success: true, user, token });
    } catch (e: any) {
        res.status(401).json({ error: 'Session expired or invalid' });
    }
});

// Setup 2FA - Start
router.post('/2fa/setup/start', verifyToken, async (req, res) => {
    const user = (req as any).user;
    try {
        const result = await authService.start2FASetup(user.id);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Setup 2FA - Confirm
router.post('/2fa/setup/confirm', verifyToken, async (req, res) => {
    const user = (req as any).user;
    const { code } = req.body;
    try {
        const result = await authService.confirm2FASetup(user.id, code);
        auditService.log(user.id, 'AUTH_2FA_ENABLE', undefined, undefined, req.ip, user.email);
        res.json({ success: true, ...result });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Disable 2FA
router.post('/2fa/disable', verifyToken, async (req, res) => {
    const user = (req as any).user;
    const { password, code } = req.body;
    try {
        await authService.disable2FA(user.id, password, code);
        auditService.log(user.id, 'AUTH_2FA_DISABLE', undefined, undefined, req.ip, user.email);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Regenerate Backup Codes
router.post('/2fa/backup/regen', verifyToken, async (req, res) => {
    const user = (req as any).user;
    const { password, code } = req.body;
    try {
        const result = await authService.regenerateBackupCodes(user.id, password, code);
        auditService.log(user.id, 'AUTH_2FA_BACKUP_REGEN', undefined, undefined, req.ip, user.email);
        res.json(result);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Change Password (self-service)
router.post('/change-password', verifyToken, sensitiveActionLimiter, async (req, res) => {
    const user = (req as any).user;
    const { currentPassword, newPassword } = req.body;
    try {
        await authService.changePassword(user.id, currentPassword, newPassword);
        auditService.log(user.id, 'USER_UPDATE', user.id, { action: 'PASSWORD_CHANGED' }, req.ip, user.email);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Get Current User
router.get('/me', verifyToken, (req, res) => {
    res.json((req as any).user);
});

// Update Profile
router.patch('/me', verifyToken, (req, res) => {
    const user = (req as any).user;
    try {
        const updated = authService.updateUser(user.id, req.body, user);
        auditService.log(user.id, 'USER_UPDATE', user.id, { changes: Object.keys(req.body) }, req.ip, user.email);
        res.json(updated);
    } catch (e: any) {
        res.status(403).json({ error: e.message });
    }
});

// Rotate API Key
router.post('/rotate-api-key', verifyToken, async (req, res) => {
    const user = (req as any).user;
    try {
        const apiKey = await authService.rotateApiKey(user.id);
        res.json({ apiKey });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Admin: List Users
router.get('/users', verifyToken, requirePermission('users.manage'), (req, res) => {
    if (!systemSettingsService.isHostMode()) {
        return res.status(403).json({ error: 'Multi-user features are disabled in Solo Mode.' });
    }
    res.json(authService.getUsers());
});

// Admin: Create User
router.post('/users', verifyToken, requirePermission('users.manage'), async (req, res) => {
    if (!systemSettingsService.isHostMode()) {
        return res.status(403).json({ error: 'Multi-user features are disabled in Solo Mode.' });
    }
    const actor = (req as any).user;
    try {
        const { password, ...data } = req.body;
        const newUser = await authService.createUser(data, password, actor);
        auditService.log(actor.id, 'USER_CREATE', newUser.id, { email: newUser.email, role: newUser.role }, req.ip, actor.email);
        res.json(newUser);
    } catch (e: any) {
        res.status(403).json({ error: e.message });
    }
});

// Admin: Update User
router.patch('/users/:id', verifyToken, requirePermission('users.manage'), (req, res) => {
    if (!systemSettingsService.isHostMode()) {
        return res.status(403).json({ error: 'Multi-user features are disabled in Solo Mode.' });
    }
    const { id } = req.params;
    const actor = (req as any).user;
    try {
        const updated = authService.updateUser(id, req.body, actor);
        auditService.log(actor.id, 'USER_UPDATE', id, { changes: Object.keys(req.body) }, req.ip, actor.email);
        res.json(updated);
    } catch (e: any) {
        res.status(403).json({ error: e.message });
    }
});

// Admin: Delete User
router.delete('/users/:id', verifyToken, requirePermission('users.manage'), (req, res) => {
    if (!systemSettingsService.isHostMode()) {
        return res.status(403).json({ error: 'Multi-user features are disabled in Solo Mode.' });
    }
    const { id } = req.params;
    const actor = (req as any).user;
    try {
        authService.deleteUser(id, actor);
        auditService.log(actor.id, 'USER_DELETE', id, undefined, req.ip, actor.email);
        res.json({ success: true });
    } catch (e: any) {
        res.status(403).json({ error: e.message });
    }
});

// --- Session Management ---

// List sessions for current user
router.get('/sessions', verifyToken, async (req, res) => {
    const user = (req as any).user;
    try {
        const sessions = await authService.getSessions(user.id);
        res.json(sessions);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Revoke a specific session
router.post('/sessions/:sessionId/revoke', verifyToken, async (req, res) => {
    const user = (req as any).user;
    const { sessionId } = req.params;
    try {
        await authService.revokeSession(sessionId, user.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Revoke all sessions
router.post('/sessions/revoke-all', verifyToken, async (req, res) => {
    const user = (req as any).user;
    try {
        await authService.revokeAllSessions(user.id, user.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
