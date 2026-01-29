import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import fs from 'fs-extra';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

const getUserById = (id: string) => {
    try {
        if (!fs.existsSync(USERS_FILE)) return null;
        const users = fs.readJSONSync(USERS_FILE);
        return users.find((u: any) => u.id === id);
    } catch (e) { return null; }
};

export const socketAuthMiddleware = async (socket: Socket, next: (err?: any) => void) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication Error: No Token'));

    try {
        const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
        const decoded = jwt.verify(token, secret) as any;
        
        // Use the centralized repository via the same logic ideally, but direct file read is okay for now if we don't assume dependency injection here.
        // Better: Use the repo function if we can refactor this file to use 'userRepository' import.
        // Checking imports... 'authMiddleware.ts' (socket) uses 'fs-extra'.
        // Let's stick to the existing pattern but update the verification.
        const userId = decoded.id;
        
        if (!userId) return next(new Error('Authentication Error: Invalid Token Payload'));

        // Load full user from disk to ensure we have Role/Permissions
        const user = getUserById(userId);
        if (!user) return next(new Error('Authentication Error: User Not Found'));

        // Attach user data to socket
        (socket as any).userId = userId;
        (socket as any).user = user;
        
        next();
    } catch (e) {
        next(new Error('Authentication Error: Invalid or Expired Token'));
    }
};
