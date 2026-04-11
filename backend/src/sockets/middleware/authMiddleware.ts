import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { userRepository } from '../../storage/UserRepository';
import { authService } from '../../features/auth/AuthService';

export const socketAuthMiddleware = async (socket: Socket, next: (err?: any) => void) => {
    // Debug namespace
    if (socket.nsp.name === '/agent') {
        // console.log('[AuthMiddleware] Skipping global auth for /agent namespace');
        return next();
    }

    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication Error: No Token'));

    // E2E Test Bypass
    if (process.env.NODE_ENV === 'test' && token === 'Bearer e2e-secret-bypass') {
        (socket as any).userId = 'e2e-test-user';
        (socket as any).user = { id: 'e2e-test-user', role: 'OWNER', username: 'TestUser' };
        return next();
    }

    try {
        const secret = process.env.JWT_SECRET as string;
        const decoded = jwt.verify(token, secret) as any;
        
        // Use the centralized repository via the same logic ideally, but direct file read is okay for now if we don't assume dependency injection here.
        // Better: Use the repo function if we can refactor this file to use 'userRepository' import.
        // Checking imports... 'authMiddleware.ts' (socket) uses 'fs-extra'.
        // Let's stick to the existing pattern but update the verification.
        const userId = decoded.id;
        
        if (!userId) return next(new Error('Authentication Error: Invalid Token Payload'));

        // Load full user from disk/DB to ensure we have Role/Permissions and latest Profile info
        const user = await userRepository.findById(userId);
        if (!user) return next(new Error('Authentication Error: User Not Found'));

        // Attach user data to socket
        (socket as any).userId = userId;
        (socket as any).user = user;

        // Verify Session (Phase 12)
        if (decoded.jti) {
            const isValid = await authService.isSessionValid(decoded.jti);
            if (!isValid) return next(new Error('Authentication Error: Session Revoked or Expired'));
        }
        
        next();
    } catch (e) {
        next(new Error('Authentication Error: Invalid or Expired Token'));
    }
};
