import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authService } from '../features/auth/AuthService';
import { permissionService } from '../features/auth/PermissionService';
import { systemSettingsService } from '../features/system/SystemSettingsService';
import { Permission, ServerCapabilities } from '../../../shared/types';
import { getServer } from '../features/servers/ServerService';
import { getServerCapabilities } from '../../../shared/utils/CapabilityUtils';
import { logger } from '../utils/logger';


export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
    // Check if Host Mode is disabled (Personal Mode)
    const settings = systemSettingsService.getSettings();
    const hostMode = settings?.app?.hostMode ?? true;
    
    if (!hostMode) {
        // Personal Mode: Bypass authentication, use the system owner
        const owner = authService.getOwner();
        if (owner) {
             (req as any).user = owner;
             return next();
        }
        
        // Fallback for extreme edge cases (should not happen if system is initialized)
        (req as any).user = {
            id: 'personal-mode',
            email: 'personal@localhost',
            role: 'OWNER',
            username: 'Personal',
            preferences: {
                accentColor: 'emerald',
                reducedMotion: false,
                visualQuality: false,
                backgrounds: {},
                notifications: { browser: true, sound: true, events: { onJoin: true, onCrash: true } },
                terminal: { fontSize: 13, fontFamily: 'monospace' }
            }
        };
        return next();
    }

    // E2E Test Bypass (Safe: Only active if NODE_ENV=test)
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-bypass'] === 'true') {
        (req as any).user = {
            id: 'e2e-test-user',
            email: 'test@localhost',
            role: 'OWNER',
            username: 'TestUser',
            preferences: {
                accentColor: 'emerald',
                reducedMotion: false,
                visualQuality: false,
                backgrounds: {},
                notifications: { browser: true, sound: true, events: { onJoin: true, onCrash: true } },
                terminal: { fontSize: 13, fontFamily: 'monospace' }
            }
        };
        return next();
    }

    // Host Mode: Require authentication
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        logger.warn(`[AuthMiddleware] Missing Authorization header for ${req.path}`);
        return res.status(401).json({ error: 'Access denied: Missing Authorization header' });
    }

    // Format: "Bearer token"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Access denied: Malformed header' });
    }

    const token = parts[1];
    
    // Verify JWT
    try {
        const secret = process.env.JWT_SECRET as string;
        const decoded = jwt.verify(token, secret) as any;

        const user = authService.getUser(decoded.id);
        if (!user) {
            return res.status(401).json({ error: 'Invalid token: User not found' });
        }

        // Attach user to request
        (req as any).user = user;

        // Verify Session (Phase 12)
        if (decoded.jti) {
            const { sessionRepository } = require('../storage/SessionRepository');
            const session = sessionRepository.findById(decoded.jti);
            
            // v4.0 Resilience: Expiration Grace Period (60s)
            const GRACE_PERIOD_MS = 60 * 1000;
            const isExpired = session?.expiresAt < Date.now();
            const isWithinGrace = session && (Date.now() - session.expiresAt < GRACE_PERIOD_MS);

            if (!session || (isExpired && !isWithinGrace) || session.revokedAt) {
                 logger.warn(`[AuthMiddleware] Revoked or expired session: ${decoded.jti} for user ${user.email}`);
                 return res.status(401).json({ error: 'Session has been revoked or expired. Please login again.' });
            }

            // Strict IP Binding (v4.0 Subnet-Aware Logic)
            const enforceIp = settings?.app?.security?.ipSessionBinding ?? false;
            if (enforceIp && session.ipAddress && session.ipAddress !== req.ip) {
                 // Check if it's just a minor change in the same subnet (e.g. 192.168.1.10 -> 192.168.1.11)
                 const sessionSubnet = session.ipAddress.split('.').slice(0, 3).join('.');
                 const currentSubnet = req.ip.split('.').slice(0, 3).join('.');
                 
                 if (sessionSubnet !== currentSubnet) {
                    logger.error(`[Security] Session Subnet Mismatch! Session: ${session.ipAddress}, Request: ${req.ip} (User: ${user.email})`);
                    return res.status(401).json({ 
                        error: 'Security Alert: Your IP subnet has changed significantly since login. Please login again.' 
                    });
                 } else {
                    logger.info(`[AuthMiddleware] Subnet-Aware match for ${user.email} (IP shifted from ${session.ipAddress} to ${req.ip}). Bypassing logout.`);
                 }
            }
        }

        // Enforce 2FA Policy for Administrators
        // ... (policy enforcement omitted for brevity, but stays below)
        const isAppAdmin = user.role === 'ADMIN' || user.role === 'OWNER';
        const force2FA = settings?.app?.security?.forceAdmin2FA ?? false;
        
        if (force2FA && isAppAdmin && !user.twoFactorEnabled) {
            logger.warn(`[AuthMiddleware] User ${user.email} blocked by forceAdmin2FA policy.`);
            return res.status(403).json({ 
                error: 'Two-Factor Authentication Required', 
                policyEnforced: true,
                message: 'Your administrator account requires Two-Factor Authentication to be enabled. Please enable it in your profile settings.'
            });
        }

        next();
    } catch (e: any) {
        logger.error(`[AuthMiddleware] JWT Verification Failed: ${e.message} | ${e.stack}`);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

export const optionalVerifyToken = async (req: Request, res: Response, next: NextFunction) => {
    const settings = systemSettingsService.getSettings();
    if (!settings.app.hostMode) {
        (req as any).user = authService.getOwner() || {
            id: 'personal-mode',
            email: 'personal@localhost',
            role: 'OWNER',
            username: 'Personal',
            preferences: {
                accentColor: 'emerald',
                reducedMotion: false,
                visualQuality: false,
                backgrounds: {},
                notifications: { browser: true, sound: true, events: { onJoin: true, onCrash: true } },
                terminal: { fontSize: 13, fontFamily: 'monospace' }
            }
        };
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) return next();

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    try {
        const secret = process.env.JWT_SECRET as string;
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

