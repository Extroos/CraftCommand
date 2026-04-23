import { StateCreator } from 'zustand';
import { ServerConfig, ServerStatus, Player, Backup, ScheduleTask, NodeStatus } from '@shared/types';
import { API } from '../../features/core/services/api';
import { socketService } from '../../features/core/services/socket';
import { StoreState } from '../index';

export interface ServerStats {
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
    diagnosis?: any[];
}

export interface ServerSlice {
    servers: ServerConfig[];
    currentServer: ServerConfig | null;
    stats: Record<string, ServerStats>;
    backups: Record<string, Backup[]>;
    schedules: Record<string, ScheduleTask[]>;
    players: Record<string, Player[]>;
    logs: Record<string, string[]>;
    javaDownloadStatus: { message: string, phase: string, percent?: number, serverId?: string } | null;
    installProgress: Record<string, { message: string, percent: number }>;
    visibleServerIds: string[];
    backgroundTasks: Record<string, any>;
    serversLoading: boolean;

    // Actions
    setCurrentServer: (server: ServerConfig | null) => void;
    setCurrentServerById: (id: string | null) => void;
    registerVisibleServers: (ids: string[]) => void;
    refreshServers: (showSplash?: boolean) => Promise<void>;
    refreshServerData: (serverId: string) => Promise<void>;
    updateServerConfig: (serverId: string, config: Partial<ServerConfig>) => void;
    updateServerStatus: (serverId: string, status: ServerStatus) => void;
    
    // Background Tasks
    addBackgroundTask: (task: any) => void;
    updateBackgroundTask: (id: string, updates: any) => void;
    removeBackgroundTask: (id: string) => void;

    // Initialization & Polling
    initServerListeners: () => void;
    startPolling: () => () => void;
}

