import { Server, Socket } from 'socket.io';
import DOMPurify from 'isomorphic-dompurify';
import { socketAuthMiddleware } from './middleware/authMiddleware';
import { jitterMiddleware } from './middleware/JitterMiddleware';
import { registerBroadcasters } from './broadcasters';
import { handleCommand } from './handlers/commandHandler';
import { presenceTracker } from './PresenceTracker';
import {  CollabSettings, UserRole, ChatMessage, ActivityEvent  } from '@shared/types';
import { serverRepository } from '../storage/ServerRepository';
import { userRepository } from '../storage/UserRepository';
import { systemSettingsService } from '../features/system/SystemSettingsService';
import { javaManager } from '../features/processes/JavaManager';
import { installerService } from '../features/installer/InstallerService';
import { lockingService } from './LockingService';

export let io: Server;

/** Default collab settings — everything visible to everyone */
const DEFAULT_COLLAB: CollabSettings = {
    activityFeed: { enabled: true, minRole: 'VIEWER' },
    chat: { enabled: true, minRole: 'VIEWER', minSendRole: 'VIEWER' },
    presence: { enabled: true, minRole: 'VIEWER' },
    console: { readRole: 'VIEWER', writeRole: 'MANAGER' }
};

const ROLE_RANK: Record<UserRole, number> = { 'VIEWER': 0, 'MANAGER': 1, 'ADMIN': 2, 'OWNER': 3 };

/** Check if a user's role meets the minimum requirement */
const meetsRole = (userRole: UserRole, minRole: UserRole): boolean => {
    return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
};

/** Helper to get merged collab settings for a server */
const getCollabSettings = (serverId: string): CollabSettings => {
    const server = serverRepository.findById(serverId);
    if (!server?.collabSettings) return { ...DEFAULT_COLLAB };
    return {
        activityFeed: { ...DEFAULT_COLLAB.activityFeed, ...server.collabSettings.activityFeed },
        chat: { ...DEFAULT_COLLAB.chat, ...server.collabSettings.chat },
        presence: { ...DEFAULT_COLLAB.presence, ...server.collabSettings.presence },
        console: { ...DEFAULT_COLLAB.console, ...server.collabSettings.console },
    };
};

// ===== In-Memory Chat History Buffer (per server, last 50 messages) =====
const chatHistory: Map<string, ChatMessage[]> = new Map();
const CHAT_HISTORY_LIMIT = 50;

const pushChatHistory = (serverId: string, message: ChatMessage) => {
    if (!chatHistory.has(serverId)) chatHistory.set(serverId, []);
    const history = chatHistory.get(serverId)!;
    history.push(message);
    if (history.length > CHAT_HISTORY_LIMIT) history.shift();
};

const getChatHistory = (serverId: string): ChatMessage[] => {
    return chatHistory.get(serverId) || [];
};

// ===== In-Memory Activity Buffer (per server, last 30 events) =====
const activityHistory: Map<string, ActivityEvent[]> = new Map();
const ACTIVITY_HISTORY_LIMIT = 30;

const pushActivityHistory = (serverId: string, event: ActivityEvent) => {
    if (!activityHistory.has(serverId)) activityHistory.set(serverId, []);
    const history = activityHistory.get(serverId)!;
    history.push(event);
    if (history.length > ACTIVITY_HISTORY_LIMIT) history.shift();
};

const getActivityHistory = (serverId: string): ActivityEvent[] => {
    return activityHistory.get(serverId) || [];
};

// ===== Rate Limiter (per user, max 5 messages per 3 seconds) =====
const rateLimitMap: Map<string, number[]> = new Map();
const RATE_LIMIT_WINDOW_MS = 3000;
const RATE_LIMIT_MAX = 5;

const isRateLimited = (userId: string): boolean => {
    const now = Date.now();
    if (!rateLimitMap.has(userId)) rateLimitMap.set(userId, []);
    const timestamps = rateLimitMap.get(userId)!;
    
    // Remove old timestamps outside the window
    while (timestamps.length > 0 && timestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
        timestamps.shift();
    }

    if (timestamps.length >= RATE_LIMIT_MAX) return true;
    timestamps.push(now);
    return false;
};

