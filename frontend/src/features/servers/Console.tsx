import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogEntry, ServerStatus } from '@shared/types';
import { Play, Pause, Trash2, ArrowRight, Power, Ban, RotateCcw, ArrowDown, Terminal as TerminalIcon, Wifi, Download, Search, Filter, FileText, Clock } from 'lucide-react';

import { API } from '@core/services/api';
import { socketService } from '@core/services/socket';
import { useToast } from '../ui/Toast';
import { useUser } from '@features/auth/context/UserContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { useCollaboration } from '@features/collaboration/context/CollaborationContext';
import PresenceBar from '../collaboration/PresenceBar';
import { UserRole } from '@shared/types';


const COMMON_COMMANDS = [
    'advancement', 'attribute', 'ban', 'ban-ip', 'banlist', 'bossbar', 'clear', 
    'clone', 'data', 'datapack', 'debug', 'defaultgamemode', 'deop', 'difficulty', 
    'effect', 'enchant', 'execute', 'experience', 'fill', 'forceload', 'function', 
    'gamemode', 'gamerule', 'give', 'help', 'item', 'jfr', 'kick', 'kill', 'list',
    'locate', 'loot', 'me', 'msg', 'op', 'pardon', 'pardon-ip', 'particle', 'perf', 
    'place', 'playsound', 'recipe', 'reload', 'return', 'ride', 'save-all', 'save-off', 
    'save-on', 'say', 'schedule', 'scoreboard', 'seed', 'setblock', 'setidletimeout', 
    'setworldspawn', 'spawnpoint', 'spectate', 'spreadplayers', 'stop', 'stopsound', 
    'summon', 'tag', 'team', 'teammsg', 'teleport', 'tell', 'tellraw', 'time', 
    'title', 'tm', 'tp', 'trigger', 'w', 'weather', 'whitelist', 'worldborder', 'xp',
    'tps', 'gc', 'spark', 'timings', 'paper', 'spigot', 'purpur'
];

interface ConsoleProps {
    serverId: string;
}

