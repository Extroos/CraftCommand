import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ServerConfig, ServerStatus, Player, Backup, ScheduleTask, NodeStatus } from '@shared/types';
import { API } from '../../core/services/api';
import { socketService } from '../../core/services/socket';
import { useUser } from '../../auth/context/UserContext';
import { useSystem } from '@features/system/context/SystemContext';

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

    // Viewport-Aware Polling State
    const [visibleServerIds, setVisibleServerIds] = useState<string[]>([]);
    const visibleServerIdsRef = React.useRef<string[]>([]);
    
    useEffect(() => {
        serversRef.current = servers;
    }, [servers]);

    const registerVisibleServers = useCallback((ids: string[]) => {
        setVisibleServerIds(ids);
        visibleServerIdsRef.current = ids;
    }, []);

    // Global Background Tasks (Persisted)
    const [backgroundTasks, setBackgroundTasks] = useState<Record<string, any>>(() => {
        const saved = localStorage.getItem('cc_bg_tasks');
        const tasks = saved ? JSON.parse(saved) : {};
        
        // Scrub stale tasks on mount: Any "running" task older than 5 mins is marked failed
        const now = Date.now();
        let changed = false;
        Object.keys(tasks).forEach(id => {
            const task = tasks[id];
            if (task.status === 'running') {
                const lastUpdate = task.lastUpdated || 0;
                if (now - lastUpdate > 300000) { // 5 minutes
                    tasks[id] = { 
                        ...task, 
                        status: 'failed', 
                        message: 'Session timeout: The background operation state was lost.' 
                    };
                    changed = true;
                }
            }
        });
        return tasks;
    });

    // Sync tasks to localStorage
    useEffect(() => {
        localStorage.setItem('cc_bg_tasks', JSON.stringify(backgroundTasks));
    }, [backgroundTasks]);

    const { nodes } = useSystem();

    const addBackgroundTask = useCallback((task: any) => {
        setBackgroundTasks(prev => {
            const newTask = { ...task, lastUpdated: Date.now() };
            const newState = { ...prev, [task.id]: newTask };
            
            // Limit to last 50 tasks (FIFO)
            const keys = Object.keys(newState);
            if (keys.length > 50) {
                const sortedKeys = keys.sort((a, b) => (newState[a].lastUpdated || 0) - (newState[b].lastUpdated || 0));
                delete newState[sortedKeys[0]];
            }
            
            return newState;
        });
    }, []);

    const updateBackgroundTask = useCallback((id: string, updates: any) => {
        setBackgroundTasks(prev => prev[id] ? ({ 
            ...prev, 
            [id]: { ...prev[id], ...updates, lastUpdated: Date.now() } 
        }) : prev);
    }, []);

    const removeBackgroundTask = useCallback((id: string) => {
        setBackgroundTasks(prev => {
            const newState = { ...prev };
            delete newState[id];
            return newState;
        });
    }, []);

    // Retention Policy: Cleanup effect
    useEffect(() => {
        const cleanup = () => {
            const now = Date.now();
            const MAX_AGE = 30 * 60 * 1000; // 30 minutes

            setBackgroundTasks(prev => {
                let changed = false;
                const newState = { ...prev };

                Object.keys(newState).forEach(id => {
                    const task = newState[id];
                    // Only purge finished tasks that are too old
                    if (task.status !== 'running') {
                        const age = now - (task.lastUpdated || 0);
                        if (age > MAX_AGE) {
                            delete newState[id];
                            changed = true;
                        }
                    }
                });

                return changed ? newState : prev;
            });
        };

        const interval = setInterval(cleanup, 60000); // Check every minute
        return () => clearInterval(interval);
    }, []);

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
    }, [setCurrentServer, setServers]);

    const getUnifiedStatus = useCallback((server: ServerConfig) => {
        if (!server.nodeId) return server.status;
        const node = nodes.find(n => n.id === server.nodeId);
        if (node && node.status === NodeStatus.OFFLINE) return ServerStatus.NODE_UNREACHABLE;
        return server.status;
    }, [nodes]);

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
            const serverId = currentServer.id;
            refreshServerData(serverId);
            
            // Join socket room for live updates (Stats, Logs, Presence)
            socketService.joinServer(serverId);

            return () => {
                socketService.leaveServer(serverId); // Closure capture (v1.12.10)
            };
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
            const pollStartTime = Date.now();

            // Optimization: Poll the CURRENT server every cycle, others every 5 cycles (10s)
            // Phase 67: Viewport-Aware Polling (v1.14.0)
            const isFullPoll = currentPollId % 15 === 0; // All servers every 30s
            const isVisiblePoll = currentPollId % 2 === 0; // Visible servers every 4s (plus the current server every 2s)

            const targetServers = currentServers.filter(s => {
                const isCurrent = s.id === currentServerRef.current?.id;
                const isVisible = visibleServerIdsRef.current.includes(s.id);
                const isLive = s.status !== ServerStatus.OFFLINE;

                // Priority:
                // 1. Current server (Every cycle)
                // 2. Visible servers (Every 2 cycles)
                // 3. Live but non-visible servers (Every 5 cycles - existing logic replaced by isFullPoll)
                // 4. Offline/Static servers (Only on full poll)
                
                if (isCurrent) return true;
                if (isVisible && isVisiblePoll) return true;
                if (isLive && isFullPoll) return true;
                if (isFullPoll) return true;
                
                return false;
            });

            const results = await Promise.allSettled(targetServers.map(async (server) => {
                try {
                    const queryStats = await API.getServerStatus(server.id);
                    const isOnline = queryStats.online || false;

                    const isTransitioning = [
                        ServerStatus.STARTING,
                        ServerStatus.RESTARTING,
                        ServerStatus.STOPPING
                    ].includes(server.status as ServerStatus);

                    let procStats = null;
                    if (isOnline || isTransitioning) {
                        procStats = await API.getServerStats(server.id);
                    }

                    return { serverId: server.id, queryStats, procStats, isOnline };
                } catch (err) {
                    return { serverId: server.id, error: true };
                }
            }));

            if (currentPollId !== pollIdRef.current) return;

            results.forEach((res, index) => {
                const server = targetServers[index];
                if (res.status === 'fulfilled') {
                    const { queryStats, procStats, isOnline, error } = res.value;
                    if (error || !queryStats) return;

                    setStats(prev => {
                        const current = prev[server.id] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, playerList: [], isRealOnline: false, tps: "0.0", pid: 0, lastUpdate: 0 };
                        if (current.lastUpdate > pollStartTime) return prev;

                        const newStats = { 
                            ...current, 
                            isRealOnline: isOnline, 
                            latency: queryStats.latency || 0, 
                            players: queryStats.players || 0,
                            diagnosis: procStats?.diagnosis || queryStats?.diagnosis || [],
                            lastUpdate: Date.now()
                        };
                        
                        if (procStats) {
                            newStats.cpu = procStats.cpu || 0;
                            newStats.memory = procStats.memory || 0;
                            newStats.uptime = procStats.uptime || 0;
                            newStats.tps = queryStats.tps || '20.0';
                            newStats.pid = procStats.pid || 0;
                        }

                        // Shallow equality check to avoid redundant re-renders
                        const changed = 
                            current.isRealOnline !== newStats.isRealOnline ||
                            current.cpu !== newStats.cpu ||
                            current.memory !== newStats.memory ||
                            current.players !== newStats.players ||
                            current.latency !== newStats.latency ||
                            current.pid !== newStats.pid ||
                            current.tps !== newStats.tps;

                        return changed ? { ...prev, [server.id]: newStats } : prev;
                    });

                    // Phase 66: Remove optimistic promotion. 
                    // The backend is now the single source of truth for lifecycle.
                    // If isOnline is true but status is STARTING, we KEEP showing STARTING 
                    // until the backend explicitly transitions to ONLINE.
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
            const server = serversRef.current.find(s => s.id === data.id);
            const isClosing = server?.status === ServerStatus.OFFLINE || server?.status === ServerStatus.STOPPING;

            setStats(prev => {
                const current = prev[data.id] || { cpu: 0, memory: 0, uptime: 0, latency: 0, players: 0, playerList: [], isRealOnline: false, tps: "0.0", pid: 0, lastUpdate: 0 };
                
                // Phase 65: Stats Gate (v1.12.16)
                // If the server is known to be offline or stopping, ignore incoming process stats 
                // to prevent "Frozen" numbers or ghost movements.
                if (isClosing && data.cpu > 0) return prev;

                return {
                    ...prev,
                    [data.id]: {
                        ...current,
                        cpu: isClosing ? 0 : data.cpu,
                        memory: isClosing ? 0 : data.memory,
                        tps: isClosing ? "0.00" : data.tps,
                        uptime: isClosing ? 0 : data.uptime,
                        pid: isClosing ? 0 : data.pid,
                        lastUpdate: Date.now() 
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
                // No more immediate removal - handled by retention policy or user
                refreshServers();
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
                    // No more immediate removal - handled by retention policy or user
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
             setJavaDownloadStatus(prev => {
                 if (!prev || !prev.serverId || prev.serverId === data.serverId) return null;
                 return prev;
             });
             refreshServers();
        };

        const handleBackupProgress = (data: { serverId: string, percent: number, backupId: string }) => {
            const taskId = `backup-${data.serverId}-${data.backupId}`;
            const server = serversRef.current.find(s => s.id === data.serverId);
            const taskName = `Backup: ${server?.name || data.serverId}`;

            setBackgroundTasks(prev => {
                // If the task doesn't exist (e.g., scheduled backup started on another tab/backend), auto-register it
                if (!prev[taskId]) {
                    return {
                        ...prev,
                        [taskId]: {
                            id: taskId,
                            name: taskName,
                            type: 'backup',
                            serverId: data.serverId,
                            status: 'running',
                            progress: data.percent,
                            message: `Compressing archives (${data.percent}%)`,
                            lastUpdated: Date.now()
                        }
                    };
                }
                // Else just update normally
                return {
                    ...prev,
                    [taskId]: {
                        ...prev[taskId],
                        name: taskName,
                        progress: data.percent,
                        message: `Compressing archives (${data.percent}%)`,
                        lastUpdated: Date.now()
                    }
                };
            });
        };
        
        const handleBackupStatus = (data: { message: string, serverId?: string, backupId?: string, status?: string }) => {
            if (!data.serverId || !data.backupId) return;
            const taskId = `backup-${data.serverId}-${data.backupId}`;
            const server = serversRef.current.find(s => s.id === data.serverId);
            const taskName = `Backup: ${server?.name || data.serverId}`;

            if (data.status === 'complete') {
                updateBackgroundTask(taskId, {
                    name: taskName,
                    status: 'complete',
                    progress: 100,
                    message: 'Backup completed successfully.'
                });
            } else if (data.status === 'failed') {
                updateBackgroundTask(taskId, {
                    name: taskName,
                    status: 'failed',
                    message: data.message || 'Backup failed.'
                });
            }
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
        const unsubBackupProgress = socketService.onBackupProgress(handleBackupProgress);
        const unsubBackupStatus = socketService.onBackupStatus(handleBackupStatus);
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
             unsubBackupProgress();
             unsubBackupStatus();
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
            registerVisibleServers,
            backgroundTasks,
            getUnifiedStatus,
            addBackgroundTask,
            updateBackgroundTask,
            removeBackgroundTask,
            isLoading,
            loading: isLoading, 
            setCurrentServer, 
            setCurrentServerById,
            refreshServers,
            refreshServerData,
            updateServerConfig,
            updateServerStatus,
            visibleServerIds
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
