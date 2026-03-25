import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authService } from '../features/auth/AuthService';
import { permissionService } from '../features/auth/PermissionService';
import { systemSettingsService } from '../features/system/SystemSettingsService';
import { Permission, ServerCapabilities } from '../../../shared/types';
import { getServer } from '../features/servers/ServerService';
import { getServerCapabilities } from '../../../shared/utils/CapabilityUtils';


export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
    // Check if Host Mode is disabled (Personal Mode)
    const settings = systemSettingsService.getSettings();
    const hostMode = settings?.app?.hostMode ?? true;
    console.log(`[AuthMiddleware] verifyToken for ${req.path} (HostMode: ${hostMode})`);
    
    if (!hostMode) {
        // Personal Mode: Bypass authentication, create a mock admin user
        (req as any).user = {
            id: 'personal-mode',
            email: 'personal@localhost',
            role: 'OWNER',
            username: 'Personal'
        };
        console.log('[AuthMiddleware] Personal Mode: Mock user attached');
        return next();
    }

    // E2E Test Bypass (Safe: Only active if NODE_ENV=test)
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-bypass'] === 'true') {
        (req as any).user = {
            id: 'e2e-test-user',
            email: 'test@localhost',
            role: 'OWNER',
            username: 'TestUser'
        };
        console.log('[AuthMiddleware] E2E Test Bypass: Mock user attached');
        return next();
    }

    // Host Mode: Require authentication
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        console.warn(`[AuthMiddleware] Missing Authorization header for ${req.path}`);
        return res.status(401).json({ error: 'Access denied: Missing Authorization header' });
    }

    // Format: "Bearer token"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        console.warn(`[AuthMiddleware] Malformed Authorization header for ${req.path}: ${authHeader}`);
        return res.status(401).json({ error: 'Access denied: Malformed header' });
    }

    const token = parts[1];
    
    // Verify JWT
    try {
        const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
        const decoded = jwt.verify(token, secret) as any;
        
        console.log(`[AuthMiddleware] Token verified for user ID: ${decoded.id}`);

        const user = authService.getUser(decoded.id);
        if (!user) {
            console.error(`[AuthMiddleware] User not found for ID ${decoded.id} in storage.`);
            return res.status(401).json({ error: 'Invalid token: User not found' });
        }

        // Attach user to request
        (req as any).user = user;

        // Verify Session (Phase 12)
        if (decoded.jti) {
            const { sessionRepository } = require('../storage/SessionRepository');
            const session = sessionRepository.findById(decoded.jti);
            
            if (!session || session.expiresAt < Date.now() || session.revokedAt) {
                 console.warn(`[AuthMiddleware] Revoked or expired session: ${decoded.jti} for user ${user.email}`);
                 return res.status(401).json({ error: 'Session has been revoked or expired. Please login again.' });
            }

            // Phase 8: Strict IP Binding
            const enforceIp = settings?.app?.security?.ipSessionBinding ?? false;
            if (enforceIp && session.ipAddress && session.ipAddress !== req.ip) {
                 console.error(`[Security] Session IP Mismatch! Session: ${session.ipAddress}, Request: ${req.ip} (User: ${user.email})`);
                 return res.status(401).json({ 
                     error: 'Security Alert: Your IP address has changed since login. Please login again for your protection.' 
                 });
            }
        }

        // Phase 6: Enforce 2FA Policy for Administrators
        // ... (policy enforcement omitted for brevity, but stays below)
        const isAppAdmin = user.role === 'ADMIN' || user.role === 'OWNER';
        const force2FA = settings?.app?.security?.forceAdmin2FA ?? false;
        
        if (force2FA && isAppAdmin && !user.twoFactorEnabled) {
            console.warn(`[AuthMiddleware] User ${user.email} blocked by forceAdmin2FA policy.`);
            return res.status(403).json({ 
                error: 'Two-Factor Authentication Required', 
                policyEnforced: true,
                message: 'Your administrator account requires Two-Factor Authentication to be enabled. Please enable it in your profile settings.'
            });
        }

        next();
    } catch (e: any) {
        console.error(`[AuthMiddleware] JWT Verification Failed: ${e.message}`, e.stack);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

export const optionalVerifyToken = async (req: Request, res: Response, next: NextFunction) => {
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
             import('../features/system/AuditService').then(({ auditService }) => {
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

export const requireCapability = (capability: keyof ServerCapabilities) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const serverId = req.params.id || req.params.serverId || (req.query.serverId as string);
        if (!serverId) return next(); // Cannot check if no server context

        const server = getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server context required' });

        const capabilities = getServerCapabilities(server.software);
        if (!capabilities[capability]) {
            return res.status(403).json({ 
                error: `Action Unavailable: The current server (${server.software}) does not support this feature (${capability}).` 
            });
        }
        next();
    };
};

