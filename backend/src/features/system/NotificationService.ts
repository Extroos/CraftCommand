import { notificationRepository } from '../../storage/NotificationRepository';
import {  Notification, NotificationType  } from '@shared/types';
import { io } from '../../sockets';
// import { SeraphicClient } from '../../integrations/discord/SeraphicClient';
import { getServer } from '../servers/ServerService';
import { processManager } from '../processes/ProcessManager';
import { logger } from '../../utils/logger';
import crypto from 'crypto';

export class NotificationService {
    
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private pendingGroups: Map<string, { notification: Notification, count: number }> = new Map();
    
    public async broadcast(type: NotificationType, title: string, message: string, metadata?: any): Promise<Notification> {
        return this.create('ALL', type, title, message, metadata);
    }

    public async create(userId: string, type: NotificationType, title: string, message: string, metadata?: any, link?: string, options?: { dismissible?: boolean, actionLabel?: string }): Promise<Notification> {
        // Check for grouping eligibility
        // Specifically for repetitive system tasks like Automatic Repair
        const groupKey = metadata?.serverId && metadata?.actionType ? `${userId}:${metadata.serverId}:${metadata.actionType}` : null;

        if (groupKey && (metadata?.actionType === 'INSTALL_DEPENDENCY')) {
            return this.createGrouped(groupKey, userId, type, title, message, metadata, link, options);
        }

        return this.executeCreate(userId, type, title, message, metadata, link, options);
    }

    private async createGrouped(groupKey: string, userId: string, type: NotificationType, title: string, message: string, metadata?: any, link?: string, options?: { dismissible?: boolean, actionLabel?: string }): Promise<Notification> {
        const pending = this.pendingGroups.get(groupKey);
        
        if (pending) {
            pending.count++;
            // Update the message to reflect multiple actions
            pending.notification.message = `${title}: Applied ${pending.count} fixes to ${metadata.serverId || 'server'}.`;
            pending.notification.createdAt = Date.now(); // Bump timestamp
            
            // Clear existing timer
            if (this.debounceTimers.has(groupKey)) {
                clearTimeout(this.debounceTimers.get(groupKey)!);
            }
        } else {
            const notification: Notification = {
                id: crypto.randomUUID(),
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
            this.pendingGroups.set(groupKey, { notification, count: 1 });
        }

        // Set timer to commit the notification after 2 seconds of silence
        const timer = setTimeout(() => {
            const final = this.pendingGroups.get(groupKey);
            if (final) {
                this.commitNotification(final.notification);
                this.pendingGroups.delete(groupKey);
                this.debounceTimers.delete(groupKey);
            }
        }, 2000);

        this.debounceTimers.set(groupKey, timer);
        
        // Return the pending or new notification (won't be in DB yet)
        return this.pendingGroups.get(groupKey)!.notification;
    }

    private async executeCreate(userId: string, type: NotificationType, title: string, message: string, metadata?: any, link?: string, options?: { dismissible?: boolean, actionLabel?: string }): Promise<Notification> {
        const notification: Notification = {
            id: crypto.randomUUID(),
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

        return this.commitNotification(notification);
    }

    private async commitNotification(notification: Notification): Promise<Notification> {
        notificationRepository.create(notification);

        // Broadcast via Socket.IO
        if (io) {
            if (notification.userId === 'ALL') {
                io.emit('notification:new', notification);
            } else {
                io.to(`user:${notification.userId}`).emit('notification:new', notification);
            }
        }

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
        this.cleanupState();
    }

    /**
     * Internal cleanup for memory optimization.
     * Removes stale debounce timers and pending groups if they persist beyond expected TTL.
     */
    private cleanupState(): void {
        const now = Date.now();
        const MAX_PENDING_AGE = 60000; // 60 seconds safety TTL

        for (const [key, pending] of this.pendingGroups.entries()) {
            if (now - pending.notification.createdAt > MAX_PENDING_AGE) {
                logger.debug(`[NotificationService] Pruning stale pending group: ${key}`);
                this.pendingGroups.delete(key);
                if (this.debounceTimers.has(key)) {
                    clearTimeout(this.debounceTimers.get(key)!);
                    this.debounceTimers.delete(key);
                }
            }
        }
    }
}

export const notificationService = new NotificationService();