export const createServerSlice: StateCreator<StoreState, [["zustand/devtools", never], ["zustand/persist", unknown]], [], ServerSlice> = (set, get) => ({
    servers: [],
    currentServer: null,
    stats: {},
    backups: {},
    schedules: {},
    players: {},
    logs: {},
    javaDownloadStatus: null,
    installProgress: {},
    visibleServerIds: [],
    backgroundTasks: JSON.parse(localStorage.getItem('cc_bg_tasks') || '{}'),
    serversLoading: true,

    setCurrentServer: (server) => set({ currentServer: server }),

    setCurrentServerById: (id) => {
        const { servers } = get();
        if (!id) {
            set({ currentServer: null });
            return;
        }
        const server = servers.find(s => s.id === id);
        if (server) set({ currentServer: server });
    },

    registerVisibleServers: (ids) => set({ visibleServerIds: ids }),

    refreshServers: async (showSplash = false) => {
        if (showSplash) set({ serversLoading: true });
        try {
            const data = await API.getServers();
            if (Array.isArray(data)) {
                const newIds = new Set(data.map(s => s.id));
                
                set(state => {
                    const prune = (obj: any) => {
                        const newObj = { ...obj };
                        Object.keys(newObj).forEach(key => {
                            if (!newIds.has(key)) delete newObj[key];
                        });
                        return newObj;
                    };

                    return {
                        servers: data,
                        stats: prune(state.stats),
                        backups: prune(state.backups),
                        schedules: prune(state.schedules),
                        players: prune(state.players),
                        logs: prune(state.logs),
                        installProgress: prune(state.installProgress),
                        // --- COLLAB PRUNING (Phase 2) ---
                        presence: prune(state.presence),
                        activities: prune(state.activities),
                        chatMessages: prune((state as any).chatMessages), // Shared key naming (chatMessages vs chatHistory)
                        typingUsers: prune(state.typingUsers)
                    };
                });

                const { currentServer } = get();
                if (currentServer) {
                    const updated = data.find(s => s.id === currentServer.id);
                    if (updated) set({ currentServer: { ...currentServer, ...updated } });
                }
            }
        } catch (error) {
            console.error('[ServerSlice] Failed to fetch servers:', error);
            setTimeout(() => get().refreshServers(false), 5000);
        } finally {
            set({ serversLoading: false });
        }
    },

    refreshServerData: async (serverId) => {
        try {
            const [backupData, scheduleData, playerData] = await Promise.all([
                API.getBackups(serverId),
                API.getSchedules(serverId),
                API.getPlayers(serverId, 'online')
            ]);

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

            set(state => ({
                backups: { ...state.backups, [serverId]: backupData },
                schedules: { ...state.schedules, [serverId]: scheduleData },
                players: { ...state.players, [serverId]: normalizedPlayers }
            }));
        } catch (error) {
            console.error(`[ServerSlice] Failed refresh for ${serverId}:`, error);
        }
    },

    updateServerConfig: (serverId, config) => {
        set(state => ({
            servers: state.servers.map(s => s.id === serverId ? { ...s, ...config } : s),
            currentServer: state.currentServer?.id === serverId ? { ...state.currentServer, ...config } : state.currentServer
        }));
    },

    updateServerStatus: (serverId, status) => {
        set(state => {
            const server = state.servers.find(s => s.id === serverId);
            const prevStatus = server?.status;
            
            // --- CRASH DETECTION (v1.13.2) ---
            // If it goes from ONLINE -> OFFLINE without being in STOPPING state, it crashed.
            if (prevStatus === ServerStatus.ONLINE && status === ServerStatus.OFFLINE) {
                const taskId = `crash-${serverId}-${Date.now()}`;
                console.warn(`[ServerSlice] UNEXPECTED SHUTDOWN detected for ${server?.name || serverId}`);
                
                // Add an alert task to the tray
                const { addBackgroundTask } = get();
                addBackgroundTask({
                    id: taskId,
                    name: `Critical: ${server?.name || serverId} Crashed`,
                    type: 'crash',
                    serverId,
                    status: 'failed',
                    message: 'Server process exited unexpectedly. Check logs for details.',
                    lastUpdated: Date.now()
                });
            }

            return {
                servers: state.servers.map(s => s.id === serverId ? { ...s, status } : s),
                currentServer: state.currentServer?.id === serverId ? { ...state.currentServer, status } : state.currentServer
            };
        });
    },

    addBackgroundTask: (task) => {
        set(state => {
            const newTask = { ...task, lastUpdated: Date.now() };
            const newState = { ...state.backgroundTasks, [task.id]: newTask };
            const keys = Object.keys(newState);
            if (keys.length > 50) {
                const sorted = keys.sort((a,b) => (newState[a].lastUpdated || 0) - (newState[b].lastUpdated || 0));
                delete newState[sorted[0]];
            }
            localStorage.setItem('cc_bg_tasks', JSON.stringify(newState));
            return { backgroundTasks: newState };
        });
    },

    updateBackgroundTask: (id, updates) => {
        set(state => {
            const updatedTasks = { ...state.backgroundTasks };
            if (updatedTasks[id]) {
                updatedTasks[id] = { ...updatedTasks[id], ...updates, lastUpdated: Date.now() };
                localStorage.setItem('cc_bg_tasks', JSON.stringify(updatedTasks));
            }
            return { backgroundTasks: updatedTasks };
        });
    },

    removeBackgroundTask: (id) => {
        set(state => {
            const updatedTasks = { ...state.backgroundTasks };
            delete updatedTasks[id];
            localStorage.setItem('cc_bg_tasks', JSON.stringify(updatedTasks));
            return { backgroundTasks: updatedTasks };
        });
    },

    initServerListeners: () => {
        const socket = socketService.socket;
        if (!socket) return;

        const { updateServerStatus, refreshServers, refreshServerData, updateBackgroundTask } = get();

        socket.on('status', (data) => updateServerStatus(data.id, data.status as ServerStatus));
        socket.on('status:global', (data) => updateServerStatus(data.id, data.status as ServerStatus));
        
        socket.on('stats', (data: any) => {
            const { servers, stats: currentStats } = get();
            const server = servers.find(s => s.id === data.id);
            const isClosing = server?.status === ServerStatus.OFFLINE || server?.status === ServerStatus.STOPPING;
            if (isClosing && data.cpu > 0) return;

            const existing = currentStats[data.id] || { cpu:0, memory:0, uptime:0, latency:0, players:0, playerList:[], isRealOnline:false, tps:"0.0", pid:0, lastUpdate:0 };
            
            set(state => ({
                stats: {
                    ...state.stats,
                    [data.id]: {
                        ...existing,
                        cpu: isClosing ? 0 : data.cpu,
                        memory: isClosing ? 0 : data.memory,
                        tps: isClosing ? "0.00" : data.tps,
                        uptime: isClosing ? 0 : data.uptime,
                        pid: isClosing ? 0 : data.pid,
                        lastUpdate: Date.now()
                    }
                }
            }));
        });

        socket.on('log', (data) => {
            set(state => {
                const serverLogs = state.logs[data.id] || [];
                return { logs: { ...state.logs, [data.id]: [...serverLogs, data.line].slice(-10) } };
            });
        });

        socket.on('install:status', (data) => {
            const message = typeof data?.message === 'string' ? data.message : 'Processing...';
            set({ javaDownloadStatus: { message, phase: data?.phase || 'unknown', percent: data?.percent, serverId: data?.serverId } });
            if (data?.serverId) {
                set(state => ({ installProgress: { ...state.installProgress, [data.serverId]: { message, percent: data.percent ?? 100 } } }));
            }
            if (data?.phase === 'complete' || data?.percent === 100) {
                refreshServers();
                setTimeout(() => {
                    set({ javaDownloadStatus: null });
                    if (data?.serverId) {
                        set(state => {
                            const newProgress = { ...state.installProgress };
                            delete newProgress[data.serverId];
                            return { installProgress: newProgress };
                        });
                    }
                }, 500); // v1.13.3: Faster cleanup for instant checks
            }
        });

        socket.on('backup:progress', (data) => {
            const taskId = `backup-${data.serverId}-${data.backupId}`;
            const server = get().servers.find(s => s.id === data.serverId);
            const taskName = `Backup: ${server?.name || data.serverId}`;
            
            get().updateBackgroundTask(taskId, {
                name: taskName,
                status: 'running',
                progress: data.percent,
                message: data.message || `Compressing archives (${data.percent}%)`
            });

            // If it doesn't exist, updateBackgroundTask won't do anything, so we ensure it's added
            if (!get().backgroundTasks[taskId]) {
                get().addBackgroundTask({
                    id: taskId,
                    name: taskName,
                    type: 'backup',
                    serverId: data.serverId,
                    status: 'running',
                    progress: data.percent,
                    message: data.message || `Compressing archives (${data.percent}%)`
                });
            }
        });

        socket.on('backup:status', (data) => {
            const taskId = `backup-${data.serverId}-${data.backupId}`;
            if (data.status === 'complete') {
                get().updateBackgroundTask(taskId, {
                    status: 'complete',
                    progress: 100,
                    message: data.message || 'Backup completed successfully.'
                });
            } else if (data.status === 'failed') {
                get().updateBackgroundTask(taskId, {
                    status: 'failed',
                    message: data.message || 'Backup failed.'
                });
            }
        });

        socket.on('player:join', (data) => {
            set(state => {
                const existing = state.stats[data.serverId] || { cpu:0, memory:0, uptime:0, latency:0, players:0, playerList:[], isRealOnline:false, tps:"0.0", pid:0, lastUpdate:0 };
                return { stats: { ...state.stats, [data.serverId]: { ...existing, players: data.onlinePlayers } } };
            });
            refreshServerData(data.serverId);
        });

        // --- ZOMBIE TASK PURGE (v1.13.2) ---
        // Clean up any tasks belonging to servers that no longer exist in the local cache
        const purgeZombieTasks = () => {
            const { backgroundTasks, servers, removeBackgroundTask } = get();
            const serverIds = new Set(servers.map(s => s.id));
            
            Object.values(backgroundTasks).forEach(task => {
                // If it's a global task or server exists, keep it
                if (!task.serverId || task.serverId === 'global' || serverIds.has(task.serverId)) return;
                
                console.info(`[ServerSlice] Purging zombie task ${task.id} (Server ${task.serverId} no longer exists)`);
                removeBackgroundTask(task.id);
            });
        };

        // Run initial purge
        purgeZombieTasks();

        // --- BACKGROUND TASK PURGE (v1.14.0: TTL Implementation) ---
        // Automatically sweep and remove old completed/failed tasks to keep the tray clean.
        const taskSweepInterval = setInterval(() => {
            const { backgroundTasks, removeBackgroundTask } = get();
            const now = Date.now();
            
            // Phase 65: Also run zombie purge during sweep
            purgeZombieTasks();

            Object.values(backgroundTasks).forEach(task => {
                if (task.status === 'running') return;
                
                const age = now - (task.lastUpdated || 0);
                const isSuccess = task.status === 'complete';
                
                // TTLs: 5 minutes for success, 1 hour for errors/failures
                const threshold = isSuccess ? 5 * 60 * 1000 : 60 * 60 * 1000;
                
                if (age > threshold) {
                    removeBackgroundTask(task.id);
                }
            });
        }, 60000); // Check every minute

        return () => {
            socket.off('status');
            socket.off('status:global');
            socket.off('stats');
            socket.off('log');
            socket.off('install:status');
            socket.off('backup:progress');
            socket.off('player:join');
            clearInterval(taskSweepInterval);
        };
    },

    startPolling: () => {
        let pollId = 0;
        const interval = setInterval(async () => {
            const { servers, currentServer, visibleServerIds } = get();
            if (servers.length === 0) return;
            
            pollId++;
            const isFullPoll = pollId % 15 === 0;
            const isVisiblePoll = pollId % 2 === 0;

            const targetServers = servers.filter(s => {
                if (s.id === currentServer?.id) return true;
                if (visibleServerIds.includes(s.id) && isVisiblePoll) return true;
                if (isFullPoll) return true;
                return false;
            });

            const pollStartTime = Date.now();
            const results = await Promise.allSettled(targetServers.map(async (server) => {
                try {
                    const queryStats = await API.getServerStatus(server.id);
                    const isOnline = queryStats.online || false;
                    const isTransitioning = [ServerStatus.STARTING, ServerStatus.RESTARTING, ServerStatus.STOPPING].includes(server.status as ServerStatus);
                    let procStats = null;
                    if (isOnline || isTransitioning) procStats = await API.getServerStats(server.id);
                    return { serverId: server.id, queryStats, procStats, isOnline };
                } catch { return { serverId: server.id, error: true }; }
            }));

            set(state => {
                const newStats = { ...state.stats };
                let statsChanged = false;
                let serversChanged = false;

                const updatedServers = state.servers.map(s => {
                    const resIdx = targetServers.findIndex(ts => ts.id === s.id);
                    if (resIdx === -1) return s;

                    const res = results[resIdx];
                    if (res.status === 'fulfilled' && !res.value.error) {
                        const { queryStats, procStats, isOnline } = res.value;
                        
                        // 1. Update stats object
                        const current = newStats[s.id] || { cpu:0, memory:0, uptime:0, latency:0, players:0, playerList:[], isRealOnline:false, tps:"0.0", pid:0, lastUpdate:0 };
                        if (current.lastUpdate <= pollStartTime) {
                            const statsUpdate = {
                                ...current,
                                isRealOnline: isOnline,
                                latency: queryStats.latency || 0,
                                players: queryStats.players || 0,
                                diagnosis: procStats?.diagnosis || queryStats?.diagnosis || [],
                                lastUpdate: Date.now()
                            };

                            if (procStats) {
                                statsUpdate.cpu = procStats.cpu || 0;
                                statsUpdate.memory = procStats.memory || 0;
                                statsUpdate.uptime = procStats.uptime || 0;
                                statsUpdate.tps = queryStats.tps || '20.0';
                                statsUpdate.pid = procStats.pid || 0;
                            }

                            if (JSON.stringify(current) !== JSON.stringify(statsUpdate)) {
                                newStats[s.id] = statsUpdate;
                                statsChanged = true;
                            }
                        }

                        // 2. Status Reconciliation (Self-Healing)
                        // If it's responding to queries (isOnline), it MUST be online.
                        // Force transition from STARTING/RESTARTING to ONLINE if missed by socket.
                        if (isOnline && (s.status === ServerStatus.STARTING || s.status === ServerStatus.RESTARTING)) {
                            serversChanged = true;
                            return { ...s, status: ServerStatus.ONLINE };
                        }
                        
                        // Fallback: If it's NOT online and we think it's STOPPING, eventually force OFFLINE
                        // (We give it more time to avoid flickering)
                        // This logic is optional but improves resilience
                    }
                    return s;
                });

                if (!statsChanged && !serversChanged) return state;

                const update: any = {};
                if (statsChanged) update.stats = newStats;
                if (serversChanged) {
                    update.servers = updatedServers;
                    if (state.currentServer) {
                        const updatedCurrent = updatedServers.find(s => s.id === state.currentServer!.id);
                        if (updatedCurrent) update.currentServer = updatedCurrent;
                    }
                }
                return update;
            });
        }, 2000);

        return () => clearInterval(interval);
    }
});
