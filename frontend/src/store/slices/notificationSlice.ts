import { StateCreator } from 'zustand';
import { Notification } from '@shared/types';
import { API } from '../../features/core/services/api';
import { socketService } from '../../features/core/services/socket';
import { StoreState } from '../index';

export interface NotificationSlice {
    notifications: Notification[];
    notificationsLoading: boolean;

    // Actions
    fetchNotifications: () => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    
    // Init
    initNotifications: () => (() => void) | void;
}

export const createNotificationSlice: StateCreator<StoreState, [["zustand/devtools", never], ["zustand/persist", unknown]], [], NotificationSlice> = (set, get) => ({
    notifications: [],
    notificationsLoading: false,

    fetchNotifications: async () => {
        const { user } = get();
        if (!user) return;
        set({ notificationsLoading: true });
        try {
            const data = await API.getNotifications();
            set({ notifications: Array.isArray(data) ? data : [] });
        } catch (e) {
            console.error('[NotificationSlice] Fetch failed:', e);
        } finally {
            set({ notificationsLoading: false });
        }
    },

    markAsRead: async (id) => {
        set(state => ({
            notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
        }));
        try {
            await API.markNotificationRead(id);
        } catch (e) {
            get().fetchNotifications();
        }
    },

    markAllAsRead: async () => {
        set(state => ({
            notifications: state.notifications.map(n => ({ ...n, read: true }))
        }));
        try {
            await API.markAllNotificationsRead();
        } catch (e) {
            get().fetchNotifications();
        }
    },

    deleteNotification: async (id) => {
        set(state => ({
            notifications: state.notifications.filter(n => n.id !== id)
        }));
        try {
            await API.deleteNotification(id);
        } catch (e) {
            get().fetchNotifications();
        }
    },

    initNotifications: () => {
        const socket = socketService.socket;
        if (!socket) return;

        const handleNewNotification = (notification: Notification) => {
            set(state => ({ notifications: [notification, ...state.notifications] }));
            
            // Trigger toast for urgent notifications
            if (notification.type === 'ERROR' || notification.type === 'WARNING') {
                get().addToast(notification.type.toLowerCase() as any, notification.title, notification.message);
            }
        };

        socket.on('notification:new', handleNewNotification);
        
        return () => {
             socket.off('notification:new', handleNewNotification);
        };
    }
});
