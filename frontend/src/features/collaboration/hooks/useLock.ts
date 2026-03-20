import { useState, useEffect, useCallback } from 'react';
import { socketService } from '../../core/services/socket';

export interface ResourceLock {
    resourceId: string;
    userId: string;
    username: string;
    socketId: string;
    expiresAt: number;
}

export const useLock = (resourceId: string, currentUserId: string) => {
    const [lock, setLock] = useState<ResourceLock | null>(null);
    const [isLockedByMe, setIsLockedByMe] = useState(false);
    const [isLockedByOther, setIsLockedByOther] = useState(false);

    useEffect(() => {
        const handleLockUpdate = (data: { resourceId: string, lock: ResourceLock | null }) => {
            if (data.resourceId === resourceId) {
                setLock(data.lock);
                if (data.lock) {
                    setIsLockedByMe(data.lock.userId === currentUserId);
                    setIsLockedByOther(data.lock.userId !== currentUserId);
                } else {
                    setIsLockedByMe(false);
                    setIsLockedByOther(false);
                }
            }
        };

        const handleLockError = (data: { resourceId: string, message: string }) => {
            if (data.resourceId === resourceId) {
                // Handle error (e.g., toast notification)
                console.error(`Locking error for ${resourceId}: ${data.message}`);
            }
        };

        socketService.socket.on('lock:update', handleLockUpdate);
        socketService.socket.on('lock:error', handleLockError);

        return () => {
            socketService.socket.off('lock:update', handleLockUpdate);
            socketService.socket.off('lock:error', handleLockError);
        };
    }, [resourceId, currentUserId]);

    const acquireLock = useCallback(() => {
        socketService.socket.emit('lock:acquire', { resourceId });
    }, [resourceId]);

    const releaseLock = useCallback(() => {
        socketService.socket.emit('lock:release', { resourceId });
    }, [resourceId]);

    return {
        lock,
        isLockedByMe,
        isLockedByOther,
        acquireLock,
        releaseLock
    };
};
