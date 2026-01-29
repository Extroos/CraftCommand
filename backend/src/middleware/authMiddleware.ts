import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth/AuthService';
import { permissionService } from '../services/auth/PermissionService';
import { Permission } from '../../../shared/types';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Access denied' });

    // Format: "Bearer token"
    const token = authHeader.split(' ')[1];
    
    // In a real implementation this would verify a JWT signature.
    // Our mock implementation uses "userId:timestamp" in base64.
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [userId, _timestamp] = decoded.split(':');
        
        const user = authService.getUser(userId);
        if (!user) return res.status(401).json({ error: 'Invalid token' });

        // Attach user to request
        (req as any).user = user;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid token format' });
    }
};

export const requirePermission = (permission: Permission) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        const serverId = req.params.id; // Assuming server routes use :id

        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        if (!permissionService.can(user, permission, serverId)) {
            return res.status(403).json({ error: 'Forbidden' });
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
