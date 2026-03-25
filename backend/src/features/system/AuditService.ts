import {  AuditLog, AuditAction, ActivityEvent  } from '@shared/types';
import { logger } from '../../utils/logger';
import { auditRepository } from '../../storage/AuditRepository';
import { userRepository } from '../../storage/UserRepository';
import { io } from '../../sockets/index';
import crypto from 'crypto';



export class AuditService {
    // Converted to Stateless Service wrapping Repository



    public async log(userId: string, action: AuditAction, resourceId?: string, metadata?: any, ip?: string, userEmail?: string) {
        const entry: AuditLog = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            userId,
            userEmail,
            action,
            resourceId,
            metadata,
            ip
        };

        await auditRepository.add(entry);

        // Broadcast to Global Activity Feed
        try {
            if (io) {
                const user = userRepository.findById(userId);
                if (user) {
                    const event: ActivityEvent = {
                        id: `act-${entry.id}`,
                        serverId: 'global',
                        userId: user.id,
                        username: user.username,
                        action: entry.action as any,
                        detail: this.formatActionDetail(entry),
                        visibility: 'VIEWER',
                        timestamp: entry.timestamp
                    };
                    io.to('server:global').emit('activity:new', event);
                }
            }
        } catch (err) {
            logger.error(`[AuditService] Failed to broadcast activity: ${err.message}`);
        }
    }

    private formatActionDetail(log: AuditLog): string {
        switch(log.action as string) {
            case 'SERVER_START': return log.resourceId ? `Started server ${log.resourceId}` : 'Started a server';
            case 'SERVER_STOP': return log.resourceId ? `Stopped server ${log.resourceId}` : 'Stopped a server';
            case 'SERVER_RESTART': return log.resourceId ? `Restarted server ${log.resourceId}` : 'Restarted a server';
            case 'FILE_EDITED': return log.resourceId ? `Edited file in ${log.resourceId}` : 'Edited a file';
            case 'CONFIG_CHANGED': return 'Changed system configuration';
            case 'USER_CREATED': return 'Created a new user';
            case 'PLUGIN_INSTALLED': return log.resourceId ? `Installed plugin on ${log.resourceId}` : 'Installed plugin';
            case 'BACKUP_CREATED': return log.resourceId ? `Created backup for ${log.resourceId}` : 'Created backup';
            case 'COMMAND_SENT': return log.resourceId ? `Executed command on ${log.resourceId}` : 'Executed a command';
            default: return log.action.replace(/_/g, ' ').toLowerCase();
        }
    }

    public getLogs(options: any = {}): { logs: AuditLog[], total: number } {
        return auditRepository.getLogs(options);
    }


}

export const auditService = new AuditService();
