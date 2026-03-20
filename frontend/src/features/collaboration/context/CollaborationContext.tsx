import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { PresenceEntry, ActivityEvent, ChatMessage, UserRole } from '@shared/types';
import { socketService } from '../../core/services/socket';
import { useServers } from '../../servers/context/ServerContext';
import { useUser } from '../../auth/context/UserContext';

interface CollaborationState {
    // Presence
    presence: Record<string, PresenceEntry[]>;   // serverId -> users
    // Activity Feed
    activities: Record<string, ActivityEvent[]>;  // serverId -> events
    // Chat
    chatMessages: Record<string, ChatMessage[]>;  // serverId -> messages
    typingUsers: Record<string, { userId: string; username: string }[]>;
    // Actions
    sendChat: (serverId: string, content: string) => void;
    sendTyping: (serverId: string) => void;
    updateActiveView: (serverId: string, view: string) => void;
}

const CollaborationContext = createContext<CollaborationState | undefined>(undefined);

const ROLE_RANK: Record<UserRole, number> = { 'VIEWER': 0, 'MANAGER': 1, 'ADMIN': 2, 'OWNER': 3 };

const meetsRole = (userRole: UserRole | undefined, minRole: UserRole): boolean => {
    if (!userRole) return false;
    return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
};

export const CollaborationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentServer } = useServers();
    const { user } = useUser();
    const [presence, setPresence] = useState<Record<string, PresenceEntry[]>>({});
    const [activities, setActivities] = useState<Record<string, ActivityEvent[]>>({});
    const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
    const [typingUsers, setTypingUsers] = useState<Record<string, { userId: string; username: string }[]>>({});
    const lastServerId = useRef<string | null>(null);
    const typingTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

    // 1. Auto join global room for global team chat/activity
    useEffect(() => {
        if (user) {
            socketService.joinServer('global', 'dashboard');
        } else {
            socketService.leaveServer('global');
        }
    }, [user]);

    // 2. Dynamically join specific server room for logs/status/stats
    useEffect(() => {
        if (!user) return;
        
        const serverId = currentServer?.id;
        if (serverId === lastServerId.current) return;
        
        // Leave previous specific server room
        if (lastServerId.current) {
            socketService.leaveServer(lastServerId.current);
        }
        
        // Join new specific server room
        if (serverId && serverId !== 'global') {
            socketService.joinServer(serverId, 'dashboard');
            lastServerId.current = serverId;
        } else {
            lastServerId.current = null;
        }
    }, [currentServer?.id, user]);

    // Socket event listeners — registered once, not per-server
    useEffect(() => {
        // --- Presence ---
        const unsubPresence = socketService.onPresenceUpdate((data) => {
            setPresence(prev => ({
                ...prev,
                [data.serverId]: data.users
            }));
        });

        // --- Activity: single new event ---
        const unsubActivity = socketService.onActivityNew((event: ActivityEvent) => {
            setActivities(prev => {
                const existing = prev[event.serverId] || [];
                // Deduplicate by id
                if (existing.some(e => e.id === event.id)) return prev;
                const updated = [event, ...existing].slice(0, 100);
                return { ...prev, [event.serverId]: updated };
            });
        });

        // --- Activity: history dump (late joiner catch-up) ---
        const unsubActivityHistory = socketService.socket.on('activity:history', (data: { serverId: string; events: ActivityEvent[] }) => {
            setActivities(prev => {
                const existing = prev[data.serverId] || [];
                const existingIds = new Set(existing.map(e => e.id));
                const newEvents = data.events.filter(e => !existingIds.has(e.id));
                const merged = [...newEvents.reverse(), ...existing].slice(0, 100);
                return { ...prev, [data.serverId]: merged };
            });
        });

        // --- Chat: single new message ---
        const unsubChat = socketService.onChatMessage((message: ChatMessage) => {
            setChatMessages(prev => {
                const existing = prev[message.serverId] || [];
                // Deduplicate by id
                if (existing.some(m => m.id === message.id)) return prev;
                const updated = [...existing, message].slice(-200);
                return { ...prev, [message.serverId]: updated };
            });
        });

        // --- Chat: history dump (late joiner catch-up) ---
        const unsubChatHistory = socketService.socket.on('chat:history', (data: { serverId: string; messages: ChatMessage[] }) => {
            setChatMessages(prev => {
                const existing = prev[data.serverId] || [];
                const existingIds = new Set(existing.map(m => m.id));
                const newMsgs = data.messages.filter(m => !existingIds.has(m.id));
                const merged = [...newMsgs, ...existing].slice(-200);
                return { ...prev, [data.serverId]: merged };
            });
        });

        // --- Typing indicators ---
        const unsubTyping = socketService.onChatTyping((data) => {
            setTypingUsers(prev => {
                // We need to figure out which server from context
                // Since typing events are server-scoped via rooms, we use the current
                const entries = Object.entries(prev);
                const updated = { ...prev };
                // Add to all active servers (typing comes from the right room)
                for (const [serverId] of entries) {
                    const existing = updated[serverId] || [];
                    if (!existing.some(u => u.userId === data.userId)) {
                        updated[serverId] = [...existing, data];
                    }
                }
                // If no entries exist yet, add to a generic key
                if (entries.length === 0) {
                    updated['_current'] = [data];
                }
                return updated;
            });

            // Clear typing indicator after 3 seconds
            const key = `typing-${data.userId}`;
            if (typingTimeouts.current[key]) clearTimeout(typingTimeouts.current[key]);
            typingTimeouts.current[key] = setTimeout(() => {
                setTypingUsers(prev => {
                    const updated = { ...prev };
                    for (const serverId of Object.keys(updated)) {
                        updated[serverId] = (updated[serverId] || []).filter(u => u.userId !== data.userId);
                    }
                    return updated;
                });
            }, 3000);
        });

        // --- Errors ---
        const unsubError = socketService.onCollabError((data) => {
            console.warn('[Collab]', data.message);
        });

        // --- Reconnection Resilience ---
        const handleReconnect = () => {
            if (lastServerId.current) {
                socketService.joinServer(lastServerId.current, 'dashboard');
            }
        };
        socketService.socket.on('reconnect', handleReconnect);
        socketService.socket.on('connect', handleReconnect); // Also handle initial connect/manual reconnection

        return () => {
            unsubPresence();
            unsubActivity();
            unsubChat();
            unsubTyping();
            unsubError();
            socketService.socket.off('reconnect', handleReconnect);
            socketService.socket.off('connect', handleReconnect);
            // Manual cleanup for direct .on() calls
            socketService.socket.off('chat:history');
            socketService.socket.off('activity:history');
        };
    }, []); // Register ONCE — no dependency on currentServer

    const sendChat = useCallback((serverId: string, content: string) => {
        socketService.sendChatMessage('global', content);
    }, []);

    const sendTyping = useCallback((serverId: string) => {
        socketService.sendChatTyping('global');
    }, []);

    const updateActiveView = useCallback((serverId: string, view: string) => {
        socketService.updateView('global', view);
    }, []);

    return (
        <CollaborationContext.Provider value={{
            presence,
            activities,
            chatMessages,
            typingUsers,
            sendChat,
            sendTyping,
            updateActiveView
        }}>
            {children}
        </CollaborationContext.Provider>
    );
};

export const useCollaboration = () => {
    const context = useContext(CollaborationContext);
    if (!context) {
        throw new Error('useCollaboration must be used within a CollaborationProvider');
    }
    return context;
};
