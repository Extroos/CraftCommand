import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    UserPlus, 
    UserMinus, 
    Skull, 
    Trophy, 
    Terminal, 
    Zap, 
    History,
    Search,
    Clock,
    User,
    Loader2
} from 'lucide-react';
import { API } from '@core/services/api';
import { socketService } from '@core/services/socket';
import { useToast } from '../ui/Toast';

interface ActivityEntry {
    id: string;
    type: 'join' | 'leave' | 'death' | 'achievement' | 'command' | 'teleport';
    player: string;
    message: string;
    timestamp: string;
    metadata?: any;
}

interface ActivityTimelineProps {
    serverId: string;
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ serverId }) => {
    const [activities, setActivities] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const { addToast } = useToast();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const data = await API.getActivityHistory(serverId);
                setActivities(data);
            } catch (err) {
                console.error('Failed to fetch activity history:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();

        const unsub = socketService.onPlayerActivity((data) => {
            if (data.serverId === serverId) {
                setActivities(prev => {
                    const exists = prev.some(a => a.id === data.activity.id);
                    if (exists) return prev;
                    return [data.activity, ...prev].slice(0, 100);
                });
            }
        });

        return () => {
            unsub();
        };
    }, [serverId]);

    const getIcon = (type: string) => {
        switch (type) {
            case 'join': return <UserPlus size={12} className="text-emerald-500" />;
            case 'leave': return <UserMinus size={12} className="text-rose-500" />;
            case 'death': return <Skull size={12} className="text-zinc-400" />;
            case 'achievement': return <Trophy size={12} className="text-amber-500" />;
            case 'command': return <Terminal size={12} className="text-blue-400" />;
            case 'teleport': return <Zap size={12} className="text-purple-400" />;
            default: return <History size={12} />;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'join': return 'bg-emerald-500/5 border-emerald-500/20';
            case 'leave': return 'bg-rose-500/5 border-rose-500/20';
            case 'death': return 'bg-zinc-500/5 border-zinc-500/20';
            case 'achievement': return 'bg-amber-500/5 border-amber-500/20';
            case 'command': return 'bg-blue-500/5 border-blue-500/20';
            case 'teleport': return 'bg-purple-500/5 border-purple-500/20';
            default: return 'bg-muted/30 border-border/40';
        }
    };

    const formatTime = (iso: string) => {
        const date = new Date(iso);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    };

    const filteredActivities = activities.filter(a => 
        a.player.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.message.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-card rounded-xl border border-border/60 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="p-4 border-b border-border/60 bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary border border-primary/20">
                        <History size={16} />
                    </div>
                    <div>
                        <h3 className="font-black text-[11px] uppercase tracking-[0.15em] text-foreground/90">Temporal Activity Log</h3>
                        <p className="text-[9px] text-muted-foreground/40 uppercase font-black tracking-widest mt-0.5">Live Data Injection Active</p>
                    </div>
                </div>

                <div className="relative group/search">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/30 group-focus-within/search:text-primary transition-colors h-3.5 w-3.5" />
                    <input 
                        type="text" 
                        placeholder="Live Trace..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-muted/10 border border-border/60 rounded pl-8 pr-3 py-1.5 text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-primary/40 w-48 transition-all focus:w-64 placeholder:text-muted-foreground/20 placeholder:uppercase"
                    />
                </div>
            </div>

            {/* Timeline Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 relative" ref={scrollRef}>
                {loading ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-3">
                        <Loader2 className="animate-spin" size={24} />
                        <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-50">Calibrating History...</span>
                    </div>
                ) : filteredActivities.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground/10 select-none">
                        <History size={64} className="mb-4" />
                        <p className="text-[11px] font-black uppercase tracking-widest">Temporal Void Detected</p>
                        <p className="text-[9px] mt-1 font-medium uppercase italic">Awaiting external interactions...</p>
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        {filteredActivities.map((event, i) => (
                            <motion.div
                                key={event.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex items-start gap-4 p-2.5 rounded border transition-all ${getTypeColor(event.type)} group hover:border-primary/20`}
                            >
                                {/* Event Icon & Avatar */}
                                <div className="relative shrink-0">
                                    <img 
                                        src={`https://mc-heads.net/avatar/${encodeURIComponent(event.player)}/32`} 
                                        alt={event.player} 
                                        className="w-8 h-8 rounded bg-card border border-border/40 shadow-inner"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/steve/32';
                                        }}
                                    />
                                    <div className="absolute -bottom-1 -right-1 p-0.5 bg-card rounded shadow-sm border border-border/60">
                                        {getIcon(event.type)}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-[11px] text-foreground/90 uppercase tracking-tight">{event.player}</span>
                                            <span className="px-1.5 py-0.5 rounded bg-foreground/5 text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest border border-foreground/5">
                                                {event.type}
                                            </span>
                                        </div>
                                        <span className="text-[9px] font-mono text-muted-foreground/40 tabular-nums uppercase opacity-60 group-hover:opacity-100">
                                            [{formatTime(event.timestamp)}]
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-relaxed font-medium">
                                        {event.message}
                                    </p>
                                    
                                    {/* Metadata (Commands/Achievements) */}
                                    {event.metadata && (
                                        <div className="mt-2 text-[9px] bg-black/5 p-1.5 rounded font-mono border border-border/40 text-muted-foreground/60 overflow-hidden text-ellipsis whitespace-nowrap">
                                            <code className="tabular-nums">
                                                {event.type === 'achievement' ? `RESULT_ID: [${event.metadata.achievement}]` : `CMD_EXEC: /${event.metadata.command}`}
                                            </code>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Monitoring Footer */}
            <div className="p-2.5 bg-muted/20 border-t border-border/60 flex items-center justify-center">
                 <div className="flex items-center gap-2 text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] italic">
                     <span className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                     Live Activity Scanner: Tracking Interface.01
                 </div>
            </div>
        </div>
    );
};

export default ActivityTimeline;
