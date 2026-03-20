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
    const [servers, _setServers] = useState<ServerConfig[]>([]);
    const { isAuthenticated } = useUser();
    const [currentServer, _setCurrentServer] = useState<ServerConfig | null>(null);
    const currentServerRef = React.useRef<ServerConfig | null>(null);
    const serversRef = React.useRef<ServerConfig[]>([]);

    const setServers = useCallback((value: ServerConfig[] | ((prev: ServerConfig[]) => ServerConfig[])) => {
        if (typeof value === 'function') {
            _setServers(prev => {
                const newValue = value(prev);
                serversRef.current = newValue;
                return newValue;
            });
        } else {
            serversRef.current = value;
            _setServers(value);
        }
    }, []);

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
    const [javaDownloadStatus, setJavaDownloadStatus] = useState<{ message: string, phase: string, percent?: number, serverId?: string } | null>(null);

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
    }, [setServers]); // Stable identity!

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

    // Background Status & Stats Polling (V2: Parallel & Ref-Based)
    const pollIdRef = React.useRef(0);
    useEffect(() => {
        const pollServers = async () => {
            const currentServers = serversRef.current;
            if (!Array.isArray(currentServers) || currentServers.length === 0) return;
            
            pollIdRef.current++;
            const currentPollId = pollIdRef.current;
            const pollStartTime = Date.now(); // Capture start time to prevent staleness overwrites

            // Poll ALL servers in parallel
            const results = await Promise.allSettled(currentServers.map(async (server) => {
                try {
                    const queryStats = await API.getServerStatus(server.id);
                    const isOnline = queryStats.online || false;

                    // Step 2: Poll intensive stats ONLY for servers that are actually Online
                    let procStats = null;
                    if (isOnline) {
                        procStats = await API.getServerStats(server.id);
                    }

                    return { serverId: server.id, queryStats, procStats, isOnline };
                } catch (err) {
                    return { serverId: server.id, error: true, status: server.status };
                }
            }));

            // If a newer poll already started, discard these results to prevent "time travel" bugs
            if (currentPollId !== pollIdRef.current) return;

            results.forEach((res, index) => {
                const server = currentServers[index];
                if (res.status === 'fulfilled') {
                    const { queryStats, procStats, isOnline, error } = res.value;

                    if (error || !queryStats) return;

                    setStats(prev => {
                        const current = prev[server.id] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, playerList: [], isRealOnline: false, tps: "0.0", pid: 0, lastUpdate: 0 };
                        
                        // STALENESS GUARD: If we received a fresher WebSocket update AFTER this poll was initiated, 
                        // ignore the poll result for this specific server to avoid flickering.
                        if (current.lastUpdate > pollStartTime) return prev;

                        const newStats = { 
                            ...current, 
                            isRealOnline: isOnline, 
                            latency: queryStats.latency || 0, 
                            players: queryStats.players || 0,
                            lastUpdate: Date.now() // Polling update
                        };
                        
                        if (procStats) {
                            newStats.cpu = procStats.cpu || 0;
                            newStats.memory = procStats.memory || 0;
                            newStats.uptime = procStats.uptime || 0;
                            newStats.tps = queryStats.tps || '20.0';
                            newStats.pid = procStats.pid || 0;
                        } else if (!isOnline && server.status === ServerStatus.OFFLINE) {
                             newStats.isRealOnline = false;
                        }

                        if (JSON.stringify(current) === JSON.stringify(newStats)) return prev;
                        return { ...prev, [server.id]: newStats };
                    });

                    // HEARTBEAT RECOVERY: If we see it's online but status is stuck in a transition state, fix it!
                    if (isOnline && (server.status === ServerStatus.STARTING || server.status === ServerStatus.RESTARTING)) {
                        updateServerStatus(server.id, ServerStatus.ONLINE);
                    }
                    
                    // STUCK STATUS RECOVERY: If we see it's offline but status is stuck in STOPPING, fix it!
                    if (!isOnline && server.status === ServerStatus.STOPPING) {
                        updateServerStatus(server.id, ServerStatus.OFFLINE);
                    }
                } else {
                    // On error, if the server is offline in DB, ensure UI reflects not-real-online
                    if (server.status === ServerStatus.OFFLINE) {
                        setStats(prev => prev[server.id]?.isRealOnline ? { ...prev, [server.id]: { ...prev[server.id], isRealOnline: false } } : prev);
                    }
                }
            });
        };

        pollServers(); // Execute immediately upon load
        const interval = setInterval(pollServers, 2000); 

        return () => clearInterval(interval);
    }, [updateServerStatus, servers.length]);

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
                const current = prev[data.id] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, playerList: [], isRealOnline: false, tps: "0.0", pid: 0, lastUpdate: 0 };
                return {
                    ...prev,
                    [data.id]: {
                        ...current,
                        cpu: data.cpu,
                        memory: data.memory,
                        tps: data.tps,
                        uptime: data.uptime,
                        pid: data.pid,
                        lastUpdate: Date.now() // Live update
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
        const handleInstallStatus = (data: any) => {
            const serverId = data?.serverId;
            const message = typeof data?.message === 'string' ? data.message : (typeof data === 'string' ? data : 'Processing...');
            const phase = data?.phase || 'unknown';
            const percent = typeof data?.percent === 'number' ? data.percent : undefined;

            setJavaDownloadStatus({ 
                message, 
                phase, 
                percent,
                serverId 
            });

            if (serverId) {
                setInstallProgress(prev => ({
                    ...prev,
                    [serverId]: { message, percent: percent ?? 100 }
                }));
            }

            if (phase === 'complete' || percent === 100) {
                setTimeout(() => {
                    setJavaDownloadStatus(null);
                    if (serverId) {
                        setInstallProgress(prev => {
                            const newState = { ...prev };
                            delete newState[serverId];
                            return newState;
                        });
                    }
                    refreshServers();
                }, 3000);
            }
        };

        const handleInstallProgress = (data: any) => {
            const serverId = data?.serverId;
            const message = typeof data?.message === 'string' ? data.message : (typeof data === 'string' ? data : 'Downloading...');
            const percent = typeof data?.percent === 'number' ? data.percent : 0;
            const phase = data?.phase || 'downloading';

            // Update specific server progress if serverId is provided
            if (serverId) {
                setInstallProgress(prev => ({
                    ...prev,
                    [serverId]: { message, percent }
                }));
            }

            // Always update Java status if it's a Java-related phase or if no serverId is provided (legacy)
            const isJavaPhase = phase === 'downloading' || phase === 'extracting' || phase === 'installing' || phase === 'complete' || message?.toLowerCase().includes('java');
            
            if (!serverId || isJavaPhase) {
                setJavaDownloadStatus({ 
                    message, 
                    phase, 
                    percent,
                    serverId
                });
                
                // Clear Java status on completion or failure
                if (phase === 'complete' || phase === 'failed' || percent === 100) {
                    setTimeout(() => {
                        setJavaDownloadStatus(null);
                        if (serverId) {
                            setInstallProgress(prev => {
                                const newState = { ...prev };
                                delete newState[serverId];
                                return newState;
                            });
                        }
                    }, 3000);
                }
            }
        };

        const handleInstallError = (data: any) => {
            const message = typeof data?.message === 'string' ? data.message : (typeof data === 'string' ? data : 'Installation Failed');
            const phase = data?.phase || 'failed';
            setJavaDownloadStatus({ message, phase, percent: 0 });
            setTimeout(() => setJavaDownloadStatus(null), 5000);
        };

        // NEW: Clear server install progress on completion
        const handleInstallComplete = (data: { serverId: string }) => {
             setInstallProgress(prev => {
                 const newState = { ...prev };
                 delete newState[data.serverId];
                 return newState;
             });
             // Also clear global Java status if it matches this server or is global
             setJavaDownloadStatus(prev => {
                 if (!prev || !prev.serverId || prev.serverId === data.serverId) return null;
                 return prev;
             });
             // Also refresh status immediately
             refreshServers();
        };

        const handlePlayerJoin = (data: { serverId: string, name: string, onlinePlayers: number }) => {
            // 1. Immediate stats update for count
            setStats(prev => {
                const current = prev[data.serverId] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, playerList: [], isRealOnline: false, tps: "0.0", pid: 0, lastUpdate: 0 };
                return {
                    ...prev,
                    [data.serverId]: { ...current, players: data.onlinePlayers }
                };
            });
            // 2. Refresh detailed list (skins, etc) - This will update the 'players' state
            refreshServerData(data.serverId);
        };

        const handlePlayerLeave = (data: { serverId: string, name: string, onlinePlayers: number }) => {
            
            // 1. Immediate stats update for count
            setStats(prev => {
                const current = prev[data.serverId] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, playerList: [], isRealOnline: false, tps: "0.0", pid: 0, lastUpdate: 0 };
                const newCount = Math.max(0, data.onlinePlayers);
                return {
                    ...prev,
                    [data.serverId]: { ...current, players: newCount }
                };
            });

            // 2. Optimistic removal from players list to prevent PFP lag
            setPlayers(prev => {
                const currentList = prev[data.serverId] || [];
                const updatedList = currentList.filter(p => p.name !== data.name);
                
                // If count is 0, ensure the list is definitely empty
                if (data.onlinePlayers <= 0) return { ...prev, [data.serverId]: [] };
                
                return { ...prev, [data.serverId]: updatedList };
            });

            // 3. Final sync with server (handles any edge cases)
            refreshServerData(data.serverId);
        };

        const unsubStatus = socketService.onStatus(handleStatus);
        const unsubStatusGlobal = socketService.onStatusGlobal(handleStatus);
        const unsubStats = socketService.onStats(handleStats);
        const unsubLog = socketService.onLog(handleLog);
        const unsubInstallStatus = socketService.onInstallStatus(handleInstallStatus);
        const unsubInstallProgress = socketService.onInstallProgress(handleInstallProgress);
        const unsubInstallError = socketService.onInstallError(handleInstallError);
        const unsubInstallComplete = socketService.onInstallComplete(handleInstallComplete);
        const unsubPlayerJoin = socketService.onPlayerJoin(handlePlayerJoin);
        const unsubPlayerLeave = socketService.onPlayerLeave(handlePlayerLeave);

        return () => {
             unsubStatus();
             unsubStatusGlobal();
             unsubStats();
             unsubLog();
             unsubInstallStatus();
             unsubInstallProgress();
             unsubInstallError();
             unsubInstallComplete();
             unsubPlayerJoin();
             unsubPlayerLeave();
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
