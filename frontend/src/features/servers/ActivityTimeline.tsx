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
    User
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
            case 'join': return <UserPlus size={14} className="text-emerald-500" />;
            case 'leave': return <UserMinus size={14} className="text-rose-500" />;
            case 'death': return <Skull size={14} className="text-zinc-400" />;
            case 'achievement': return <Trophy size={14} className="text-amber-500" />;
            case 'command': return <Terminal size={14} className="text-blue-400" />;
            case 'teleport': return <Zap size={14} className="text-purple-400" />;
            default: return <History size={14} />;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'join': return 'bg-emerald-500/10 border-emerald-500/20';
            case 'leave': return 'bg-rose-500/10 border-rose-500/20';
            case 'death': return 'bg-zinc-500/10 border-zinc-500/20';
            case 'achievement': return 'bg-amber-500/10 border-amber-500/20';
            case 'command': return 'bg-blue-500/10 border-blue-500/20';
            case 'teleport': return 'bg-purple-500/10 border-purple-500/20';
            default: return 'bg-muted/50 border-border';
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
        <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header */}
            <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <History size={18} />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm uppercase tracking-wider">Live Activity Timeline</h3>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Real-time Session History</p>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 text-muted-foreground h-3.5 w-3.5" />
                    <input 
                        type="text" 
                        placeholder="Search timeline..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-background/50 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary w-48 transition-all focus:w-64"
                    />
                </div>
            </div>

            {/* Timeline Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 relative" ref={scrollRef}>
                {loading ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                        <Clock className="animate-spin text-primary/50" />
                        <span className="text-xs uppercase font-bold tracking-widest opacity-50">Synchronizing History...</span>
                    </div>
                ) : filteredActivities.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-30 select-none">
                        <History size={48} className="mb-4" />
                        <p className="text-sm font-medium">No activity recorded yet.</p>
                        <p className="text-xs mt-1 italic">Waiting for events from the server...</p>
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        {filteredActivities.map((event, i) => (
                            <motion.div
                                key={event.id}
                                initial={{ opacity: 0, x: -10, scale: 0.98 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${getTypeColor(event.type)} group`}
                            >
                                {/* Event Icon & Avatar */}
                                <div className="relative shrink-0">
                                    <img 
                                        src={`https://mc-heads.net/avatar/${encodeURIComponent(event.player)}/32`} 
                                        alt={event.player} 
                                        className="w-8 h-8 rounded bg-muted/50 border border-border/50"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/steve/32';
                                        }}
                                    />
                                    <div className="absolute -bottom-1 -right-1 p-1 bg-card rounded-md shadow-sm border border-border">
                                        {getIcon(event.type)}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-foreground">{event.player}</span>
                                            <span className="px-1.5 py-0.5 rounded bg-zinc-950/40 text-[9px] font-mono text-zinc-400 uppercase tracking-tighter border border-white/5">
                                                {event.type}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-mono text-muted-foreground tabular-nums opacity-60 group-hover:opacity-100">
                                            {formatTime(event.timestamp)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed break-words font-medium">
                                        {event.message}
                                    </p>
                                    
                                    {/* Metadata (Commands/Achievements) */}
                                    {event.metadata && (
                                        <div className="mt-2 text-[10px] bg-black/20 p-2 rounded font-mono border border-white/5 text-zinc-500 overflow-hidden text-ellipsis whitespace-nowrap">
                                            <code>
                                                {event.type === 'achievement' ? `Result: [${event.metadata.achievement}]` : `Exec: /${event.metadata.command}`}
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
            <div className="p-3 bg-muted/10 border-top border-border/50 flex items-center justify-center">
                 <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                     Live Activity Scanner Active
                 </div>
            </div>
        </div>
    );
};

export default ActivityTimeline;
