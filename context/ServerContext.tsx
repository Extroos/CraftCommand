import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ServerConfig, ServerStatus, Player, Backup, ScheduleTask } from '../types';
import { API } from '../services/api';
import { socketService } from '../services/socket';

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
    
    loading: boolean;
    isLoading: boolean;
    setCurrentServer: (server: ServerConfig | null) => void;
    setCurrentServerById: (id: string | null) => void;
    refreshServers: () => Promise<void>;
    refreshServerData: (serverId: string) => Promise<void>;
    updateServerConfig: (serverId: string, config: Partial<ServerConfig>) => void;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [servers, setServers] = useState<ServerConfig[]>([]);
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
    const [loading, setLoading] = useState(true);

    // Lists State
    const [backups, setBackups] = useState<Record<string, Backup[]>>({});
    const [schedules, setSchedules] = useState<Record<string, ScheduleTask[]>>({});
    const [players, setPlayers] = useState<Record<string, Player[]>>({});
    const [logs, setLogs] = useState<Record<string, string[]>>({});

    const refreshServers = useCallback(async () => {
        try {
            const data = await API.getServers();
            setServers(data);
            
            // Sync Current Server if it exists
            if (currentServer) {
                const updated = data.find(s => s.id === currentServer.id);
                if (updated) setCurrentServer(prev => ({ ...(prev || updated!), ...updated }));
            }
        } catch (error) {
            console.error('Failed to fetch servers (Retrying in 5s):', error);
            // Retry logic if backend is temporarily down
            setTimeout(refreshServers, 5000);
        } finally {
            setLoading(false);
        }
    }, [currentServer]);

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
                skinUrl: p.skinUrl || (p.name ? `https://mc-heads.net/avatar/${p.name}/64` : ''),
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
        if (currentServer?.id === serverId) {
            setCurrentServer(prev => prev ? { ...prev, ...config } : null);
        }
    }, [currentServer]);

    // Initial Fetch
    useEffect(() => {
        refreshServers();
    }, []);

    // Pre-fetch data when current server changes
    useEffect(() => {
        if (currentServer) {
            refreshServerData(currentServer.id);
        }
    }, [currentServer?.id, refreshServerData]);

    // Background Stats Polling
    useEffect(() => {
        const interval = setInterval(async () => {
            const activeServers = servers.filter(s => s.status === 'ONLINE' || s.status === 'STARTING');
            
            for (const server of activeServers) {
                try {
                    const [queryStats, procStats] = await Promise.all([
                        API.getServerStatus(server.id),
                        API.getServerStats(server.id)
                    ]);

                    setStats(prev => ({
                        ...prev,
                        [server.id]: {
                            cpu: procStats.cpu || 0,
                            memory: procStats.memory || 0,
                            uptime: procStats.uptime || 0,
                            latency: queryStats.latency || 0,
                            players: queryStats.players || 0,
                            playerList: queryStats.playerList || [],
                            isRealOnline: queryStats.online || false,
                            tps: queryStats.tps || '20.0',
                            pid: procStats.pid || 0
                        }
                    }));
                } catch (e) {
                    // Ignore errors
                }
            }
        }, 15000); // Slower backup polling

        return () => clearInterval(interval);
    }, [servers]);

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

        socketService.onStatus(handleStatus);

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

        const unsubStatus = socketService.onStatus(handleStatus);
        const unsubStats = socketService.onStats(handleStats);
        const unsubLog = socketService.onLog(handleLog);

        return () => {
             unsubStatus();
             unsubStats();
             unsubLog();
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
            isLoading: loading,
            loading, 
            setCurrentServer, 
            setCurrentServerById,
            refreshServers,
            refreshServerData,
            updateServerConfig
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