// ===== Sanitize message content =====
const sanitize = (content: string): string => {
    return DOMPurify.sanitize(content.trim().substring(0, 500));
};

// ===== Emit an activity event (persisted & broadcast) =====
const emitActivity = (serverId: string, event: ActivityEvent) => {
    pushActivityHistory(serverId, event);
    io.to(`server:${serverId}`).emit('activity:new', event);
};

const makeActivityId = () => `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

export const setupSocket = (socketIo: Server) => {
    io = socketIo;
    
    // 1. Setup Global Broadcasters (Service -> IO)
    registerBroadcasters(io);

    // 1.5 Setup Node Agent Namespace (/agent)
    const { setupAgentNamespace } = require('../features/nodes/NodeAgentHandler');
    setupAgentNamespace(io);

    // 2. Authentication Middleware
    io.use(jitterMiddleware);
    io.use(socketAuthMiddleware);

    // 3. Connection Handling
    io.on('connection', (socket: Socket) => {
        const user = (socket as any).user;
        if (user) {
            socket.join(`user:${user.id}`);
            console.log(`[Socket] ✓ Connected: ${user.username} (${user.role}) [${socket.id}]`);
        } else {
            console.log(`[Socket] ✗ Anonymous connection: ${socket.id}`);
            return; // Don't register handlers for anonymous sockets
        }
        
        // --- 3.1 Initial State Synchronization (Phase 56.3) ---
        // Send current Java install status if active
        if (javaManager.currentStatus) {
            socket.emit('install:status', javaManager.currentStatus);
        }
        
        // Send all active server installations
        const activeInstalls = installerService.getActiveProgress();
        if (Object.keys(activeInstalls).length > 0) {
            socket.emit('install:active-all', activeInstalls);
        }

        // Handle explicit sync request
        socket.on('sync:reconnect', () => {
            if (javaManager.currentStatus) {
                socket.emit('install:status', javaManager.currentStatus);
            }
            const active = installerService.getActiveProgress();
            if (Object.keys(active).length > 0) {
                socket.emit('install:active-all', active);
            }
        });

        // --- Server Room Management (Collaboration) ---

        socket.on('server:join', ({ serverId, activeView }) => {
            if (!serverId) return;

            // Block collaboration if not in Host Mode
            if (!systemSettingsService.isHostMode()) {
                // Silently join the room for basic updates (console etc), but don't track presence
                socket.join(`server:${serverId}`);
                return;
            }

            const collab = getCollabSettings(serverId);

            // Verify server exists (unless it's the global room)
            if (serverId !== 'global') {
                const server = serverRepository.findById(serverId);
                if (!server) {
                    socket.emit('collab:error', { message: 'Server not found.' });
                    return;
                }
            }

            // Only allow joining if role meets minimum
            if (!meetsRole(user.role, collab.presence.minRole)) {
                socket.emit('collab:error', { message: 'Insufficient permissions to view this server.' });
                return;
            }

            socket.join(`server:${serverId}`);
            
            // Get latest user info for the presence list (Sync call)
            const latestUser = userRepository.findById(user.id);
            const finalUser = latestUser || user;
            
            presenceTracker.join(serverId, { 
                id: finalUser.id, 
                username: finalUser.username, 
                role: finalUser.role, 
                avatar: finalUser.avatarUrl 
            }, socket.id, activeView || 'dashboard');
            
            console.log(`[Collab] ${finalUser.username} joined server:${serverId} (view: ${activeView || 'dashboard'})`);
            
            // Send chat history to this client (catch-up for late joiners)
            const history = getChatHistory(serverId);
            if (history.length > 0) {
                socket.emit('chat:history', { serverId, messages: history });
            }

            // Send activity history to this client
            const actHistory = getActivityHistory(serverId);
            if (actHistory.length > 0) {
                socket.emit('activity:history', { serverId, events: actHistory });
            }

            // Broadcast updated presence to the ENTIRE room
            if (collab.presence.enabled) {
                io.to(`server:${serverId}`).emit('presence:update', {
                    serverId,
                    users: presenceTracker.getPresence(serverId)
                });
            }

            // Emit activity event: user joined
            emitActivity(serverId, {
                id: makeActivityId(),
                serverId,
                userId: user.id,
                username: user.username,
                action: 'USER_JOINED_PANEL',
                detail: `${user.username} joined the panel`,
                visibility: 'VIEWER',
                timestamp: Date.now()
            });
        });

        socket.on('server:leave', ({ serverId }) => {
            if (!serverId) return;

            socket.leave(`server:${serverId}`);
            
            if (!systemSettingsService.isHostMode()) return;

            presenceTracker.leave(serverId, user.id);
            console.log(`[Collab] ${user.username} left server:${serverId}`);

            const collab = getCollabSettings(serverId);

            if (collab.presence.enabled) {
                io.to(`server:${serverId}`).emit('presence:update', {
                    serverId,
                    users: presenceTracker.getPresence(serverId)
                });
            }

            emitActivity(serverId, {
                id: makeActivityId(),
                serverId,
                userId: user.id,
                username: user.username,
                action: 'USER_LEFT_PANEL',
                detail: `${user.username} left the panel`,
                visibility: 'VIEWER',
                timestamp: Date.now()
            });
        });

        // Update active view (e.g., user switched from Console to Files)
        socket.on('server:view', ({ serverId, activeView }) => {
            if (!serverId || !systemSettingsService.isHostMode()) return;
            presenceTracker.updateView(serverId, user.id, activeView);

            const collab = getCollabSettings(serverId);
            if (collab.presence.enabled) {
                io.to(`server:${serverId}`).emit('presence:update', {
                    serverId,
                    users: presenceTracker.getPresence(serverId)
                });
            }
        });

        // --- Chat ---

        socket.on('chat:send', ({ serverId, content }) => {
            if (!serverId || !content?.trim()) return;

            if (!systemSettingsService.isHostMode()) {
                socket.emit('collab:error', { message: 'Chat is disabled in Solo Mode.' });
                return;
            }

            const collab = getCollabSettings(serverId);
            if (!collab.chat.enabled) {
                socket.emit('collab:error', { message: 'Chat is disabled for this server.' });
                return;
            }
            if (!meetsRole(user.role, collab.chat.minSendRole)) {
                socket.emit('collab:error', { message: `Chat requires ${collab.chat.minSendRole} role or higher.` });
                return;
            }

            // RATE LIMIT: prevent spam
            if (isRateLimited(user.id)) {
                socket.emit('collab:error', { message: 'Slow down! You are sending messages too fast.' });
                return;
            }

            // Fetch latest user info from DB to ensure PFP changes are reflected instantly (Sync call)
            const latestUser = userRepository.findById(user.id);
            const finalUser = latestUser || user;

            let actualContent = sanitize(content);
            let isWhisper = false;
            let targetUserId: string | null = null;
            let targetUsername: string | null = null;

            if (content.trim().startsWith('/w @')) {
                const parts = content.trim().split(' ');
                if (parts.length < 3) {
                    socket.emit('collab:error', { message: 'Usage: /w @username message' });
                    return;
                }
                const potentialUsername = parts[1].substring(1); // strip '@'
                const targetUser = userRepository.findAll().find(u => u.username.toLowerCase() === potentialUsername.toLowerCase());
                
                if (!targetUser) {
                    socket.emit('collab:error', { message: `User @${potentialUsername} not found.` });
                    return;
                }
                
                isWhisper = true;
                targetUserId = targetUser.id;
                targetUsername = targetUser.username;
                actualContent = sanitize(parts.slice(2).join(' '));
            }

            const message: ChatMessage = {
                id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                serverId,
                userId: finalUser.id,
                username: finalUser.username,
                role: finalUser.role,
                avatar: finalUser.avatarUrl,
                content: actualContent,
                timestamp: Date.now(),
                type: isWhisper ? 'whisper' : 'message'
            };

            if (!isWhisper) {
                pushChatHistory(serverId, message);
                io.to(`server:${serverId}`).emit('chat:message', message);
                console.log(`[Chat] ${finalUser.username} → server:${serverId}: "${actualContent.trim().substring(0, 60)}"`);
            } else {
                socket.emit('chat:message', { ...message, content: `(To @${targetUsername}) ${actualContent}` });
                if (targetUserId && targetUserId !== user.id) {
                     io.to(`user:${targetUserId}`).emit('chat:message', { ...message, content: `(From @${finalUser.username}) ${actualContent}` });
                }
                console.log(`[Whisper] ${finalUser.username} → ${targetUsername}: "${actualContent.trim().substring(0, 60)}"`);
            }
        });

        // --- Configuration Locking (Phase 12) ---

        socket.on('lock:acquire', ({ resourceId }) => {
            if (!resourceId || !systemSettingsService.isHostMode()) return;
            
            const lock = lockingService.acquireLock(resourceId, user, socket.id);
            if (lock) {
                // Broadcast lock to Everyone in the relevant room
                // resourceId format e.g. "server:123:settings"
                const serverId = resourceId.split(':')[1];
                const room = serverId && serverId !== 'global' ? `server:${serverId}` : 'server:global';
                
                io.to(room).emit('lock:update', { resourceId, lock });
                console.log(`[Locking] ${user.username} acquired lock on ${resourceId}`);
            } else {
                socket.emit('lock:error', { resourceId, message: 'Resource is already locked.' });
            }
        });

        socket.on('lock:release', ({ resourceId }) => {
            if (!resourceId || !systemSettingsService.isHostMode()) return;
            
            if (lockingService.releaseLock(resourceId, user.id)) {
                const serverId = resourceId.split(':')[1];
                const room = serverId && serverId !== 'global' ? `server:${serverId}` : 'server:global';
                
                io.to(room).emit('lock:update', { resourceId, lock: null });
                console.log(`[Locking] ${user.username} released lock on ${resourceId}`);
            }
        });

        socket.on('chat:typing', ({ serverId }) => {
            if (!serverId || !systemSettingsService.isHostMode()) return;
            // Broadcast to everyone EXCEPT the sender
            socket.to(`server:${serverId}`).emit('chat:typing', {
                userId: user.id,
                username: user.username
            });
        });

        // --- Disconnect Cleanup ---

        socket.on('disconnect', () => {
            console.log(`[Socket] ✗ Disconnected: ${user.username} [${socket.id}]`);

            // Release all locks held by this socket (#6 — Ghost Locks)
            const released = lockingService.releaseAllForSocket(socket.id);
            if (released.length > 0) {
                console.log(`[Locking] Released ${released.length} lock(s) for disconnected socket ${socket.id}`);
                for (const resourceId of released) {
                    const serverId = resourceId.split(':')[1];
                    const room = serverId && serverId !== 'global' ? `server:${serverId}` : 'server:global';
                    io.to(room).emit('lock:update', { resourceId, lock: null });
                }
            }
            const affectedServers = presenceTracker.disconnectSocket(socket.id);
            for (const serverId of affectedServers) {
                io.to(`server:${serverId}`).emit('presence:update', {
                    serverId,
                    users: presenceTracker.getPresence(serverId)
                });

                emitActivity(serverId, {
                    id: makeActivityId(),
                    serverId,
                    userId: user.id,
                    username: user.username,
                    action: 'USER_LEFT_PANEL',
                    detail: `${user.username} disconnected`,
                    visibility: 'VIEWER',
                    timestamp: Date.now()
                });
            }
        });

        // Command handling - Secure
        socket.on('command', (data) => handleCommand(socket, data));
    });
};
