import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authService } from '../services/auth/AuthService';
import { permissionService } from '../services/auth/PermissionService';
import { systemSettingsService } from '../services/system/SystemSettingsService';
import { Permission } from '../../../shared/types';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    // Check if Host Mode is disabled (Personal Mode)
    const settings = systemSettingsService.getSettings();
    if (!settings.app.hostMode) {
        // Personal Mode: Bypass authentication, create a mock admin user
        (req as any).user = {
            id: 'personal-mode',
            email: 'personal@localhost',
            role: 'OWNER',
            username: 'Personal'
        };
        return next();
    }

    // Host Mode: Require authentication
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Access denied' });

    // Format: "Bearer token"
    const token = authHeader.split(' ')[1];
    
    // Verify JWT
    try {
        const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
        const decoded = jwt.verify(token, secret) as any;
        
        const user = authService.getUser(decoded.id);
        if (!user) return res.status(401).json({ error: 'Invalid token: User not found' });

        // Attach user to request
        (req as any).user = user;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

export const optionalVerifyToken = (req: Request, res: Response, next: NextFunction) => {
    const settings = systemSettingsService.getSettings();
    if (!settings.app.hostMode) {
        (req as any).user = {
            id: 'personal-mode',
            email: 'personal@localhost',
            role: 'OWNER',
            username: 'Personal'
        };
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) return next();

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    try {
        const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
        const decoded = jwt.verify(token, secret) as any;
        const user = authService.getUser(decoded.id);
        if (user) {
            (req as any).user = user;
        }
    } catch (e) {
        // Ignore error for optional verification
    }
    next();
};

export const requirePermission = (permission: Permission) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        const serverId = req.params.id || req.params.serverId || (req.query.serverId as string);

        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        if (!permissionService.can(user, permission, serverId)) {
             import('../services/system/AuditService').then(({ auditService }) => {
                auditService.log(user.id, 'PERMISSION_DENIED', serverId || 'system', { permission, method: req.method, path: req.path }, req.ip, user.email);
            });
            return res.status(403).json({ error: 'Forbidden: Insufficient Permissions' });
        }

        next();
    };
};

export const requireRole = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        if (!allowedRoles.includes(user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient Role' });
        }
        next();
    };
};
