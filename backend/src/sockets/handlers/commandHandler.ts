import { Socket } from 'socket.io';
import fs from 'fs-extra';
import { logger } from '../../utils/logger';
import { serverRepository } from '../../storage/ServerRepository';
import path from 'path';
import { permissionService } from '../../features/auth/PermissionService';
import { processManager } from '../../features/processes/ProcessManager';

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
        logger.warn(`[Socket] Unauthorized command attempt from ${socket.id}`);
        return;
    }

    // Hardening (Phase 5): Strict Authorization Check
    // Map 'command' event to 'server.console.write' permission
    const requiredPerm: any = 'server.console.write';

    if (!permissionService.can(user, requiredPerm, serverId)) {
        logger.warn(`[Socket] Forbidden command attempt by ${user.username} for ${serverId}`);
        
        // Audit Log (Phase 2/5 Requirement)
        import('../../features/system/AuditService').then(({ auditService }) => {
            auditService.log(
                user.id, 
                'PERMISSION_DENIED', 
                serverId, 
                { command: data.command, permission: requiredPerm }, 
                socket.handshake.address, 
                user.email
            );
        });
        
        socket.emit('error', 'Permission Denied: You cannot send commands to this server.');
        return;
    }
    
    let command = String(data.command || '').trim();
    
    // v4.6 Security Sanitization:
    // 1. Length Limit (Prevent Buffer Overflows/DoS)
    if (command.length > 512) {
        command = command.substring(0, 512);
        logger.warn(`[Socket] Command truncated for ${serverId} due to length limits.`);
    }

    // 2. Control Character Stripping (Prevent Terminal escapes)
    command = command.replace(/[\x00-\x1F\x7F-\x9F]/g, "");

    if (command.length === 0) return;

    logger.info(`[Socket] Command for ${serverId}: ${command} [User: ${user.username}]`);
    processManager.sendCommand(serverId, command);
};
