import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ServerConfig, ServerStatus, Player, Backup, ScheduleTask, NodeStatus } from '@shared/types';
import { API } from '../../core/services/api';
import { socketService } from '../../core/services/socket';
import { useUser } from '../../auth/context/UserContext';
import { useSystem } from '@features/system/context/SystemContext';
import { useStore } from '@/store';

interface ServerStats {
    cpu: number;
    memory: number;
    uptime: number;
    latency: number;
    players: number;
    playerList: string[];
    isRealOnline: boolean;
    tps: string;
    pid: number;
    diagnosis?: any[]; // Array of DiagnosisResult
    lastUpdate: number;
}

interface ServerContextType {
    servers: ServerConfig[];
    currentServer: ServerConfig | null;
    stats: Record<string, ServerStats>;
    // New Data Lists
    backups: Record<string, Backup[]>;
    schedules: Record<string, ScheduleTask[]>;
    players: Record<string, Player[]>;
    logs: Record<string, string[]>; // Latest 10 logs for each server
    
    // Java Download Status (Global or Server-Scoped)
    javaDownloadStatus: { message: string, phase: string, percent?: number, serverId?: string } | null;
    
    // Server Install Progress (Per Server)
    installProgress: Record<string, { message: string, percent: number }>;

    // Viewport-Aware Polling
    visibleServerIds: string[];
    registerVisibleServers: (ids: string[]) => void;

    // Background Tasks (Cluster-wide)
    backgroundTasks: Record<string, { id: string, name: string, type: string, status: 'running' | 'complete' | 'failed', progress: number, message: string, serverId?: string, lastUpdated: number }>;
    addBackgroundTask: (task: { id: string, name: string, type: string, status: 'running' | 'complete' | 'failed', progress: number, message: string, serverId?: string }) => void;
    updateBackgroundTask: (id: string, updates: Partial<{ name: string, status: 'running' | 'complete' | 'failed', progress: number, message: string }>) => void;
    removeBackgroundTask: (id: string) => void;
    
    loading: boolean;
    isLoading: boolean;
    setCurrentServer: (server: ServerConfig | null) => void;
    setCurrentServerById: (id: string | null) => void;
    refreshServers: (showSplash?: boolean) => Promise<void>;
    refreshServerData: (serverId: string) => Promise<void>;
    updateServerConfig: (serverId: string, config: Partial<ServerConfig>) => void;
    updateServerStatus: (serverId: string, status: ServerStatus) => void;
    getUnifiedStatus: (server: ServerConfig) => ServerStatus;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export const useServers = () => {
    const store = useStore();
    return {
        servers: store.servers, 
        currentServer: store.currentServer, 
        stats: store.stats, 
        backups: store.backups,
        schedules: store.schedules,
        players: store.players,
        logs: store.logs,
        javaDownloadStatus: store.javaDownloadStatus,
        installProgress: store.installProgress,
        visibleServerIds: store.visibleServerIds,
        registerVisibleServers: store.registerVisibleServers,
        backgroundTasks: store.backgroundTasks,
        getUnifiedStatus: useCallback((server: ServerConfig) => {
            if (!server.nodeId) return server.status;
            const node = store.nodes.find(n => n.id === server.nodeId);
            if (node && node.status === NodeStatus.OFFLINE) return ServerStatus.NODE_UNREACHABLE;
            return server.status;
        }, [store.nodes]),
        addBackgroundTask: store.addBackgroundTask,
        updateBackgroundTask: store.updateBackgroundTask,
        removeBackgroundTask: store.removeBackgroundTask,
        isLoading: store.serversLoading,
        loading: store.serversLoading, 
        setCurrentServer: store.setCurrentServer, 
        setCurrentServerById: store.setCurrentServerById,
        refreshServers: store.refreshServers,
        refreshServerData: store.refreshServerData,
        updateServerConfig: store.updateServerConfig,
        updateServerStatus: store.updateServerStatus
    };
};

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const store = useStore();

    useEffect(() => {
        if (store.isAuthenticated) {
            store.refreshServers(true);
        }
        const cleanupListeners = store.initServerListeners();
        const stopPolling = store.startPolling();
        return () => {
            stopPolling();
            if (cleanupListeners) cleanupListeners();
        };
    }, [store.isAuthenticated]);

    useEffect(() => {
        if (store.currentServer) {
            const serverId = store.currentServer.id;
            store.refreshServerData(serverId);
            socketService.joinServer(serverId);
            return () => {
                socketService.leaveServer(serverId);
            };
        }
    }, [store.currentServer?.id]);

    return <>{children}</>;
};
