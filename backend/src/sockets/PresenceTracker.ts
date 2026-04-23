import {  PresenceEntry, UserRole  } from '@shared/types';

/**
 * In-memory tracker for which users are viewing which servers.
 * Supports role-aware filtering so the OWNER can control who sees presence.
 */
class PresenceTracker {
    // Map<serverId, Map<userId, { entry: PresenceEntry, sockets: Set<string> }>>
    private presence: Map<string, Map<string, { entry: PresenceEntry; sockets: Set<string> }>> = new Map();
    // Map<socketId, { serverId: string; userId: string }[]>
    private socketMap: Map<string, { serverId: string; userId: string }[]> = new Map();

    /**
     * User joins a server room.
     */
    join(serverId: string, user: { id: string; username: string; role: UserRole; avatar?: string }, socketId: string, activeView: string = 'dashboard') {
        if (!this.presence.has(serverId)) {
            this.presence.set(serverId, new Map());
        }

        const serverPresence = this.presence.get(serverId)!;
        let userPresence = serverPresence.get(user.id);

        if (!userPresence) {
            userPresence = {
                entry: {
                    userId: user.id,
                    username: user.username,
                    role: user.role,
                    avatar: user.avatar,
                    joinedAt: Date.now(),
                    activeView
                },
                sockets: new Set()
            };
            serverPresence.set(user.id, userPresence);
        }

        userPresence.sockets.add(socketId);
        // Always update active view to latest socket's view
        userPresence.entry.activeView = activeView;

        // Track socket -> server mapping for disconnect cleanup
        if (!this.socketMap.has(socketId)) {
            this.socketMap.set(socketId, []);
        }
        const mappings = this.socketMap.get(socketId)!;
        if (!mappings.some(m => m.serverId === serverId)) {
            mappings.push({ serverId, userId: user.id });
        }
    }

    /**
     * User leaves a server room (explicitly or via socket disconnect).
     */
    leave(serverId: string, userId: string, socketId?: string) {
        const serverPresence = this.presence.get(serverId);
        if (!serverPresence) return false;

        const userPresence = serverPresence.get(userId);
        if (!userPresence) return false;

        if (socketId) {
            userPresence.sockets.delete(socketId);
        }

        // Only remove from presence list if no more sockets are watching this server
        if (userPresence.sockets.size === 0 || !socketId) {
            serverPresence.delete(userId);
            if (serverPresence.size === 0) {
                this.presence.delete(serverId);
            }
            return true; // Actually left
        }

        return false; // Still present via other sockets
    }

    /**
     * Update user's active view.
     */
    updateView(serverId: string, userId: string, activeView: string) {
        const userPresence = this.presence.get(serverId)?.get(userId);
        if (userPresence) {
            userPresence.entry.activeView = activeView;
        }
    }

    /**
     * Get all present users for a server.
     */
    getPresence(serverId: string, minRole?: UserRole): PresenceEntry[] {
        const serverPresence = this.presence.get(serverId);
        if (!serverPresence) return [];

        const entries = Array.from(serverPresence.values()).map(p => p.entry);
        if (!minRole) return entries;

        const roleRank: Record<UserRole, number> = { 'VIEWER': 0, 'MANAGER': 1, 'ADMIN': 2, 'OWNER': 3 };
        const minRank = roleRank[minRole] ?? 0;
        return entries.filter(e => roleRank[e.role] >= minRank);
    }

    /**
     * Clean up all presence entries for a disconnected socket.
     */
    disconnectSocket(socketId: string): string[] {
        const mappings = this.socketMap.get(socketId);
        if (!mappings) return [];

        const affectedServers: string[] = [];
        for (const { serverId, userId } of mappings) {
            const actuallyLeft = this.leave(serverId, userId, socketId);
            if (actuallyLeft && !affectedServers.includes(serverId)) {
                affectedServers.push(serverId);
            }
        }

        this.socketMap.delete(socketId);
        return affectedServers;
    }

    /**
     * Get count of active viewers per server (for dashboard overview).
     */
    getViewersCount(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const [serverId, users] of this.presence.entries()) {
            counts[serverId] = users.size;
        }
        return counts;
    }

    /**
     * Completely purges all presence tracking for a server.
     * Use this when a server is DELETED.
     */
    public clear(serverId: string) {
        this.presence.delete(serverId);
        // Also remove from socketMap to avoid stale references during disconnect
        for (const [socketId, mappings] of this.socketMap.entries()) {
            const updated = mappings.filter(m => m.serverId !== serverId);
            if (updated.length !== mappings.length) {
                this.socketMap.set(socketId, updated);
            }
        }
    }
}

export const presenceTracker = new PresenceTracker();
