import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GlobalSettings, NodeInfo } from '@shared/types';
import { API } from '../../core/services/api';
import { useUser } from '../../auth/context/UserContext';

interface SystemState {
    settings: GlobalSettings | null;
    hostMode: boolean;
    version: string; // Dynamic version
    isSolo: boolean; // Helper: !hostMode
    isLoading: boolean;
    nodes: NodeInfo[];  // Lightweight cache for node name resolution
    isRestarting: boolean;
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

    const triggerRestart = useCallback(() => {
        setIsRestarting(true);
        // Page reload as fallback if backend takes too long
        setTimeout(() => {
            window.location.reload();
        }, 15000);
    }, []);

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
            isSolo: !hostMode,
            isLoading,
            isRestarting,
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
