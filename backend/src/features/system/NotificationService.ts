import { notificationRepository } from '../../storage/NotificationRepository';
import {  Notification, NotificationType  } from '@shared/types';
import { io } from '../../sockets';
// import { SeraphicClient } from '../../integrations/discord/SeraphicClient';
import { getServer } from '../servers/ServerService';
import { processManager } from '../processes/ProcessManager';
import { logger } from '../../utils/logger';

export class NotificationService {
    
    public async create(userId: string, type: NotificationType, title: string, message: string, metadata?: any, link?: string, options?: { dismissible?: boolean, actionLabel?: string }): Promise<Notification> {
        const notification: Notification = {
            id: Math.random().toString(36).substring(7),
            userId,
            type,
            title,
            message,
            read: false,
            createdAt: Date.now(),
            metadata,
            link,
            actionLabel: options?.actionLabel,
            dismissible: options?.dismissible ?? true
        };

        notificationRepository.create(notification);

        // Broadcast via Socket.IO
        if (io) {
            if (userId === 'ALL') {
                io.emit('notification:new', notification);
            } else {
                // Assuming we have rooms for users, or we just emit to all and client filters (less secure/efficient but simple)
                // Better: Emit to specific user room if mapped. 
                // For this implementation, we will emit to a room named `user:${userId}`
                io.to(`user:${userId}`).emit('notification:new', notification);
            }
        }

        // Auto-prune on create (maintain last 100 per user approx, or global)
        // Pruning often is expensive if file is huge, but fine for now. 
        // We'll prune every 10th notification or just do it.
        // Let's do it safely in background promise (no await)
        this.pruneOld();

        return notification;
    }

    public getAll(userId: string, limit: number = 50, unreadOnly: boolean = false): Notification[] {
        return notificationRepository.getForUser(userId, { limit, unreadOnly });
    }

    public markRead(id: string): void {
        notificationRepository.markAsRead(id);
    }

    public markAllRead(userId: string): void {
        notificationRepository.markAllAsRead(userId);
    }

    public delete(id: string): boolean {
        return notificationRepository.delete(id);
    }

    public pruneOld(): void {
        notificationRepository.prune(100);
    }
}

export const notificationService = new NotificationService();
