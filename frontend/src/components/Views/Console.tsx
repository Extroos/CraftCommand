
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { LogEntry, ServerStatus } from '@shared/types';
import { Play, Pause, Trash2, ArrowRight, Power, Ban, RotateCcw, ArrowDown, Terminal as TerminalIcon } from 'lucide-react';

import { API } from '../../services/api';
import { socketService } from '../../services/socket';
import { useToast } from '../UI/Toast';
import { useUser } from '../../context/UserContext';

interface ConsoleProps {
    serverId: string;
}

import { useServers } from '../../context/ServerContext';

const Console: React.FC<ConsoleProps> = ({ serverId }) => {
    const { servers, javaDownloadStatus } = useServers();
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
    
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const { addToast } = useToast();
    const { user, theme } = useUser(); // Access global user prefs

    // Socket.io & Initial Fetch (Logs Only)
    useEffect(() => {
        // Initial Logs Sync
        const syncLogs = async () => {
             try {
                // 2. Historical Logs
                const history = await API.getLogs(serverId);
                if (history && Array.isArray(history)) {
                    setLogs(history.map(line => ({
                         id: Date.now().toString() + Math.random(),
                         timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
                         level: line.includes('ERROR') || line.includes('stderr') ? 'ERROR' : 'INFO',
                         message: line
                    })));
                }
             } catch (e) {
                 console.error("Failed to sync logs", e);
             }
        };
        syncLogs();

        // Listen for logs
        const onLog = (data: any) => {
            if (data.id !== serverId) return;
            setLogs(prev => [...prev, {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
                level: data.type === 'stderr' ? 'ERROR' : 'INFO',
                message: data.line
            }]);
        };
        const unsub = socketService.onLog(onLog);

        return () => {
             unsub();
        };
    }, [serverId]);

    // Smart Auto-Scroll
    useLayoutEffect(() => {
        if (isPaused || userHasScrolledUp) return;
        const reducedMotion = user?.preferences?.reducedMotion ?? false;
        endRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'instant' }); 
    }, [logs, isPaused, userHasScrolledUp, user?.preferences?.reducedMotion]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        setUserHasScrolledUp(!isAtBottom);
    };

    const scrollToBottom = () => {
        setUserHasScrolledUp(false);
        const reducedMotion = user?.preferences?.reducedMotion ?? false;
        endRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' });
    };


    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!command.trim()) return;
        
        // Send via Socket
        socketService.socket.emit('command', { serverId, command });
        
        // Optimistic UI update
        setLogs(prev => [...prev, {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
            level: 'INFO',
            message: `> ${command}`
        }]);

        setCommand('');
        setUserHasScrolledUp(false);
        const reducedMotion = user?.preferences?.reducedMotion ?? false;
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' }), 50);
    };

    const handlePower = async (action: 'start' | 'restart' | 'stop') => {
        if (action === 'start') {
            addToast('info', 'Console', 'Boot sequence initiated.');
            await API.startServer(serverId);
        } else if (action === 'stop') {
            addToast('warning', 'Console', 'Termination signal sent.');
            await API.stopServer(serverId);
        } else if (action === 'restart') {
            addToast('info', 'Console', 'Restarting process...');
            await API.stopServer(serverId);
            setTimeout(() => API.startServer(serverId), 2000);
        }
    };


    const visibleLogs = logs.slice(-250);

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
                        <span className="text-xs font-mono text-muted-foreground opacity-70">/home/container/server.jar</span>
                    </div>
                </div>

                {/* Power Control Group */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex items-center p-1 bg-background/50 border border-border rounded-lg shadow-sm">
                        <button 
                            onClick={() => handlePower('start')}
                            disabled={status !== ServerStatus.OFFLINE || isJavaDownloading}
                            title={isJavaDownloading ? "Java is being downloaded. Please wait..." : "Start Server"}
                            className={`p-2 rounded-md transition-all duration-200 flex items-center gap-2 text-xs font-medium ${
                                status === ServerStatus.OFFLINE && !isJavaDownloading
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-inner' 
                                : 'text-muted-foreground opacity-50 cursor-not-allowed hover:bg-secondary'
                            }`}
                        >
                            <Power size={14} /> <span className="hidden sm:inline">Start</span>
                        </button>
                        <div className="w-[1px] h-4 bg-border mx-1"></div>
                        <button 
                            onClick={() => handlePower('restart')}
                            disabled={status === ServerStatus.OFFLINE || status === ServerStatus.STARTING}
                            className={`p-2 rounded-md transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed`}
                            title={status === ServerStatus.STARTING ? "Startup Lock Active" : "Restart Server"}
                        >
                            <RotateCcw size={14} />
                        </button>
                        <div className="w-[1px] h-4 bg-border mx-1"></div>
                        <button 
                            onClick={() => handlePower('stop')}
                            disabled={status === ServerStatus.OFFLINE || status === ServerStatus.STARTING}
                            className={`p-2 rounded-md transition-all duration-200 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed`}
                            title={status === ServerStatus.STARTING ? "Startup Lock Active" : "Kill Process"}
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
                        >
                            {isPaused ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                        <button 
                            onClick={() => setLogs([])}
                            className="p-2 rounded-md border border-transparent hover:border-border text-muted-foreground hover:bg-secondary hover:text-destructive transition-colors"
                            title="Clear Console"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Log Output Area */}
            <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 font-mono space-y-0.5 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent bg-[#09090b] relative"
                style={{ 
                    fontSize: `${user?.preferences?.terminal?.fontSize || 14}px`,
                    fontFamily: user?.preferences?.terminal?.fontFamily === 'monospace' ? "'JetBrains Mono', monospace" : 'sans-serif'
                }}
            >
                {/* Scroll Notification */}
                {userHasScrolledUp && !isPaused && (
                    <button 
                        onClick={scrollToBottom}
                        className={`sticky top-2 left-1/2 -translate-x-1/2 text-white px-3 py-1.5 rounded-full shadow-xl text-xs font-bold flex items-center gap-2 z-20 animate-in slide-in-from-top-2 transition-colors ${theme.bg}`}
                    >
                        <ArrowDown size={12} /> New Logs Received
                    </button>
                )}

                {visibleLogs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30 select-none">
                        <TerminalIcon size={48} className="mb-4 opacity-20" />
                        <p className="text-sm">Server is offline or log buffer is empty.</p>
                        <p className="text-xs mt-1">Press 'Start' to initialize boot sequence.</p>
                    </div>
                )}
                
                {visibleLogs.map((log) => (
                    <div key={log.id} className="flex gap-3 leading-6 hover:bg-white/5 -mx-4 px-4 transition-colors">
                        <span className="text-muted-foreground/30 select-none w-[70px] shrink-0 pt-0.5 font-mono" style={{ fontSize: '0.9em' }}>{log.timestamp}</span>
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
                            log.message.startsWith('>') ? 'text-white font-semibold' : 'text-zinc-400'
                        }`}>
                            {log.message}
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
                <form onSubmit={handleSend} className="flex gap-2 items-center bg-[#09090b] border border-border rounded-lg px-3 py-2.5 focus-within:ring-1 focus-within:ring-primary/50 focus-within:border-primary/50 transition-all shadow-inner">
                    <span className={`font-bold font-mono animate-pulse ${theme.text}`}>{'>'}</span>
                    <input
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder={status === ServerStatus.ONLINE ? "Type a command..." : "Server is offline."}
                        disabled={status === ServerStatus.OFFLINE}
                        className="flex-1 bg-transparent border-none text-sm font-mono text-zinc-100 focus:outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed"
                    />
                    <button 
                        type="submit"
                        disabled={!command.trim() || status === ServerStatus.OFFLINE} 
                        className={`p-1.5 bg-primary/10 text-primary rounded hover:bg-primary/20 disabled:opacity-0 transition-all ${theme.text}`}
                    >
                        <ArrowRight size={14} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Console;
