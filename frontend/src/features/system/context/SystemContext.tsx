import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GlobalSettings, NodeInfo } from '@shared/types';
import { API } from '../../core/services/api';
import { socketService } from '../../core/services/socket';
import { useUser } from '../../auth/context/UserContext';
import { useStore } from '@/store';

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

export const useSystem = () => {
    const store = useStore();
    return {
        settings: store.settings,
        hostMode: store.settings?.app?.hostMode !== false,
        version: store.settings?.version || '0.0.0',
        metadata: (store.settings as any)?.metadata || null,
        isSolo: store.settings?.app?.hostMode === false,
        isLoading: store.systemLoading,
        isRestarting: store.isRestarting,
        isReconnecting: store.isReconnecting,
        isActivityTrayOpen: store.isActivityTrayOpen,
        setActivityTrayOpen: store.setActivityTrayOpen,
        nodes: store.nodes,
        triggerRestart: store.triggerRestart,
        refreshSettings: store.refreshSettings
    };
};

export const SystemProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const store = useStore();

    useEffect(() => {
        if (store.isAuthenticated) {
            store.refreshSettings();
        }
        const cleanup = store.initSystem();
        return () => {
             if (cleanup) cleanup();
        };
    }, [store.isAuthenticated]);

    return <>{children}</>;
};
