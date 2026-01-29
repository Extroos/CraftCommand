import { Socket } from 'socket.io';
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
        // Decode Token: base64(userId:timestamp)
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [userId, _timestamp] = decoded.split(':');
        
        if (!userId) return next(new Error('Authentication Error: Invalid Token'));

        // Load full user from disk to ensure we have Role/Permissions
        const user = getUserById(userId);
        if (!user) return next(new Error('Authentication Error: User Not Found'));

        // Attach user data to socket
        (socket as any).userId = userId;
        (socket as any).user = user;
        
        next();
    } catch (e) {
        next(new Error('Authentication Error: Malformed Token'));
    }
};
