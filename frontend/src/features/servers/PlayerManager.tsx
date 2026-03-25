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
            <div className="flex items-center justify-between">
                <div className="flex bg-muted p-1 rounded-lg">
                    {(['ONLINE', 'ALL', 'WHITELIST', 'OPS', 'BANNED', 'ACTIVITY'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveList(tab)}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeList === tab ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <input 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search players..."
                        className="pl-10 pr-4 py-2 bg-muted border-none rounded-lg text-sm w-64 focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
            </div>

            {activeList === 'ACTIVITY' ? (
                <ActivityTimeline serverId={serverId} />
            ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-muted/50 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            <tr>
                                <th className="px-6 py-4">Player</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
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
                                        <div className="flex items-center gap-3">
                                            <img src={player.skinUrl} alt={player.name} className="w-8 h-8 rounded bg-muted" />
                                            <div>
                                                <p className="font-bold">{player.name}</p>
                                                <p className="text-[10px] text-muted-foreground font-mono">{player.uuid.slice(0, 18)}...</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${player.online ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                                            {player.online ? 'ONLINE' : 'OFFLINE'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {canManage && (
                                                <>
                                                    <button onClick={() => handleAction(player, 'KICK')} className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded"><Gavel size={16} /></button>
                                                    <button onClick={() => handleAction(player, 'BAN')} className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded"><Ban size={16} /></button>
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
