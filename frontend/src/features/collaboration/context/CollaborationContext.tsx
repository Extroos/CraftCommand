import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { PresenceEntry, ActivityEvent, ChatMessage, UserRole } from '@shared/types';
import { socketService } from '../../core/services/socket';
import { useServers } from '../../servers/context/ServerContext';
import { useUser } from '../../auth/context/UserContext';
import { useStore } from '@/store';

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

export const useCollaboration = () => {
    const store = useStore();
    return {
        presence: store.presence,
        activities: store.activities,
        chatMessages: store.chatMessages,
        typingUsers: store.typingUsers,
        sendChat: store.sendChat,
        sendTyping: store.sendTyping,
        updateActiveView: store.updateActiveView
    };
};

export const CollaborationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const store = useStore();

    useEffect(() => {
        let cleanup: (() => void) | void;
        if (store.user) {
            cleanup = store.initCollab();
            // Initial join
            socketService.joinServer('global', 'dashboard');
        }
        return () => {
             if (cleanup) cleanup();
        };
    }, [store.user?.id]);

    return <>{children}</>;
};
