import express from 'express';
import { authService } from '../services/auth/AuthService';
import { verifyToken, requirePermission, requireRole } from '../middleware/authMiddleware';
import { auditService } from '../services/system/AuditService';

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
    res.json(authService.getUsers());
});

// Admin: Create User
router.post('/users', verifyToken, requirePermission('users.manage'), async (req, res) => {
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
