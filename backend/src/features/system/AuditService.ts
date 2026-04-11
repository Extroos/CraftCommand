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
                        serverId: entry.metadata?.serverId || (entry.action.startsWith('SERVER_') ? entry.resourceId : 'global'),
                        userId: user.id,
                        username: user.username,
                        action: entry.action as any,
                        detail: this.formatActionDetail(entry),
                        visibility: (entry.metadata?.visibility as any) || 'VIEWER',
                        timestamp: entry.timestamp
                    };
                    
                    // Emit via the central socket broadcaster to ensure history sync
                    const { emitActivity } = require('../../sockets/index');
                    if (emitActivity) {
                        emitActivity(event);
                    }
                }
            }
        } catch (err) {
            logger.error(`[AuditService] Failed to broadcast activity: ${err.message}`);
        }
    }

    private formatActionDetail(log: AuditLog): string {
        const meta = log.metadata || {};
        const resId = log.resourceId ? `[${log.resourceId.split('-')[0]}]` : '';

        switch(log.action as string) {
            case 'SERVER_START': return `Initalizing node ${resId}`;
            case 'SERVER_STOP': return `Terminating node ${resId}`;
            case 'SERVER_RESTART': return `Rebooting node ${resId}`;
            case 'FILE_EDITED': return `Modified ${meta.path || 'system file'} in ${resId}`;
            case 'CONFIG_CHANGED': return `Updated ${meta.category || 'platform'} settings`;
            case 'USER_CREATED': return `Provisioned new user account: ${meta.username || 'unknown'}`;
            case 'USER_DELETED': return `Revoked access for user: ${meta.username || log.resourceId}`;
            case 'USER_UPDATED': return `Modified profile for user: ${meta.username || log.resourceId}`;
            case 'PLUGIN_INSTALLED': return `Injected plugin ${meta.pluginName || ''} into ${resId}`;
            case 'BACKUP_CREATED': return `Generated system snapshot for ${resId}`;
            case 'COMMAND_SENT': return `Dispatched command to ${resId}: "${meta.command || '...'}"`;
            default: return log.action.replace(/_/g, ' ').toLowerCase();
        }
    }

    public getLogs(options: any = {}): { logs: AuditLog[], total: number } {
        return auditRepository.getLogs(options);
    }


}

export const auditService = new AuditService();
