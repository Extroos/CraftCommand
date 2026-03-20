import { UserProfile } from '@shared/types';

export interface ResourceLock {
    resourceId: string; // e.g., 'server:123:settings', 'system:global:settings'
    userId: string;
    username: string;
    socketId: string;
    expiresAt: number;
}

class LockingService {
    private locks: Map<string, ResourceLock> = new Map();
    private LOCK_TIMEOUT = 30000; // 30 seconds

    acquireLock(resourceId: string, user: UserProfile, socketId: string): ResourceLock | null {
        const now = Date.now();
        const existing = this.locks.get(resourceId);

        if (existing && existing.expiresAt > now && existing.userId !== user.id) {
            return null; // Locked by someone else
        }

        const lock: ResourceLock = {
            resourceId,
            userId: user.id,
            username: user.username,
            socketId,
            expiresAt: now + this.LOCK_TIMEOUT
        };

        this.locks.set(resourceId, lock);
        return lock;
    }

    releaseLock(resourceId: string, userId: string): boolean {
        const lock = this.locks.get(resourceId);
        if (lock && lock.userId === userId) {
            this.locks.delete(resourceId);
            return true;
        }
        return false;
    }

    releaseAllForSocket(socketId: string): string[] {
        const released: string[] = [];
        for (const [id, lock] of this.locks.entries()) {
            if (lock.socketId === socketId) {
                this.locks.delete(id);
                released.push(id);
            }
        }
        return released;
    }

    getLock(resourceId: string): ResourceLock | undefined {
        const lock = this.locks.get(resourceId);
        if (lock && lock.expiresAt > Date.now()) {
            return lock;
        }
        return undefined;
    }

    cleanup() {
        const now = Date.now();
        for (const [id, lock] of this.locks.entries()) {
            if (lock.expiresAt < now) {
                this.locks.delete(id);
            }
        }
    }
}

export const lockingService = new LockingService();

// Auto-cleanup every 10s
setInterval(() => lockingService.cleanup(), 10000);
