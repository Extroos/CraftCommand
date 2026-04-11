import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GlobalSettings, NodeInfo } from '@shared/types';
import { API } from '../../core/services/api';
import { socketService } from '../../core/services/socket';
import { useUser } from '../../auth/context/UserContext';

interface SystemState {
    settings: GlobalSettings | null;
    hostMode: boolean;
    version: string; // Dynamic version
    metadata: { version: string, title: string, notes: string[], codename?: string } | null;
    isSolo: boolean; // Helper: !hostMode
    isLoading: boolean;
    nodes: NodeInfo[];  // Lightweight cache for node name resolution
    isRestarting: boolean;
    isReconnecting: boolean;
    isActivityTrayOpen: boolean;
    setActivityTrayOpen: (open: boolean) => void;
    triggerRestart: () => void;
    refreshSettings: () => Promise<void>;
}

const SystemContext = createContext<SystemState | undefined>(undefined);

export const SystemProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useUser();
    const [settings, setSettings] = useState<GlobalSettings | null>(null);
    const [nodes, setNodes] = useState<NodeInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRestarting, setIsRestarting] = useState(false);
    const [isActivityTrayOpen, setActivityTrayOpen] = useState(false);

    const [isReconnecting, setIsReconnecting] = useState(false);

    // Dynamic Version Synchronization
    useEffect(() => {
        if (socketService?.socket) {
            const handleSettingsSync = (data: any) => {
                if (data && data.version) {
                    setSettings(prev => prev ? { ...prev, version: data.version } : { ...data });
                }
            };
            socketService.socket.on('settings:updated', handleSettingsSync);
            return () => {
                socketService.socket.off('settings:updated', handleSettingsSync);
            };
        }
    }, [socketService?.socket]);

    const checkHealth = useCallback(async () => {
        try {
            const health = await API.getSystemHealth();
            return health?.status === 'OK' || health?.online === true;
        } catch {
            return false;
        }
    }, []);

    const triggerRestart = useCallback(async () => {
        setIsRestarting(true);
        setIsReconnecting(false);

        // Stage 1: Wait for backend to go down (or just wait a bit for it to start shutdown)
        await new Promise(r => setTimeout(r, 3000));
        setIsReconnecting(true);

        // Stage 2: Polling for health
        let attempts = 0;
        const maxAttempts = 60; // 2 minutes with 2s interval
        
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
                setIsRestarting(false);
                setIsReconnecting(false);
                console.error('[SystemContext] Restart polling timed out after 2 minutes.');
            }
        }, 2000);
    }, [checkHealth]);


    const refreshSettings = useCallback(async () => {
        if (!isAuthenticated) {
            setIsLoading(false);
            return;
        }

        try {
            const data = await API.getGlobalSettings();
            setSettings(data);

            // Load nodes cache if distributed nodes is enabled
            if (data?.app?.distributedNodes?.enabled) {
                try {
                    const nodeData = await API.getNodes();
                    setNodes(nodeData.nodes || []);
                } catch { /* non-fatal */ }
            } else {
                setNodes([]);
            }
        } catch (e) {
            console.error('[SystemContext] Failed to fetch settings:', e);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated]);

    // Fetch on mount or when auth changes
    useEffect(() => {
        refreshSettings();
    }, [refreshSettings]);

    const hostMode = settings?.app?.hostMode !== false; // Default to true if not set

    return (
        <SystemContext.Provider value={{
            settings,
            hostMode,
            version: settings?.version || '0.0.0',
            metadata: (settings as any)?.metadata || null,
            isSolo: !hostMode,
            isLoading,
            isRestarting,
            isReconnecting,
            isActivityTrayOpen,
            setActivityTrayOpen,
            nodes,
            triggerRestart,
            refreshSettings
        }}>
            {children}
        </SystemContext.Provider>
    );
};

export const useSystem = () => {
    const context = useContext(SystemContext);
    if (!context) {
        throw new Error('useSystem must be used within a SystemProvider');
    }
    return context;
};
