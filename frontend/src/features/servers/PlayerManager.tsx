import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Player, ServerStatus } from '@shared/types';
import { Shield, Ban, Trash2, UserPlus, UserCheck, Gavel, Crown, Search, Eye, EyeOff, Globe, RotateCw, Loader2, Users, Copy, Check, History as ActivityHistory } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { API } from '@core/services/api';
import { socketService } from '@core/services/socket';
import { useServers } from '@features/servers/context/ServerContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { useSystem } from '@features/system/context/SystemContext';
import ActivityTimeline from './ActivityTimeline';
import PlayerManagerPro from './PlayerManagerPro';

interface PlayerManagerProps {
    serverId: string;
}

type ListType = 'ONLINE' | 'ALL' | 'WHITELIST' | 'OPS' | 'BANNED' | 'IP_BANNED' | 'ACTIVITY';

const PlayerManager: React.FC<PlayerManagerProps> = ({ serverId }) => {
    const { settings } = useSystem();
    const isPro = settings.app.professionalMode;
    const { addToast } = useToast();
    const { can } = usePermissions();
    const { players: globalPlayers, refreshServerData, loading: contextLoading } = useServers();
    
    const id = serverId;
    const [activeList, setActiveList] = useState<ListType>('ONLINE');
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    const canManage = can('server.players.manage', serverId);
    const onlinePlayers = globalPlayers[id] || [];

    const fetchPlayers = useCallback(async () => {
        if (!id) return;
        
        if (activeList === 'ONLINE') {
            await refreshServerData(id);
            return;
        }

        if (activeList === 'ACTIVITY') return;
        
        setLoading(true);
        try {
            const apiType = activeList === 'ALL' ? 'all' :
                          activeList === 'WHITELIST' ? 'whitelist' : 
                          activeList === 'OPS' ? 'ops' :
                          activeList === 'BANNED' ? 'banned-players' : 'banned-ips';

            const data = await API.getPlayers(id, apiType);
            
            const normalized: Player[] = data.map((p: any) => ({
                name: p.name || (p.ip ? 'Unknown' : 'Unknown'),
                uuid: p.uuid || p.ip || 'unknown',
                skinUrl: p.skinUrl || (p.name ? `https://mc-heads.net/avatar/${p.name}/64` : ''),
                isOp: p.level ? p.level >= 4 : p.isOp,
                ping: p.ping,
                ip: p.ip,
                online: p.online === true,
                lastSeen: p.lastSeen,
                isIp: activeList === 'IP_BANNED',
                banReason: p.reason || p.banReason,
                banCreated: p.created || p.banCreated,
                banExpires: p.expires || p.banExpires,
            }));

            setPlayers(normalized);
        } catch (e) {
            addToast('error', 'Fetch Failed', 'Could not load player list.');
        } finally {
            setLoading(false);
        }
    }, [id, activeList, addToast, refreshServerData]);

    useEffect(() => {
        fetchPlayers();
    }, [fetchPlayers, id, activeList]);

    useEffect(() => {
        if (!id) return;
        
        const handleJoin = (data: { serverId: string, name: string }) => {
            if (data.serverId === id) {
                addToast('info', 'Player Join', `${data.name} joined the game`);
                activeList === 'ONLINE' ? refreshServerData(id) : fetchPlayers();
            }
        };
        
        const handleLeave = (data: { serverId: string, name: string }) => {
            if (data.serverId === id) {
                addToast('info', 'Player Leave', `${data.name} left the game`);
                activeList === 'ONLINE' ? refreshServerData(id) : fetchPlayers();
            }
        };

        const unsubJoin = socketService.onPlayerJoin(handleJoin);
        const unsubLeave = socketService.onPlayerLeave(handleLeave);
        
        return () => { unsubJoin(); unsubLeave(); };
    }, [id, activeList, refreshServerData, fetchPlayers, addToast]);

    const handleAction = async (player: Player, action: 'KICK' | 'BAN' | 'OP' | 'DEOP' | 'UNBAN' | 'UNWHITELIST' | 'BAN_IP') => {
        if (!id || !canManage) {
            addToast('error', 'Access Denied', 'Insufficient permissions.');
            return;
        }

        try {
            switch (action) {
                case 'KICK':
                    await API.kickPlayer(id, player.name, 'Kicked by operator');
                    addToast('success', 'Kicked', `Kicked ${player.name}`);
                    break;
                case 'BAN':
                    await API.addPlayer(id, 'banned-players', player.name);
                    addToast('success', 'Banned', `Banned ${player.name}`);
                    break;
                case 'OP':
                    await API.addPlayer(id, 'ops', player.name);
                    addToast('success', 'Promoted', `${player.name} is now an operator`);
                    break;
                case 'DEOP':
                    await API.removePlayer(id, 'ops', player.name);
                    addToast('success', 'Demoted', `${player.name} is no longer an operator`);
                    break;
                case 'UNBAN':
                    await API.removePlayer(id, 'banned-players', player.name);
                    addToast('success', 'Unbanned', `Unbanned ${player.name}`);
                    break;
                case 'UNWHITELIST':
                    await API.removePlayer(id, 'whitelist', player.name);
                    addToast('success', 'Removed', `Removed ${player.name} from whitelist`);
                    break;
            }
            fetchPlayers();
        } catch (e: any) {
            addToast('error', 'Action Failed', e.message);
        }
    };

    if (isPro) {
        return <PlayerManagerPro serverId={serverId} />;
    }

    const displayedPlayers = activeList === 'ONLINE' ? onlinePlayers : players;
    const isLoading = activeList === 'ONLINE' ? contextLoading : (loading || contextLoading);
    const filtered = displayedPlayers.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex bg-muted/20 border border-border/40 p-1 rounded-lg backdrop-blur-md">
                    {(['ONLINE', 'ALL', 'WHITELIST', 'OPS', 'BANNED', 'ACTIVITY'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveList(tab)}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                                activeList === tab 
                                ? 'bg-card shadow-sm text-foreground border border-border/60' 
                                : 'text-muted-foreground hover:text-foreground/70'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
                <div className="relative group/search w-full md:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within/search:text-primary transition-colors" size={14} />
                    <input 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Live Filter Players..."
                        className="pl-9 pr-4 py-2 bg-muted/20 border border-border/60 rounded-lg text-[11px] font-bold w-full md:w-64 focus:ring-1 focus:ring-primary/40 focus:border-primary/60 outline-none transition-all placeholder:text-muted-foreground/30 placeholder:uppercase"
                    />
                </div>
            </div>

            {activeList === 'ACTIVITY' ? (
                <ActivityTimeline serverId={serverId} />
            ) : (
                <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-muted/30 border-b border-border/40">
                            <tr>
                                <th className="px-6 py-4 text-[9px] font-black text-muted-foreground uppercase tracking-wider">Entity Identifier</th>
                                <th className="px-6 py-4 text-[9px] font-black text-muted-foreground uppercase tracking-wider">Diagnostic Status</th>
                                <th className="px-6 py-4 text-[9px] font-black text-muted-foreground uppercase tracking-wider text-right">Administrative Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {isLoading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-10 w-48 bg-muted rounded" /></td>
                                        <td className="px-6 py-4"><div className="h-6 w-20 bg-muted rounded" /></td>
                                        <td className="px-6 py-4 text-right"><div className="h-8 w-24 bg-muted rounded ml-auto" /></td>
                                    </tr>
                                ))
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground italic">No players found match your criteria.</td>
                                </tr>
                            ) : filtered.map(player => (
                                <tr key={player.uuid} className="group hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <img src={player.skinUrl} alt={player.name} className="w-10 h-10 rounded-lg bg-muted border border-border/40 object-cover shadow-sm" />
                                                {player.online && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-card rounded-full" />}
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-black text-foreground/90 uppercase tracking-tight">{player.name}</p>
                                                <p className="text-[9px] text-muted-foreground/40 font-mono tracking-tighter uppercase tabular-nums">UUID: {player.uuid.slice(0, 18)}...</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${
                                                player.online 
                                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                                                : player.banReason ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-muted/40 border-border/40 text-muted-foreground'
                                            }`}>
                                                {player.online ? 'Online' : player.banReason ? 'Banned' : 'Offline'}
                                            </span>
                                            {player.isOp && (
                                                <span className="px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase tracking-widest">
                                                    Operator
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1.5 opacity-30 group-hover:opacity-100 transition-opacity">
                                            {canManage && (
                                                <>
                                                    <button 
                                                        onClick={() => handleAction(player, 'KICK')} 
                                                        className="p-1.5 hover:bg-amber-500/10 hover:text-amber-500 text-muted-foreground transition-all rounded"
                                                        title="Force Disconnect"
                                                    >
                                                        <Gavel size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleAction(player, 'BAN')} 
                                                        className="p-1.5 hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground transition-all rounded"
                                                        title="Terminal Termination"
                                                    >
                                                        <Ban size={14} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default PlayerManager;