import { useServers } from '@features/servers/context/ServerContext';
const Console: React.FC<ConsoleProps> = ({ serverId }) => {
    const { servers, javaDownloadStatus, updateServerStatus, addBackgroundTask, updateBackgroundTask, removeBackgroundTask } = useServers();
    const server = servers.find(s => s.id === serverId);
    const status = server?.status || ServerStatus.OFFLINE;
    
    // Check if Java is currently downloading - only active phases
    const isJavaDownloading = javaDownloadStatus && 
        (javaDownloadStatus.phase === 'downloading' || 
         javaDownloadStatus.phase === 'extracting' || 
         javaDownloadStatus.phase === 'installing');

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [command, setCommand] = useState('');
    const [isPaused, setIsPaused] = useState(false);
    const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
    const [isGracefulStopping, setIsGracefulStopping] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [suggestionIndex, setSuggestionIndex] = useState(-1);
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [savedCommand, setSavedCommand] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem(`console_history_${serverId}`);
        if (saved) {
            try {
                setCommandHistory(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse command history');
            }
        }
    }, [serverId]);

    useEffect(() => {
        if (commandHistory.length > 0) {
            localStorage.setItem(`console_history_${serverId}`, JSON.stringify(commandHistory));
        }
    }, [commandHistory, serverId]);

    // Fix #20: Sync command history across tabs using BroadcastChannel
    useEffect(() => {
        const channel = new BroadcastChannel(`console_history_${serverId}`);
        channel.onmessage = (event) => {
            if (event.data && Array.isArray(event.data)) {
                setCommandHistory(event.data);
            }
        };
        return () => channel.close();
    }, [serverId]);

    const updateCommandHistory = (newHistory: string[]) => {
        setCommandHistory(newHistory);
        const channel = new BroadcastChannel(`console_history_${serverId}`);
        channel.postMessage(newHistory);
        channel.close();
    };

    // Log Filtering
    const [logFilter, setLogFilter] = useState<Set<string>>(new Set(['INFO', 'WARN', 'ERROR']));
    const [logSearch, setLogSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [showTimestamps, setShowTimestamps] = useState(true);
    
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { addToast } = useToast();
    const { user, theme } = useUser(); // Access global user prefs
    const { can } = usePermissions();
    const { updateActiveView } = useCollaboration();

    // Power Actions check
    const canStart = can('server.start', serverId);
    const canStop = can('server.stop', serverId);
    const canRestart = can('server.restart', serverId);
    const canWrite = can('server.console.write', serverId);

    // Notify collab context that we're on console
    useEffect(() => {
        if (serverId) updateActiveView(serverId, 'console');
    }, [serverId, updateActiveView]);

    // Socket listener for status updates to clear graceful stopping state
    useEffect(() => {
        if (status === ServerStatus.OFFLINE || status === ServerStatus.STOPPING) {
            setIsGracefulStopping(false);
        }
    }, [status]);

    // Socket.io & Initial Fetch (Logs Only)
    useEffect(() => {
        // Initial Logs Sync
        const syncLogs = async () => {
             try {
                // 2. Historical Logs
                const history = await API.getLogs(serverId);
                if (history && Array.isArray(history)) {
                    // Cap initial history at 1000 to prevent initial DOM bloat
                    const cappedHistory = history.slice(-1000);
                    setLogs(cappedHistory.map(line => ({
                         id: crypto.randomUUID(),
                         timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
                         level: line.includes('ERROR') || line.includes('stderr') ? 'ERROR' : 'INFO',
                         message: line
                    })));
                }
             } catch (e) {
                 // Silently fail — logs sync on reconnect
             }
        };
        syncLogs();

        // Listen for logs (capped at 1000 to prevent memory leak)
        const onLog = (data: any) => {
            if (data.id !== serverId) return;
            setLogs(prev => {
                const next = [...prev, {
                    id: crypto.randomUUID(),
                    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
                    level: data.type === 'stderr' ? 'ERROR' : 'INFO',
                    message: data.line
                }];
                // Cap buffer at 1000 entries to prevent memory bloat
                return next.length > 1000 ? next.slice(-1000) : next;
            });
        };
        const unsub = socketService.onLog(onLog);

        return () => {
             unsub();
        };
    }, [serverId]);

    // Smart Auto-Scroll Stabilization
    useLayoutEffect(() => {
        if (isPaused || userHasScrolledUp) return;
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [logs, isPaused, userHasScrolledUp]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        // Threshold: 32px from bottom (approx 1.5 lines)
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 32;
        setUserHasScrolledUp(!isAtBottom);
    };

    const scrollToBottom = () => {
        setUserHasScrolledUp(false);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                top: scrollContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    };


    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!command.trim()) return;
        
        // Send via Socket
        socketService.socket.emit('command', { serverId, command });
        
        // Push to history (dedup last entry)
        const trimmed = command.trim();
        const filtered = commandHistory.filter(c => c !== trimmed);
        const next = [trimmed, ...filtered].slice(0, 50);
        updateCommandHistory(next);
        
        setHistoryIndex(-1);
        setSavedCommand('');

        // Optimistic UI update
        setLogs(prev => [...prev, {
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
            level: 'INFO',
            message: `> ${command}`
        }]);

        setCommand('');
        setSuggestions([]);
        setSuggestionIndex(-1);
        setUserHasScrolledUp(false);
        const reducedMotion = user?.preferences?.reducedMotion ?? false;
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' }), 50);
    };

    const handleCommandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setCommand(val);
        setHistoryIndex(-1);
        
        if (!val.trim()) {
            setSuggestions([]);
            return;
        }

        const args = val.trimStart().split(' ');
        if (args.length === 1 && !val.endsWith(' ')) {
            const isSlash = val.trimStart().startsWith('/');
            const query = (isSlash ? args[0].substring(1) : args[0]).toLowerCase();
            if (!query) {
                setSuggestions([]);
                return;
            }
            const matches = COMMON_COMMANDS.filter(c => c.startsWith(query));
            setSuggestions(matches.slice(0, 8));
        } else {
            setSuggestions([]);
        }
        setSuggestionIndex(-1);
    };

    // Command History Navigation (Up/Down arrows) and Ctrl+Enter Submission
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (suggestions.length > 0) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSuggestionIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSuggestionIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const selected = suggestions[suggestionIndex >= 0 ? suggestionIndex : 0];
                const isSlash = command.trimStart().startsWith('/');
                setCommand(isSlash ? `/${selected} ` : `${selected} `);
                setSuggestions([]);
                setSuggestionIndex(-1);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setSuggestions([]);
                setSuggestionIndex(-1);
                return;
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (command.trim() && status === ServerStatus.ONLINE) {
                handleSend(e as unknown as React.FormEvent);
            }
        } else if (e.key === 'ArrowUp' && suggestions.length === 0) {
            e.preventDefault();
            if (commandHistory.length === 0) return;
            if (historyIndex === -1) setSavedCommand(command);
            const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
            setHistoryIndex(newIndex);
            setCommand(commandHistory[newIndex]);
        } else if (e.key === 'ArrowDown' && suggestions.length === 0) {
            e.preventDefault();
            if (historyIndex <= 0) {
                setHistoryIndex(-1);
                setCommand(savedCommand);
                return;
            }
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setCommand(commandHistory[newIndex]);
        }
    };

    const handleExportLogs = () => {
        const content = logs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `server-${serverId}-logs-${new Date().toISOString().split('T')[0]}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addToast('success', 'Logs Exported', 'A log file has been generated and downloaded.');
    };

    const handleDownloadServerLog = async () => {
        try {
            await API.downloadServerLog(serverId);
            addToast('success', 'Full Log Downloaded', 'The latest server log file has been retrieved.');
        } catch (e: any) {
            addToast('error', 'Download Failed', e.message);
        }
    };

    const renderMessage = (msg: string) => {
        if (msg.startsWith('>')) {
            return <span className="text-white font-semibold opacity-90">{msg}</span>;
        }

        // Syntax highlighting
        // 1. Handle Log Levels & Timestamps
        // Regex to match [HH:mm:ss LEVEL]: or [HH:mm:ss] [STDOUT/INFO]:
        const logHeaderRegex = /^(\[?\d{2}:\d{2}:\d{2}\]?)\s*(\[.*?\])?\s*(:?)/;
        const headerMatch = msg.match(logHeaderRegex);
        
        let remainingMsg = msg;
        let headerElements: React.ReactNode[] = [];

        if (headerMatch) {
            const [fullHeader, timestamp, level] = headerMatch;
            if (showTimestamps) {
                headerElements.push(
                    <span key="ts" className="text-zinc-500 font-mono tracking-tighter opacity-60 mr-2">{timestamp}</span>
                );
            }
            if (level) {
                const isError = level.includes('ERROR') || level.includes('stderr') || level.includes('FATAL');
                const isWarn = level.includes('WARN');
                const isInfo = level.includes('INFO');
                
                headerElements.push(
                    <span key="lvl" className={`font-black uppercase tracking-widest mr-2 ${
                        isError ? 'text-rose-500' : isWarn ? 'text-amber-500' : isInfo ? 'text-emerald-500' : 'text-zinc-400'
                    }`}>
                        {level.replace(/[\[\]]/g, '')}
                    </span>
                );
            }
            remainingMsg = msg.substring(fullHeader.length).trim();
        }

        // 2. Process remaining message for keywords and Minecraft § codes
        // Replace § codes with spans (very basic implementation)
        const mcColorMap: Record<string, string> = {
            '0': 'text-[#000000]', '1': 'text-[#0000AA]', '2': 'text-[#00AA00]', '3': 'text-[#00AAAA]',
            '4': 'text-[#AA0000]', '5': 'text-[#AA00AA]', '6': 'text-[#FFAA00]', '7': 'text-[#AAAAAA]',
            '8': 'text-[#555555]', '9': 'text-[#5555FF]', 'a': 'text-[#55FF55]', 'b': 'text-[#55FFFF]',
            'c': 'text-[#FF5555]', 'd': 'text-[#FF55FF]', 'e': 'text-[#FFFF55]', 'f': 'text-[#FFFFFF]',
        };

        const parts = remainingMsg.split(/(§[0-9a-f]|\[.*?\]|\b\w+ joined\b|\b\w+ left\b|\b\w+ issued server command\b)/g);
        
        let currentColorClass = '';

        const content = parts.map((part, i) => {
            if (part.startsWith('§')) {
                const code = part[1].toLowerCase();
                currentColorClass = mcColorMap[code] || '';
                return null;
            }
            if (part.startsWith('[') && part.endsWith(']')) {
                return <span key={i} className="text-zinc-500 font-bold opacity-40 bg-white/5 px-1 rounded mx-0.5">{part}</span>;
            }
            if (part && (part.includes('joined') || part.includes('left'))) {
                return (
                    <span key={i} className="text-emerald-400/90 font-bold inline-flex items-center gap-1.5 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 my-0.5">
                        <ArrowRight size={10} className={part.includes('left') ? 'rotate-180 text-rose-400' : ''} />
                        {part}
                    </span>
                );
            }
            if (part && part.includes('issued server command')) {
                return <span key={i} className="text-primary/70 italic font-medium opacity-80">{part}</span>;
            }
            
            // Highlight specific technical keywords
            if (/\b(Exception|Error|Failure|NullPointerException|Crash)\b/i.test(part)) {
                return <span key={i} className="text-rose-400 font-black underline decoration-rose-500/30 underline-offset-2">{part}</span>;
            }
            if (/\b(Done|Success|Finished|Ready|Loaded)\b/i.test(part)) {
                return <span key={i} className="text-emerald-400 font-bold">{part}</span>;
            }

            return <span key={i} className={currentColorClass}>{part}</span>;
        }).filter(Boolean);

        return (
            <div className="inline-flex flex-wrap items-center">
                {headerElements}
                {content}
            </div>
        );
    };

    // Toggle log level filter
    const toggleLogLevel = (level: string) => {
        setLogFilter(prev => {
            const next = new Set(prev);
            if (next.has(level)) {
                if (next.size > 1) next.delete(level); // prevent deselecting all
            } else {
                next.add(level);
            }
            return next;
        });
    };

    const handleGracefulStop = async () => {
        if (!canStop) return;
        
        try {
            if (isGracefulStopping) {
                await API.cancelGracefulStop(serverId);
                setIsGracefulStopping(false);
                addToast('info', 'Shutdown', 'Graceful shutdown cancelled.');
                return;
            }

            setIsGracefulStopping(true);
            await API.gracefulStopServer(serverId, 30);
            addToast('warning', 'Shutdown', 'Graceful shutdown initiated (30s).');
        } catch (e: any) {
            setIsGracefulStopping(false);
            addToast('error', 'Shutdown Failed', e.message);
        }
    };

    const handlePower = async (action: 'start' | 'restart' | 'stop') => {
        const previousStatus = status;
        const taskId = `${action}-${serverId}-${Date.now()}`;
        
        try {
            if (action === 'start') {
                if (!canStart) {
                    addToast('error', 'Permissions', 'Insufficient permissions to start server');
                    return;
                }
                addBackgroundTask({
                    id: taskId,
                    name: `Startup: ${server?.name || serverId}`,
                    type: 'start',
                    serverId,
                    status: 'running',
                    progress: 0,
                    message: 'Initializing server startup...'
                });
                updateServerStatus(serverId, ServerStatus.STARTING);
                addToast('info', 'Console', 'Server starting...');
                await API.startServer(serverId);
                updateBackgroundTask(taskId, { name: `Startup: ${server?.name || serverId}`, status: 'complete', progress: 100, message: 'Server started' });
            } else if (action === 'stop') {
                if (!canStop) {
                    addToast('error', 'Permissions', 'Insufficient permissions to stop server');
                    return;
                }
                setIsGracefulStopping(false);
                addBackgroundTask({
                    id: taskId,
                    name: `Shutdown: ${server?.name || serverId}`,
                    type: 'stop',
                    serverId,
                    status: 'running',
                    progress: 0,
                    message: 'Sending termination signal...'
                });
                updateServerStatus(serverId, ServerStatus.STOPPING);
                addToast('warning', 'Console', 'Termination signal sent.');
                await API.stopServer(serverId);
                updateBackgroundTask(taskId, { name: `Shutdown: ${server?.name || serverId}`, status: 'complete', progress: 100, message: 'Server stopped' });
            } else if (action === 'restart') {
                if (!canRestart) {
                    addToast('error', 'Permissions', 'Insufficient permissions to restart server');
                    return;
                }
                setIsGracefulStopping(false);
                addBackgroundTask({
                    id: taskId,
                    name: `Restart: ${server?.name || serverId}`,
                    type: 'restart',
                    serverId,
                    status: 'running',
                    progress: 0,
                    message: 'Initiating server restart...'
                });
                updateServerStatus(serverId, ServerStatus.STOPPING);
                addToast('info', 'Console', 'Restarting process...');
                await API.stopServer(serverId);
                
                updateBackgroundTask(taskId, { name: `Restart: ${server?.name || serverId}`, progress: 50, message: 'Waiting for process to exit...' });

                // Wait for OFFLINE status via socket event
                const maxWait = 15000;
                await new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => {
                        unsub();
                        resolve();
                    }, maxWait);
                    const unsub = socketService.onStatus((data) => {
                        if (data.id === serverId && data.status === ServerStatus.OFFLINE) {
                            clearTimeout(timeout);
                            unsub();
                            resolve();
                        }
                    });
                });
                
                updateBackgroundTask(taskId, { name: `Restart: ${server?.name || serverId}`, progress: 75, message: 'Relaunching server...' });
                updateServerStatus(serverId, ServerStatus.STARTING);
                await API.startServer(serverId);
                updateBackgroundTask(taskId, { name: `Restart: ${server?.name || serverId}`, status: 'complete', progress: 100, message: 'Server restarted' });
            }
        } catch (e: any) {
            updateServerStatus(serverId, previousStatus as ServerStatus);
            removeBackgroundTask(taskId);
            addToast('error', 'Power Action Failed', e.message);
        }
    };


    const filteredLogs = logs.filter(l => {
        if (!logFilter.has(l.level)) return false;
        if (logSearch && !l.message.toLowerCase().includes(logSearch.toLowerCase())) return false;
        return true;
    });
    const visibleLogs = filteredLogs.slice(-250);

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] rounded-xl border border-border bg-card overflow-hidden shadow-2xl animate-fade-in ring-1 ring-border/50 relative">
            {/* Header: Status & Controls */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-4 py-3 border-b border-border bg-muted/30 gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-secondary/50 rounded-md border border-border/50">
                        <TerminalIcon size={16} className="text-foreground" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-foreground">Terminal Access</h2>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                status === ServerStatus.ONLINE ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                status === ServerStatus.OFFLINE ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            }`}>
                                {status}
                            </span>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground opacity-70">{server?.workingDirectory || server?.name || serverId}</span>
                    </div>
                    {/* Presence Bar - who else is watching */}
                    <PresenceBar serverId={serverId} />
                </div>

                {/* Power Control Group */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex items-center p-1 bg-background/50 border border-border rounded-lg shadow-sm">
                        <button 
                            onClick={() => handlePower('start')}
                            disabled={status !== ServerStatus.OFFLINE || isJavaDownloading || !canStart}
                            title={!canStart ? 'Insufficient Permissions' : (isJavaDownloading ? "Java is being downloaded. Please wait..." : "Start Server")}
                            className={`p-2 rounded-md transition-all duration-200 flex items-center gap-2 text-xs font-medium ${
                                status === ServerStatus.OFFLINE && !isJavaDownloading && canStart
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-inner' 
                                : 'text-muted-foreground opacity-50 cursor-not-allowed hover:bg-secondary'
                            }`}
                        >
                            <Power size={14} /> <span className="hidden sm:inline">Start</span>
                        </button>
                        <div className="w-[1px] h-4 bg-border mx-1"></div>
                        <button 
                            onClick={() => handlePower('restart')}
                            disabled={status === ServerStatus.OFFLINE || status === ServerStatus.STARTING || status === ServerStatus.STOPPING || status === ServerStatus.RESTARTING || !canRestart}
                            className={`p-2 rounded-md transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed`}
                            title={!canRestart ? 'Insufficient Permissions' : (status === ServerStatus.STARTING ? "Startup Lock Active" : "Restart Server")}
                        >
                            <RotateCcw size={14} />
                        </button>
                        <div className="w-[1px] h-4 bg-border mx-1"></div>
                        <button 
                            onClick={handleGracefulStop}
                            disabled={status !== ServerStatus.ONLINE || !canStop}
                            className={`p-2 rounded-md transition-all duration-200 flex items-center gap-2 text-xs font-medium ${
                                isGracefulStopping 
                                ? 'bg-amber-500 hover:bg-amber-400 text-black animate-pulse' 
                                : status === ServerStatus.ONLINE && canStop
                                ? 'text-amber-500 hover:bg-amber-500/10' 
                                : 'text-muted-foreground opacity-30 cursor-not-allowed'
                            }`}
                            title={isGracefulStopping ? "Cancel Graceful Shutdown" : "Graceful Shutdown (30s)"}
                        >
                            {isGracefulStopping ? <RotateCcw size={14} className="animate-spin-slow" /> : <Power size={14} className="opacity-70" />}
                            <span className="hidden sm:inline">{isGracefulStopping ? 'Cancel' : 'Graceful'}</span>
                        </button>
                        <div className="w-[1px] h-4 bg-border mx-1"></div>
                        <button 
                            onClick={() => handlePower('stop')}
                            disabled={status === ServerStatus.OFFLINE || status === ServerStatus.STARTING || status === ServerStatus.STOPPING || status === ServerStatus.RESTARTING || !canStop}
                            className={`p-2 rounded-md transition-all duration-200 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed`}
                            title={!canStop ? 'Insufficient Permissions' : (status === ServerStatus.STARTING ? "Startup Lock Active" : "Kill Process")}
                        >
                            <Ban size={14} />
                        </button>
                    </div>

                    <div className="h-6 w-[1px] bg-border mx-1 hidden md:block"></div>

                    {/* Buffer Controls */}
                    <div className="flex gap-1">
                        <button 
                            onClick={() => setIsPaused(!isPaused)}
                            className={`p-2 rounded-md border border-transparent hover:border-border transition-colors ${isPaused ? 'bg-amber-500/10 text-amber-500' : 'text-muted-foreground hover:bg-secondary'}`}
                            title={isPaused ? "Resume Output" : "Pause Output"}
                            aria-label={isPaused ? "Resume Output" : "Pause Output"}
                        >
                            {isPaused ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                        <button 
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-2 rounded-md border border-transparent hover:border-border transition-colors ${showFilters ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
                            title="Toggle Filters"
                            aria-label="Toggle Filters"
                        >
                            <Filter size={14} />
                        </button>
                        <button 
                            onClick={() => setShowTimestamps(!showTimestamps)}
                            className={`p-2 rounded-md border border-transparent hover:border-border transition-colors ${showTimestamps ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
                            title="Toggle Timestamps"
                            aria-label="Toggle Timestamps"
                        >
                            <Clock size={14} />
                        </button>
                        <button 
                            onClick={handleExportLogs}
                            disabled={logs.length === 0}
                            className="p-2 rounded-md border border-transparent hover:border-border text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Export Current Buffer"
                            aria-label="Export Current Buffer"
                        >
                            <Download size={14} />
                        </button>
                        <button 
                            onClick={handleDownloadServerLog}
                            className="p-2 rounded-md border border-transparent hover:border-border text-muted-foreground hover:bg-secondary hover:text-primary transition-colors"
                            title="Download Latest.log from Server"
                            aria-label="Download Latest.log from Server"
                        >
                            <FileText size={14} />
                        </button>
                        <button 
                            onClick={() => setLogs([])}
                            className="p-2 rounded-md border border-transparent hover:border-border text-muted-foreground hover:bg-secondary hover:text-destructive transition-colors"
                            title="Clear Console"
                            aria-label="Clear Console"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Bedrock Specific Join Guide / Port Warning */}
            {server?.software === 'Bedrock' && status === ServerStatus.ONLINE && (
                <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-3">
                        <Wifi size={14} className="text-emerald-500" />
                        <span className="text-zinc-300">
                            Bedrock Server Active. Join via: <span className="text-white font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/10 ml-1">
                                {server.ip || window.location.hostname || '127.0.0.1'}:{server.port}
                            </span>
                        </span>
                        <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase text-[9px]">UDP</span>
                    </div>
                    <div className="text-muted-foreground italic flex items-center gap-2">
                        <ArrowRight size={12} />
                        Local players should use your machine's LAN IP address
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            {showFilters && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20 animate-in fade-in slide-in-from-top-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mr-1">Level:</span>
                    {['INFO', 'WARN', 'ERROR'].map(level => (
                        <button
                            key={level}
                            onClick={() => toggleLogLevel(level)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                                logFilter.has(level)
                                    ? level === 'ERROR' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                    : level === 'WARN' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-muted/30 text-muted-foreground/40 border-border/50'
                            }`}
                        >
                            {level}
                        </button>
                    ))}
                    <div className="h-4 w-[1px] bg-border mx-1"></div>
                    <div className="relative flex-1 max-w-xs">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                        <input
                            type="text"
                            value={logSearch}
                            onChange={(e) => setLogSearch(e.target.value)}
                            placeholder="Search logs..."
                            className="w-full bg-black/30 border border-border/50 rounded px-6 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/30"
                        />
                        {logSearch && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/50">
                                {visibleLogs.length} match{visibleLogs.length !== 1 ? 'es' : ''}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Log Output Area */}
            <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 font-mono space-y-0.5 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent relative transition-all duration-500"
                style={{ 
                    fontSize: `${user?.preferences?.terminal?.fontSize || 14}px`,
                    fontFamily: user?.preferences?.terminal?.fontFamily === 'monospace' ? "'JetBrains Mono', monospace" : 'sans-serif',
                    backgroundColor: user?.preferences.visualQuality ? 'rgba(0,0,0,0.45)' : '#09090b',
                    backdropFilter: user?.preferences.visualQuality ? 'blur(32px) saturate(140%)' : 'none'
                }}
            >
                {/* Scroll Notification Overlay */}
                <AnimatePresence>
                    {userHasScrolledUp && !isPaused && (
                        <motion.button 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            onClick={scrollToBottom}
                            className={`sticky top-2 left-1/2 -translate-x-1/2 text-white px-4 py-2 rounded-full shadow-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 z-50 transition-colors ${theme.bg} border border-white/10`}
                        >
                            <ArrowDown size={12} strokeWidth={3} /> Synchronize Stream
                        </motion.button>
                    )}
                </AnimatePresence>

                {visibleLogs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30 select-none">
                        <TerminalIcon size={48} className="mb-4 opacity-20" />
                        <p className="text-sm">Server is offline or log buffer is empty.</p>
                        <p className="text-xs mt-1">Press 'Start' to launch the server.</p>
                    </div>
                )}
                                {visibleLogs.map((log) => (
                    <div key={log.id} className="flex gap-3 leading-6 hover:bg-white/5 -mx-4 px-4 transition-colors">
                        {showTimestamps && (
                            <span className="text-muted-foreground/30 select-none w-[70px] shrink-0 pt-0.5 font-mono" style={{ fontSize: '0.9em' }}>{log.timestamp}</span>
                        )}
                        <span className={`shrink-0 font-bold w-10 pt-0.5 ${
                            log.level === 'WARN' ? 'text-amber-500' :
                            log.level === 'ERROR' ? 'text-rose-500' :
                            'text-emerald-500'
                        }`} style={{ fontSize: '0.9em' }}>
                            {log.level}
                        </span>
                        <span className={`break-all whitespace-pre-wrap ${
                            log.level === 'WARN' ? 'text-amber-200/80' : 
                            log.level === 'ERROR' ? 'text-rose-200/80' :
                            'text-zinc-400'
                        }`}>
                            {renderMessage(log.message)}
                        </span>
                    </div>
                ))}

                
                {logs.length > visibleLogs.length && (
                    <div className="text-center py-2 text-xs text-muted-foreground/40 italic">
                        --- Older logs hidden for performance ---
                    </div>
                )}
                
                <div ref={endRef} />
            </div>

            {/* Command Input */}
            <div className="bg-muted/30 p-3 border-t border-border z-10">
                {canWrite ? (
                <>
                {status === ServerStatus.ONLINE && (
                    <div className="flex items-center gap-1 mb-2 overflow-x-auto scrollbar-none">
                        <span className="text-[8px] font-black text-muted-foreground/30 uppercase tracking-widest mr-1 shrink-0">Quick</span>
                        {[
                            { cmd: 'save-all', label: 'Save' },
                            { cmd: 'list', label: 'Players' },
                            { cmd: 'tps', label: 'TPS' },
                            { cmd: 'gc', label: 'GC' },
                            { cmd: 'seed', label: 'Seed' },
                            { cmd: 'difficulty', label: 'Difficulty' },
                            { cmd: 'whitelist list', label: 'Whitelist' },
                        ].map(({ cmd, label }) => (
                            <button
                                key={cmd}
                                onClick={() => { socketService.socket.emit('command', { serverId, command: cmd }); }}
                                className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 bg-muted/30 border border-border/40 rounded hover:text-foreground hover:bg-muted/60 hover:border-primary/30 transition-all shrink-0"
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
                <form onSubmit={handleSend} className="relative flex gap-2 items-center bg-[#09090b] border border-border rounded-lg px-3 py-2.5 focus-within:ring-1 focus-within:ring-primary/50 focus-within:border-primary/50 transition-all shadow-inner">
                    {suggestions.length > 0 && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-secondary/95 backdrop-blur-md border border-border rounded-lg shadow-2xl overflow-hidden animate-fade-in z-50 p-1">
                            {suggestions.map((s, idx) => (
                                <div 
                                    key={s} 
                                    className={`px-3 py-1.5 text-xs font-mono rounded cursor-pointer transition-colors ${idx === (suggestionIndex === -1 ? 0 : suggestionIndex) ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                                    onMouseDown={(e) => {
                                        // use onMouseDown to prevent blur before click registers
                                        e.preventDefault(); 
                                        const isSlash = command.trimStart().startsWith('/');
                                        setCommand(isSlash ? `/${s} ` : `${s} `);
                                        setSuggestions([]);
                                        setSuggestionIndex(-1);
                                        inputRef.current?.focus();
                                    }}
                                >
                                    <span className="opacity-40 select-none mr-2">/</span>{s}
                                </div>
                            ))}
                        </div>
                    )}
                    <span className={`font-bold font-mono animate-pulse ${theme.text}`}>{'>'}</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={command}
                        onChange={handleCommandChange}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={status === ServerStatus.ONLINE ? "Awaiting command... (Tab to complete, ↑↓ history)" : status === ServerStatus.STARTING ? "Node Initializing..." : "Node Offline."}
                        disabled={status !== ServerStatus.ONLINE}
                        className="flex-1 bg-transparent border-none text-[13px] font-mono text-zinc-100 focus:outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
                    />
                    <button 
                        type="submit"
                        disabled={!command.trim() || status !== ServerStatus.ONLINE} 
                        className={`p-1.5 bg-primary/10 text-primary rounded hover:bg-primary/20 disabled:opacity-0 transition-all ${theme.text}`}
                    >
                        <ArrowRight size={14} />
                    </button>
                </form>
                </>
                ) : (
                <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground/50 bg-muted/10 rounded-lg border border-border/30">
                    <TerminalIcon size={12} />
                    <span>Read-only console — your role ({user?.role}) does not allow sending commands.</span>
                </div>
                )}
            </div>
        </div>
    );
};

export default Console;
