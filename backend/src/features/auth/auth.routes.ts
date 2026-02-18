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
router.post('/2fa/verify', async (req, res) => {
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
        const token = jwt.sign({ id: user!.id, email: user!.email, role: user!.role }, secret, { expiresIn: '7d' });
        
        auditService.log(user!.id, 'AUTH_2FA_SUCCESS', undefined, { type: isTotp ? 'totp' : 'recovery' }, req.ip, user!.email);
        
        // Update last login on success
        userRepository.update(user!.id, { lastLogin: Date.now() });

        res.json({ user, token });
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
        res.json(result);
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

// Optional: Regenerate Backup Codes
router.post('/2fa/backup/regen', verifyToken, async (req, res) => {
    const user = (req as any).user;
    const { password, code } = req.body;
    try {
        // We reuse disable logic flow or similar validation
        // For simplicity, let's just implement a direct service method later if needed
        // For now, disabling and re-enabling works, but a direct regen is better UX.
        res.status(501).json({ error: 'Not implemented yet' });
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

export default router;
