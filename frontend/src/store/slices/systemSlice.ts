import { StateCreator } from 'zustand';
import { GlobalSettings, NodeInfo } from '@shared/types';
import { API } from '../../features/core/services/api';
import { socketService } from '../../features/core/services/socket';
import { StoreState } from '../index';

export interface SystemSlice {
    settings: GlobalSettings | null;
    nodes: NodeInfo[];
    systemLoading: boolean;
    isRestarting: boolean;
    isReconnecting: boolean;
    isActivityTrayOpen: boolean;
    
    // Actions
    setActivityTrayOpen: (open: boolean) => void;
    refreshSettings: () => Promise<void>;
    triggerRestart: () => Promise<void>;
    initSystem: () => (() => void) | void;
}

export const createSystemSlice: StateCreator<StoreState, [["zustand/devtools", never], ["zustand/persist", unknown]], [], SystemSlice> = (set, get) => ({
    settings: null,
    nodes: [],
    systemLoading: true,
    isRestarting: false,
    isReconnecting: false,
    isActivityTrayOpen: false,

    setActivityTrayOpen: (open) => set({ isActivityTrayOpen: open }),

    refreshSettings: async () => {
        const { isAuthenticated } = get();
        if (!isAuthenticated) {
            set({ systemLoading: false });
            return;
        }

        try {
            const data = await API.getGlobalSettings();
            set({ settings: data });

            if (data?.app?.distributedNodes?.enabled) {
                try {
                    const nodeData = await API.getNodes();
                    set({ nodes: nodeData.nodes || [] });
                } catch { /* non-fatal */ }
            } else {
                set({ nodes: [] });
            }
        } catch (e) {
            console.error('[SystemSlice] Failed to fetch settings:', e);
        } finally {
            set({ systemLoading: false });
        }
    },

    triggerRestart: async () => {
        set({ isRestarting: true, isReconnecting: false });

        // Stage 1: Wait for backend to go down
        await new Promise(r => setTimeout(r, 3000));
        set({ isReconnecting: true });

        // Stage 2: Polling for health
        let attempts = 0;
        const maxAttempts = 60;
        
        const checkHealth = async () => {
             try {
                const health = await API.getSystemHealth();
                return health?.status === 'OK' || health?.online === true;
            } catch {
                return false;
            }
        };

        const poll = setInterval(async () => {
            attempts++;
            const isOnline = await checkHealth();
            
            if (isOnline) {
                clearInterval(poll);
                window.location.reload();
                return;
            }

            if (attempts >= maxAttempts) {
                clearInterval(poll);
                set({ isRestarting: false, isReconnecting: false });
                console.error('[SystemSlice] Restart polling timed out.');
            }
        }, 2000);
    },

    initSystem: () => {
        // Socket Synchronization
        const socket = socketService.socket;
        if (socket) {
            const handleSettingsUpdated = () => {
                get().refreshSettings();
            };
            socket.on('settings:updated', handleSettingsUpdated);
            
            return () => {
                 socket.off('settings:updated', handleSettingsUpdated);
            };
        }
    }
});
