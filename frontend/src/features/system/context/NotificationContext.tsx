import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useUser } from '../../auth/context/UserContext';
import { API } from '../../core/services/api';
import { socketService } from '../../core/services/socket'; 
import { Notification } from '@shared/types';
import { useToast } from '../../ui/Toast';
import { useStore } from '@/store';

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    isLoading: boolean;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    fetchNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
    const store = useStore();
    return {
        notifications: store.notifications,
        unreadCount: (Array.isArray(store.notifications) ? store.notifications : []).filter(n => n && !n.read).length,
        isLoading: store.notificationsLoading,
        markAsRead: store.markAsRead,
        markAllAsRead: store.markAllAsRead,
        deleteNotification: store.deleteNotification,
        fetchNotifications: store.fetchNotifications
    };
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const store = useStore();

    useEffect(() => {
        let cleanup: (() => void) | void;
        if (store.user) {
            cleanup = store.initNotifications();
            store.fetchNotifications();
        }
        return () => {
             if (cleanup) cleanup();
        };
    }, [store.user?.id]);

    return <>{children}</>;
};
