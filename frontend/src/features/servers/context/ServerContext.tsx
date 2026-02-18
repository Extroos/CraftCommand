import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ServerConfig, ServerStatus, Player, Backup, ScheduleTask } from '@shared/types';
import { API } from '../../core/services/api';
import { socketService } from '../../core/services/socket';
import { useUser } from '../../auth/context/UserContext';

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
    
    // Java Download Status (Global)
    javaDownloadStatus: { message: string, phase: string, percent?: number } | null;
    
    // Server Install Progress (Per Server)
    installProgress: Record<string, { message: string, percent: number }>;
    
    loading: boolean;
    isLoading: boolean;
    setCurrentServer: (server: ServerConfig | null) => void;
    setCurrentServerById: (id: string | null) => void;
    refreshServers: (showSplash?: boolean) => Promise<void>;
    refreshServerData: (serverId: string) => Promise<void>;
    updateServerConfig: (serverId: string, config: Partial<ServerConfig>) => void;
    updateServerStatus: (serverId: string, status: ServerStatus) => void;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [servers, setServers] = useState<ServerConfig[]>([]);
    const { isAuthenticated } = useUser();
    const [currentServer, _setCurrentServer] = useState<ServerConfig | null>(null);
    const currentServerRef = React.useRef<ServerConfig | null>(null);

    const setCurrentServer = (value: ServerConfig | null | ((prev: ServerConfig | null) => ServerConfig | null)) => {
        if (typeof value === 'function') {
            _setCurrentServer(prev => {
                const newValue = value(prev);
                currentServerRef.current = newValue;
                return newValue;
            });
        } else {
            currentServerRef.current = value;
            _setCurrentServer(value);
        }
    };
    const [stats, setStats] = useState<Record<string, ServerStats>>({});
    const [isLoading, setIsLoading] = useState(true);

    // Lists State
    const [backups, setBackups] = useState<Record<string, Backup[]>>({});
    const [schedules, setSchedules] = useState<Record<string, ScheduleTask[]>>({});
    const [players, setPlayers] = useState<Record<string, Player[]>>({});
    const [logs, setLogs] = useState<Record<string, string[]>>({});
    
    // Server Install Progress (Per Server)
    const [installProgress, setInstallProgress] = useState<Record<string, { message: string, percent: number }>>({});

    // Java Download Status
    const [javaDownloadStatus, setJavaDownloadStatus] = useState<{ message: string, phase: string, percent?: number } | null>(null);

    const refreshServers = useCallback(async (showSplash = false) => {
        if (showSplash) setIsLoading(true);
        try {
            const data = await API.getServers();
            if (Array.isArray(data)) {
                setServers(data);
                
                // Sync Current Server if it exists using ref to avoid cyclic dependency
                if (currentServerRef.current) {
                    const updated = data.find(s => s.id === currentServerRef.current!.id);
                    if (updated) {
                        setCurrentServer(prev => prev ? ({ ...prev, ...updated }) : updated);
                    }
                }
            } else {
                console.warn('[ServerContext] API.getServers() returned non-array:', data);
                setServers([]);
            }
        } catch (error) {
            console.error('Failed to fetch servers (Retrying in 5s):', error);
            // Retry logic if backend is temporarily down
            setTimeout(() => refreshServers(false), 5000);
        } finally {
            setIsLoading(false);
        }
    }, []); // Stable identity!

    const setCurrentServerById = useCallback((id: string | null) => {
        if (!id) {
            setCurrentServer(null);
            return;
        }
        const server = servers.find(s => s.id === id);
        if (server) {
            setCurrentServer(server);
        }
    }, [servers]);

    const refreshServerData = useCallback(async (serverId: string) => {
        try {
            const [backupData, scheduleData, playerData] = await Promise.all([
                API.getBackups(serverId),
                API.getSchedules(serverId),
                API.getPlayers(serverId, 'online')
            ]);

            setBackups(prev => ({ ...prev, [serverId]: backupData }));
            setSchedules(prev => ({ ...prev, [serverId]: scheduleData }));
            
            // Normalize Player data
            const normalizedPlayers: Player[] = playerData.map((p: any) => ({
                name: p.name || 'Unknown',
                uuid: p.uuid || p.ip || 'unknown',
                skinUrl: p.skinUrl || (p.name ? `https://mc-heads.net/avatar/${encodeURIComponent(p.name)}/64` : ''),
                isOp: p.level ? p.level >= 4 : p.isOp,
                ping: p.ping,
                ip: p.ip,
                online: true,
                lastSeen: p.lastSeen
            }));
            setPlayers(prev => ({ ...prev, [serverId]: normalizedPlayers }));
            
        } catch (error) {
            console.error(`Failed to refresh data for server ${serverId}:`, error);
        }
    }, []);

    const updateServerConfig = useCallback((serverId: string, config: Partial<ServerConfig>) => {
        setServers(prev => prev.map(s => s.id === serverId ? { ...s, ...config } : s));
        if (currentServerRef.current?.id === serverId) {
            setCurrentServer(prev => prev ? { ...prev, ...config } : null);
        }
    }, []);

    const updateServerStatus = useCallback((serverId: string, status: ServerStatus) => {
        setServers(prev => prev.map(s => s.id === serverId ? { ...s, status } : s));
        if (currentServerRef.current?.id === serverId) {
            setCurrentServer(prev => prev ? { ...prev, status } : null);
        }
    }, []);

    // Initial Fetch & Auth-Sync
    useEffect(() => {
        if (isAuthenticated) {
            refreshServers(true); // Show splash on first auth-trigger
        } else {
            setIsLoading(false);
        }
    }, [isAuthenticated, refreshServers]);

    // Pre-fetch data when current server changes
    useEffect(() => {
        if (currentServer) {
            refreshServerData(currentServer.id);
        }
    }, [currentServer?.id, refreshServerData]);

    // Background Status & Stats Polling
    useEffect(() => {
        const interval = setInterval(async () => {
            if (!Array.isArray(servers)) return;
            
            // Step 1: Poll basic availability for ALL servers to prevent stale ghosts
            for (const server of servers) {
                try {
                    const queryStats = await API.getServerStatus(server.id);
                    const isOnline = queryStats.online || false;

                    setStats(prev => {
                        const current = prev[server.id] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, playerList: [], isRealOnline: false, tps: "0.0", pid: 0 };
                        // If status is actually different from our "isRealOnline" flag, update it
                        if (current.isRealOnline !== isOnline) {
                            return {
                                ...prev,
                                [server.id]: { ...current, isRealOnline: isOnline, latency: queryStats.latency || 0, players: queryStats.players || 0 }
                            };
                        }
                        return prev;
                    });

                    // HEARTBEAT RECOVERY: If we see it's online but status is stuck in a transition state, fix it!
                    // CRITICAL: We EXCLUDE STOPPING from this check, otherwise we bounce back to ONLINE during shutdown.
                    if (isOnline && (server.status === ServerStatus.STARTING || server.status === ServerStatus.RESTARTING)) {
                        console.log(`[ServerContext] Heartbeat Recovery: ${server.name} matches ONLINE. Syncing status.`);
                        updateServerStatus(server.id, ServerStatus.ONLINE);
                    }
                    
                    // If definitely offline according to query, but our state says ONLINE, maybe we missed a stop event?
                    // But let's be careful not to flip it too aggressively if it was just a temporary timeout.
                    // If it's literally OFFLINE in state, ensures stats reflect that.
                    if (!isOnline && server.status === ServerStatus.OFFLINE) {
                         setStats(prev => prev[server.id]?.isRealOnline ? { ...prev, [server.id]: { ...prev[server.id], isRealOnline: false } } : prev);
                    }

                    // Step 2: Poll intensive stats ONLY for servers that are actually Online
                    if (isOnline) {
                        const procStats = await API.getServerStats(server.id);
                        setStats(prev => ({
                            ...prev,
                            [server.id]: {
                                ...(prev[server.id] || {}),
                                cpu: procStats.cpu || 0,
                                memory: procStats.memory || 0,
                                uptime: procStats.uptime || 0,
                                tps: queryStats.tps || '20.0',
                                pid: procStats.pid || 0,
                                isRealOnline: true // Reinforce
                            } as ServerStats
                        }));
                    }
                } catch (e) {
                    // On error (timeout), assume not reachable if it fails repeatedly
                    // But for now just clear isRealOnline if it's OFFLINE in state
                    if (server.status === ServerStatus.OFFLINE) {
                        setStats(prev => prev[server.id]?.isRealOnline ? { ...prev, [server.id]: { ...prev[server.id], isRealOnline: false } } : prev);
                    }
                }
            }
        }, 2000); // Live-sync frequency (2s instead of 5s)

        return () => clearInterval(interval);
    }, [servers, updateServerStatus]);

    // Background List Polling
    useEffect(() => {
        const interval = setInterval(() => {
            if (currentServer) {
                refreshServerData(currentServer.id);
            }
        }, 30000);
        
        return () => clearInterval(interval);
    }, [currentServer, refreshServerData]);

    // Socket listeners for status
    useEffect(() => {
        const handleStatus = (data: { id: string, status: string }) => {
            const status = data.status as ServerStatus;
            setServers(prev => prev.map(s => 
                s.id === data.id ? { ...s, status } : s
            ));
            
            // Use Ref to get fresh currentServer without re-subscribing
            if (currentServerRef.current?.id === data.id) {
                setCurrentServer({ ...currentServerRef.current, status });
            }
        };

        const handleStats = (data: { id: string, cpu: number, memory: number, pid: number, tps: string, uptime: number }) => {
            setStats(prev => {
                const current = prev[data.id] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, playerList: [], isRealOnline: false, tps: "0.0", pid: 0 };
                return {
                    ...prev,
                    [data.id]: {
                        ...current,
                        cpu: data.cpu,
                        memory: data.memory,
                        tps: data.tps,
                        uptime: data.uptime,
                        pid: data.pid
                    }
                };
            });
        };

        const handleLog = (data: { id: string, line: string }) => {
            setLogs(prev => {
                const serverLogs = prev[data.id] || [];
                const updated = [...serverLogs, data.line].slice(-10);
                return { ...prev, [data.id]: updated };
            });
        };
        
        // Java Download Status Handlers
        const handleInstallStatus = (data: { message: string, phase: string }) => {
            setJavaDownloadStatus({ message: data.message, phase: data.phase });
            if (data.phase === 'complete') {
                setTimeout(() => setJavaDownloadStatus(null), 3000);
            }
        };

        const handleInstallProgress = (data: { serverId?: string, phase: string, percent: number, message: string }) => {
            // If serverId is present, update the specific server progress
            if (data.serverId) {
                setInstallProgress(prev => ({
                    ...prev,
                    [data.serverId!]: { message: data.message, percent: data.percent }
                }));
            } else {
                // Fallback to global (Java install)
                setJavaDownloadStatus({ message: data.message, phase: data.phase, percent: data.percent });
            }
        };

        const handleInstallError = (data: { message: string, phase: string }) => {
            setJavaDownloadStatus({ message: data.message, phase: data.phase });
            setTimeout(() => setJavaDownloadStatus(null), 5000);
        };

        // NEW: Clear server install progress on completion
        const handleInstallComplete = (data: { serverId: string }) => {
             setInstallProgress(prev => {
                 const newState = { ...prev };
                 delete newState[data.serverId];
                 return newState;
             });
             // Also refresh status immediately
             refreshServers();
        };

        const unsubStatus = socketService.onStatus(handleStatus);
        const unsubStats = socketService.onStats(handleStats);
        const unsubLog = socketService.onLog(handleLog);
        const unsubInstallStatus = socketService.onInstallStatus(handleInstallStatus);
        const unsubInstallProgress = socketService.onInstallProgress(handleInstallProgress);
        const unsubInstallError = socketService.onInstallError(handleInstallError);
        const unsubInstallComplete = socketService.onInstallComplete(handleInstallComplete);

        return () => {
             unsubStatus();
             unsubStats();
             unsubLog();
             unsubInstallStatus();
             unsubInstallProgress();
             unsubInstallError();
             unsubInstallComplete();
        };
    }, []);

    return (
        <ServerContext.Provider value={{ 
            servers, 
            currentServer, 
            stats, 
            backups,
            schedules,
            players,
            logs,
            javaDownloadStatus,
            installProgress,
            isLoading,
            loading: isLoading, 
            setCurrentServer, 
            setCurrentServerById,
            refreshServers,
            refreshServerData,
            updateServerConfig,
            updateServerStatus
        }}>
            {children}
        </ServerContext.Provider>
    );
};

export const useServers = () => {
    const context = useContext(ServerContext);
    if (!context) throw new Error('useServers must be used within a ServerProvider');
    return context;
};
