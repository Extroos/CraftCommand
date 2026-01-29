import { Socket } from 'socket.io';
import fs from 'fs-extra';
import path from 'path';
import { permissionService } from '../../services/auth/PermissionService';
import { processManager } from '../../services/servers/ProcessManager';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

const getUserById = (id: string) => {
    try {
        if (!fs.existsSync(USERS_FILE)) return null;
        const users = fs.readJSONSync(USERS_FILE);
        return users.find((u: any) => u.id === id);
    } catch (e) { return null; }
};

export const handleCommand = (socket: Socket, data: any) => {
    if (!data.id && !data.serverId) return;
    const serverId = data.id || data.serverId;
    
    const userId = (socket as any).userId;
    const user = getUserById(userId);

    if (!user) {
        console.warn(`[Socket] Unauthorized command attempt from ${socket.id}`);
        return;
    }

    if (!permissionService.can(user, 'server.command', serverId)) {
        console.warn(`[Socket] Forbidden command attempt by ${user.username} for ${serverId}`);
        socket.emit('error', 'Permission Denied: You cannot send commands to this server.');
        return;
    }
    
    console.log(`[Socket] Command for ${serverId}: ${data.command} [User: ${user.username}]`);
    processManager.sendCommand(serverId, data.command);
};
