import { Server, Socket } from 'socket.io';
import { socketAuthMiddleware } from './middleware/authMiddleware';
import { registerBroadcasters } from './broadcasters';
import { handleCommand } from './handlers/commandHandler';

export const setupSocket = (io: Server) => {
    
    // 1. Setup Global Broadcasters (Service -> IO)
    registerBroadcasters(io);

    // 2. Authentication Middleware
    io.use(socketAuthMiddleware);

    // 3. Connection Handling
    io.on('connection', (socket: Socket) => {
        const user = (socket as any).user;
        console.log(`[Socket] Client connected: ${socket.id} (User: ${user?.id})`);

        socket.on('disconnect', () => {
            console.log(`[Socket] Client disconnected: ${socket.id}`);
        });

        // Command handling - Secure
        socket.on('command', (data) => handleCommand(socket, data));
    });
};
