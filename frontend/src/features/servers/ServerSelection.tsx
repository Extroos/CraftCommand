import React, { useEffect, useState, useMemo } from 'react';
import { getErrorHelp } from '@core/settings/ErrorHelpMap';
import { Plus, Server, Hash, Cpu, ArrowRight, HardDrive, LogOut, Trash2, AlertTriangle, Stethoscope, Zap, Loader2, FileInput, Network, Activity, Database, RotateCw, Copy, CheckCircle2, X, Users, Clock, Gauge, ChevronUp, ChevronDown, MemoryStick, MonitorDot, Search, LayoutGrid, LayoutList, Wifi, Coffee, Globe } from 'lucide-react';
import { ServerConfig, ServerStatus } from '@shared/types';

import { API } from '@core/services/api';
import { useToast } from '../ui/Toast';
import ImportServerModal from './ImportServerModal';

import { useNavigate } from 'react-router-dom';
import { DevWarningModal } from '../ui/DevWarningModal';

interface ServerSelectionProps {
    onSelectServer: (server: ServerConfig) => void;
    onCreateNew: () => void;
    onLogout: () => void;
}

import { useUser } from '@features/auth/context/UserContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, User as UserIcon, Shield, Users as UsersIcon } from 'lucide-react';
import { useServers } from '@features/servers/context/ServerContext';
import { useSystem } from '@features/system/context/SystemContext';
import { ProgressOverlay } from '../ui/ProgressOverlay';
import { useConfirm } from '../ui/hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';


const ServerSelection: React.FC<ServerSelectionProps> = ({ 
    onSelectServer, onCreateNew, onLogout
}) => {
    const navigate = useNavigate();
    const { servers, refreshServers, installProgress, stats, isLoading } = useServers();
    const { user } = useUser();
    const { nodes, settings, version, metadata } = useSystem();
    const [userDropdown, setUserDropdown] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [cloningServer, setCloningServer] = useState<ServerConfig | null>(null);
    const [newCloneName, setNewCloneName] = useState('');
    const [isCloning, setIsCloning] = useState(false);
    const [sortKey, setSortKey] = useState<string>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [showDevWarn, setShowDevWarn] = useState(false);
    const userRef = React.useRef<HTMLDivElement>(null);
    const { addToast } = useToast();
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();

    const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
    const { registerVisibleServers, addBackgroundTask, updateBackgroundTask, removeBackgroundTask } = useServers();

    // Report visible IDs to context (debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            registerVisibleServers(Array.from(visibleIds));
        }, 300);
        return () => clearTimeout(timer);
    }, [visibleIds, registerVisibleServers]);

    const isPro = !!settings?.app?.professionalMode;

    const formatUptime = (seconds: number) => {
        if (!seconds || seconds <= 0) return '\u2014';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const tpsColor = (tps: string) => {
        const val = parseFloat(tps);
        if (isNaN(val) || val <= 0) return 'text-muted-foreground/40';
        if (val >= 18) return 'text-emerald-500';
        if (val >= 15) return 'text-amber-500';
        return 'text-rose-500';
    };

    const handleSort = (key: string) => {
        if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };

    const sortedServers = useMemo(() => {
        if (!Array.isArray(servers)) return servers;
        let filtered = servers;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = servers.filter(s => s.name.toLowerCase().includes(q) || s.software?.toLowerCase().includes(q) || s.version?.includes(q) || String(s.port).includes(q));
        }
        if (!isPro) return filtered;
        return [...filtered].sort((a, b) => {
            let aVal: any, bVal: any;
            const aStat = stats[a.id], bStat = stats[b.id];
            switch (sortKey) {
                case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
                case 'status': aVal = a.status; bVal = b.status; break;
                case 'cpu': aVal = aStat?.cpu || 0; bVal = bStat?.cpu || 0; break;
                case 'memory': aVal = aStat?.memory || 0; bVal = bStat?.memory || 0; break;
                case 'tps': aVal = parseFloat(aStat?.tps || '0'); bVal = parseFloat(bStat?.tps || '0'); break;
                case 'players': aVal = aStat?.players || 0; bVal = bStat?.players || 0; break;
                default: aVal = a.name; bVal = b.name;
            }
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [servers, stats, sortKey, sortDir, isPro, searchQuery]);

    const handleClone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cloningServer || !newCloneName.trim()) return;
        const taskId = `clone-${cloningServer.id}-${Date.now()}`;
        setIsCloning(true);
        try {
            addBackgroundTask({
                id: taskId,
                name: `Clone: ${cloningServer.name}`,
                type: 'clone',
                serverId: cloningServer.id,
                status: 'running',
                progress: 0,
                message: `Cloning storage volumes for "${cloningServer.name}"...`
            });
            await API.cloneServer(cloningServer.id, newCloneName.trim());
            updateBackgroundTask(taskId, { name: `Clone: ${cloningServer.name}`, status: 'complete', progress: 100, message: 'Clone complete' });
            addToast('success', 'Clone', `Cloned to "${newCloneName.trim()}"`);
            setCloningServer(null);
            refreshServers();
        } catch (err: any) {
            removeBackgroundTask(taskId);
            addToast('error', 'Clone Failed', err?.message || 'Clone failed');
        } finally {
            setIsCloning(false);
        }
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userRef.current && !userRef.current.contains(event.target as Node)) {
                setUserDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        // Version-aware Dev Warning logic
        const lastWarnedVersion = localStorage.getItem('cc_last_warned_version');
        if (version && version !== '0.0.0' && lastWarnedVersion !== version) {
            setShowDevWarn(true);
        }
    }, [version]);

    const handleCloseDevWarn = () => {
        if (version && version !== '0.0.0') {
            localStorage.setItem('cc_last_warned_version', version);
        }
        setShowDevWarn(false);
    };

    useEffect(() => {
        // Redundant fetch removed to prevent initialization loops.
        // ServerContext handles the initial population upon login.
    }, []);

    const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation(); 
        const server = servers.find(s => s.id === id);
        if (server && (server.status === ServerStatus.ONLINE || server.status === ServerStatus.STARTING)) {
            addToast('warning', 'Safety Lock', `You cannot delete "${name}" while it is ${server.status}. Stop it first.`);
            return;
        }
        const isConfirmed = await requestConfirm({
            title: 'Delete Server',
            description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
            confirmText: 'Delete Server',
            cancelText: 'Cancel'
        });

        if (isConfirmed) {
            const taskId = `delete-${id}-${Date.now()}`;
            try {
                addBackgroundTask({
                    id: taskId,
                    name: `Purge: ${name}`,
                    type: 'delete',
                    serverId: id,
                    status: 'running',
                    progress: 0,
                    message: `Purging instance data for "${name}"...`
                });
                await API.deleteServer(id);
                updateBackgroundTask(taskId, { name: `Purge: ${name}`, status: 'complete', progress: 100, message: 'Purge complete' });
                addToast('success', 'Deleted', 'Server has been removed.');
                refreshServers();
            } catch (err: any) {
                removeBackgroundTask(taskId);
                const help = getErrorHelp(err.code);
                if (help) {
                    addToast('error', help.title, help.description);
                } else {
                    addToast('error', 'Delete Failed', err.message);
                }
            }
        }
    };

    const hasBg = useMemo(() => {
        const cached = localStorage.getItem('cc_backgrounds');
        if (!cached) return false;
        try {
            const parsed = JSON.parse(cached);
            return parsed.global || parsed.serverSelection;
        } catch (e) {
            return false;
        }
    }, []);

    const bgClass = hasBg ? 'bg-transparent-if-bg' : 'bg-background';

    return (
        <div className={`min-h-screen flex items-center justify-center p-6 relative overflow-y-auto ${bgClass} ${user?.preferences.visualQuality ? 'quality-animate-in' : ''}`}>
            {isLoading && servers.length === 0 && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/20 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 text-primary animate-spin" />
                        <span className="text-[10px] font-bold text-primary tracking-[0.3em] uppercase animate-pulse">Synchronizing Data...</span>
                    </div>
                </div>
            )}
            {/* Minimal Background Decoration */}
            <div className="hidden dark:block absolute top-0 left-0 w-full h-full bg-zinc-950/20 pointer-events-none"></div>
            
            <div className={`${isPro ? 'max-w-7xl' : 'max-w-4xl'} w-full relative z-10 transition-all`}>
                <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                    <div className="flex items-center gap-5">
                        <img src="/website-icon.png" className="w-20 h-20 object-contain drop-shadow-sm" alt="CraftCommand" />
                        <div className="space-y-1">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">CraftCommand</h1>
                            <div className="flex items-center gap-2">
                                <p className="text-muted-foreground text-sm">{isPro ? 'Operations Dashboard' : 'Select a deployment to interface with.'}</p>
                                {isPro && <span className="px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] bg-foreground/5 text-foreground/70 border border-border rounded-full">PRO</span>}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="relative" ref={userRef}>
                            <button 
                                onClick={() => setUserDropdown(!userDropdown)}
                                className="flex items-center gap-3 pl-2 pr-1 py-1 rounded-full hover:bg-secondary/50 transition-colors border border-transparent hover:border-border group"
                            >
                                <div className="hidden md:block text-right">
                                    <div className="text-xs font-bold text-foreground">{user?.username}</div>
                                    <div className="text-[10px] text-muted-foreground">{user?.role}</div>
                                </div>
                                <div className="h-10 w-10 rounded-full bg-secondary border border-border overflow-hidden relative">
                                    {user?.avatarUrl ? (
                                        <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
                                            <UserIcon size={20} />
                                        </div>
                                    )}
                                </div>
                            </button>

                            <AnimatePresence>
                                {userDropdown && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-md shadow-lg z-50 p-1"
                                    >
                                        <div className="p-2 border-b border-border/50 mb-1">
                                            <p className="text-xs font-semibold text-foreground truncate">{user?.email || 'Guest'}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">Signed in</p>
                                        </div>
                                        <button onClick={() => { navigate('/profile'); setUserDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"><UserIcon size={16} /> User Profile</button>
                                        {user?.role === 'OWNER' && (
                                            <button onClick={() => { navigate('/settings'); setUserDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"><Settings size={16} /> System Config</button>
                                        )}
                                        {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
                                            <>
                                                <button onClick={() => { navigate('/users'); setUserDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"><UsersIcon size={16} /> Manage Users</button>
                                                <button onClick={() => { navigate('/audit'); setUserDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"><Shield size={16} /> Audit Log</button>
                                            </>
                                        )}
                                        {(user?.role === 'OWNER' || user?.role === 'ADMIN') && settings?.app?.distributedNodes?.enabled && (
                                            <button onClick={() => { navigate('/operations'); setUserDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-primary hover:bg-primary/10 transition-colors mb-1"><Activity size={16} /> Global Operations</button>
                                        )}
                                        <div className="h-[1px] bg-border/50 my-1 mx-2"></div>
                                        <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors"><LogOut size={16} /> Sign Out</button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        
                        <div className="flex gap-2">
                            <button onClick={() => setShowImportModal(true)} className="bg-secondary border border-border text-foreground hover:bg-muted px-5 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all shadow-sm"><FileInput size={16} /> Import Server</button>
                            <button onClick={onCreateNew} className={`px-5 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${user?.preferences.visualQuality ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10 hover:opacity-90 active:scale-95' : 'bg-foreground text-background hover:bg-foreground/90 shadow-sm'}`}><Plus size={16} /> Deploy New Instance</button>
                        </div>
                    </div>
                </div>

                {/* ========== PRO VIEW ========== */}
                {isPro && Array.isArray(servers) && (() => {
                    const onlineServers = servers.filter(s => s.status === ServerStatus.ONLINE);
                    const offlineServers = servers.filter(s => s.status === ServerStatus.OFFLINE);
                    const crashedServers = servers.filter(s => s.status === ServerStatus.CRASHED);
                    
                    const statsServers = servers.filter(s => s.software !== 'Velocity');
                    const onlineStatsServers = statsServers.filter(s => s.status === ServerStatus.ONLINE || s.status === ServerStatus.STARTING);

                    const totalPlayers = statsServers.reduce((sum, s) => sum + (stats[s.id]?.players || 0), 0);
                    const avgCpu = onlineStatsServers.length > 0 ? onlineStatsServers.reduce((sum, s) => sum + (stats[s.id]?.cpu || 0), 0) / onlineStatsServers.length : 0;
                    const totalRam = statsServers.reduce((sum, s) => sum + (s.ram || 0), 0);
                    const usedRam = statsServers.reduce((sum, s) => sum + ((stats[s.id]?.memory || 0) / 1024), 0);
                    const avgTps = onlineStatsServers.length > 0 ? onlineStatsServers.reduce((sum, s) => sum + parseFloat(stats[s.id]?.tps || '0'), 0) / onlineStatsServers.length : 0;
                    const maxUptime = Object.values(stats).reduce((max, s) => Math.max(max, s?.uptime || 0), 0);

                    // ── Enhanced SVG Gauge with gradient, glow, and tick marks ──
                    // Uses a fixed 200x120 internal viewBox, scales gracefully using CSS width/height.
                    const GaugeWidget = ({ value, max, label, unit, color, gradientId, size = 160 }: { value: number, max: number, label: string, unit: string, color: string, gradientId: string, size?: number }) => {
                        const pct = Math.min(100, Math.max(0, (value / max) * 100));
                        const internalWidth = 200;
                        const internalHeight = 120;
                        const strokeW = 16;
                        const r = (internalWidth - strokeW * 2) / 2;
                        const circumference = Math.PI * r;
                        const offset = circumference - (pct / 100) * circumference;
                        const cx = internalWidth / 2;
                        const cy = internalHeight - 10;
                        const ticks = 11;
                        const tickMarks = [];
                        for (let i = 0; i <= ticks; i++) {
                            const angle = Math.PI + (Math.PI * i / ticks);
                            const x1 = cx + (r + strokeW / 2 + 5) * Math.cos(angle);
                            const y1 = cy + (r + strokeW / 2 + 5) * Math.sin(angle);
                            const x2 = cx + (r + strokeW / 2 + (i % 5 === 0 ? 13 : 8)) * Math.cos(angle);
                            const y2 = cy + (r + strokeW / 2 + (i % 5 === 0 ? 13 : 8)) * Math.sin(angle);
                            tickMarks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" className="text-foreground/[0.12]" strokeWidth={i % 5 === 0 ? 3 : 2} strokeLinecap="round" />);
                        }
                        const lighterColor = color + '90';
                        return (
                            <div className="flex flex-col items-center">
                                <svg width={size} height={size * (internalHeight / internalWidth)} viewBox={`0 0 ${internalWidth} ${internalHeight}`} className="overflow-visible">
                                    <defs>
                                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor={lighterColor} />
                                            <stop offset="100%" stopColor={color} />
                                        </linearGradient>
                                    </defs>
                                    {tickMarks}
                                    <path d={`M ${strokeW} ${cy} A ${r} ${r} 0 0 1 ${internalWidth - strokeW} ${cy}`} fill="none" stroke="currentColor" className="text-foreground/[0.07]" strokeWidth={strokeW} strokeLinecap="round" />
                                    <path d={`M ${strokeW} ${cy} A ${r} ${r} 0 0 1 ${internalWidth - strokeW} ${cy}`} fill="none" stroke={`url(#${gradientId})`} strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                                    <text x={cx} y={cy - 10} textAnchor="middle" className="fill-foreground font-bold font-mono" style={{ fontSize: 44 }}>{typeof value === 'number' ? (value % 1 === 0 ? value : value.toFixed(1)) : value}</text>
                                    <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground font-medium" style={{ fontSize: 16, letterSpacing: '0.05em' }}>{unit}</text>
                                </svg>
                                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mt-3">{label}</span>
                            </div>
                        );
                    };

                    // ── SVG Donut Chart for fleet composition ──
                    // Uses a fixed 120x120 viewBox, scales automatically
                    const DonutChart = ({ online, offline, crashed, size = 120 }: { online: number, offline: number, crashed: number, size?: number }) => {
                        const total = online + offline + crashed;
                        if (total === 0) return null;
                        const internalSize = 120;
                        const sw = 14;
                        const r = (internalSize - sw * 2) / 2;
                        const circumference = 2 * Math.PI * r;
                        const segments = [
                            { value: online, color: '#22c55e' },
                            { value: offline, color: '#71717a' },
                            { value: crashed, color: '#ef4444' },
                        ].filter(s => s.value > 0);
                        let accOffset = 0;
                        return (
                            <svg width={size} height={size} viewBox={`0 0 ${internalSize} ${internalSize}`} className="overflow-visible overflow-y-visible">
                                <defs>
                                    <filter id="donut-glow"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#22c55e" floodOpacity="0.35" /></filter>
                                </defs>
                                <circle cx={internalSize/2} cy={internalSize/2} r={r} fill="none" stroke="currentColor" className="text-foreground/[0.05]" strokeWidth={sw} />
                                {segments.map((seg, i) => {
                                    const segLen = (seg.value / total) * circumference;
                                    const gap = segments.length > 1 ? 4 : 0;
                                    const el = (
                                        <circle key={i} cx={internalSize/2} cy={internalSize/2} r={r} fill="none" stroke={seg.color} strokeWidth={sw} strokeLinecap="round"
                                            strokeDasharray={`${Math.max(0, segLen - gap)} ${circumference - Math.max(0, segLen - gap)}`}
                                            strokeDashoffset={-accOffset} transform={`rotate(-90 ${internalSize/2} ${internalSize/2})`}
                                            style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease' }}
                                        />
                                    );
                                    accOffset += segLen;
                                    return el;
                                })}
                                <text x={internalSize/2} y={internalSize/2 - 4} textAnchor="middle" className="fill-foreground" style={{ fontWeight: 800, fontSize: 26, fontFamily: 'ui-monospace, monospace' }}>{total}</text>
                                <text x={internalSize/2} y={internalSize/2 + 16} textAnchor="middle" className="fill-muted-foreground/70" style={{ fontWeight: 600, fontSize: 10, letterSpacing: '0.1em' }}>TOTAL</text>
                            </svg>
                        );
                    };

                    // ── SVG Horizontal Bar with gradient + glow ──
                    const RamBar = ({ used, total: tot, width = 100, height = 8 }: { used: number, total: number, width?: number, height?: number }) => {
                        const pct = tot > 0 ? Math.min(100, (used / tot) * 100) : 0;
                        const barColor = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#ffffff';
                        const barId = `ram-${Math.random().toString(36).slice(2, 6)}`;
                        return (
                            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="rounded-full overflow-visible">
                                <defs>
                                    <linearGradient id={`rg-${barId}`}><stop offset="0%" stopColor={barColor + '60'} /><stop offset="100%" stopColor={barColor} /></linearGradient>
                                </defs>
                                <rect x={0} y={0} width={width} height={height} rx={height/2} fill="currentColor" className="text-foreground/[0.06]" />
                                <rect x={0} y={0} width={Math.max(height, width * pct / 100)} height={height} rx={height/2} fill={`url(#rg-${barId})`} style={{ transition: 'width 0.6s ease' }} />
                            </svg>
                        );
                    };

                    // ── Enhanced Mini Ring with glow effect ──
                    const MiniRing = ({ value, max, color, size = 42 }: { value: number, max: number, color: string, size?: number }) => {
                        const pct = Math.min(100, Math.max(0, (value / max) * 100));
                        const sw = 3.5;
                        const r = (size - sw * 2) / 2;
                        const circumference = 2 * Math.PI * r;
                        const offset = circumference - (pct / 100) * circumference;
                        const glowId = `mg-${color.replace('#', '')}`;
                        return (
                            <svg width={size} height={size} className="transform -rotate-90">
                                <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" className="text-foreground/[0.07]" strokeWidth={sw} />
                                <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
                            </svg>
                        );
                    };

                    const cpuColor = avgCpu > 80 ? '#ef4444' : avgCpu > 50 ? '#f59e0b' : '#3b82f6';
                    const tpsColorVal = avgTps >= 18 ? '#22c55e' : avgTps >= 15 ? '#f59e0b' : avgTps > 0 ? '#ef4444' : '#555555';
                    const ramPct = totalRam > 0 ? (usedRam / totalRam) * 100 : 0;
                    const ramColor = ramPct > 80 ? '#ef4444' : ramPct > 50 ? '#f59e0b' : '#ffffff';

                    return (<>
                        {/* ── Dashboard Panels ── */}
                        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4 mb-5 items-stretch">
                            {/* Left: Live Performance Gauges */}
                            <div className={`rounded-xl border border-border/80 p-4 flex flex-col justify-between ${user?.preferences.visualQuality ? 'glass-morphism' : 'bg-card'}`}>
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Activity size={14} className="text-foreground/50" />
                                        <span className="text-[11px] font-bold text-foreground/70">Live Performance</span>
                                    </div>
                                    <div className="flex items-center justify-around gap-6 my-2">
                                        <GaugeWidget value={avgCpu} max={100} label="Avg CPU" unit="%" color={cpuColor} gradientId="gauge-cpu" size={130} />
                                        <GaugeWidget value={avgTps > 0 ? avgTps : 0} max={20} label="Avg TPS" unit={avgTps > 0 ? 'tick/s' : 'n/a'} color={tpsColorVal} gradientId="gauge-tps" size={130} />
                                        <GaugeWidget value={usedRam} max={totalRam || 1} label="Memory" unit="GB" color={ramColor} gradientId="gauge-ram" size={130} />
                                    </div>
                                </div>
                                {/* RAM allocation bar */}
                                <div className="mt-4 pt-3 border-t border-border/30">
                                    <div className="flex items-center justify-between mb-2.5">
                                        <span className="text-[11px] font-bold text-muted-foreground">RAM Allocation</span>
                                        <span className="text-[11px] font-bold text-foreground tabular-nums">{usedRam.toFixed(1)}G / {totalRam}G</span>
                                    </div>
                                    <RamBar used={usedRam} total={totalRam} width={600} height={10} />
                                </div>
                            </div>

                            {/* Right: Fleet Status with Donut */}
                            <div className={`rounded-xl border border-border/80 p-4 flex flex-col justify-between ${user?.preferences.visualQuality ? 'glass-morphism' : 'bg-card'}`}>
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <MonitorDot size={14} className="text-foreground/50" />
                                        <span className="text-[11px] font-bold text-foreground/70">Fleet Overview</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-8 mb-4">
                                        <DonutChart online={onlineServers.length} offline={offlineServers.length} crashed={crashedServers.length} size={100} />
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-4 justify-between">
                                                <div className="flex items-center gap-2.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Online</span></div>
                                                <span className="text-sm font-bold text-foreground tabular-nums">{onlineServers.length}</span>
                                            </div>
                                            <div className="flex items-center gap-4 justify-between">
                                                <div className="flex items-center gap-2.5"><div className="w-2.5 h-2.5 rounded-full bg-zinc-500/60" /><span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Offline</span></div>
                                                <span className="text-sm font-bold text-foreground tabular-nums">{offlineServers.length}</span>
                                            </div>
                                            {crashedServers.length > 0 && (
                                                <div className="flex items-center gap-4 justify-between">
                                                    <div className="flex items-center gap-2.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-500" /><span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Crashed</span></div>
                                                    <span className="text-sm font-bold text-rose-500 tabular-nums">{crashedServers.length}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2 pt-3 border-t border-border/30">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2"><Users size={12} className="text-muted-foreground/50" /><span className="text-[11px] text-muted-foreground font-medium">Players Connected</span></div>
                                        <span className="text-sm font-bold text-foreground tabular-nums">{totalPlayers}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2"><Clock size={12} className="text-muted-foreground/50" /><span className="text-[11px] text-muted-foreground font-medium">Longest Uptime</span></div>
                                        <span className="text-sm font-bold text-foreground font-mono">{formatUptime(maxUptime)}</span>
                                    </div>
                                </div>
                                {/* System Features */}
                                {(settings?.app?.dockerEnabled || settings?.app?.https?.enabled || settings?.app?.remoteAccess?.enabled || settings?.app?.hostMode || settings?.app?.automaticRepair || settings?.app?.storageProvider === 'sqlite' || settings?.app?.distributedNodes?.enabled) && (
                                    <div className="pt-3 border-t border-border/30">
                                        <div className="flex items-center gap-1.5 mb-2.5">
                                            <Zap size={11} className="text-foreground/50" />
                                            <span className="text-[11px] font-bold text-foreground/70">Infrastructure</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {settings?.app?.dockerEnabled && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                                    <Database size={9} /> Docker
                                                </span>
                                            )}
                                            {settings?.app?.https?.enabled && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                                    <Shield size={9} /> HTTPS
                                                </span>
                                            )}
                                            {settings?.app?.remoteAccess?.enabled && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                                    <Wifi size={9} /> {settings.app.remoteAccess.method?.toUpperCase() || 'REMOTE'}
                                                </span>
                                            )}
                                            {settings?.app?.hostMode && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                                    <Shield size={9} /> Host Mode
                                                </span>
                                            )}
                                            {settings?.app?.automaticRepair && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider bg-green-500/10 border border-green-500/20 text-green-400">
                                                    <Activity size={9} /> Automatic Repair
                                                </span>
                                            )}
                                            {settings?.app?.storageProvider === 'sqlite' && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider bg-orange-500/10 border border-orange-500/20 text-orange-400">
                                                    <Database size={9} /> SQLite
                                                </span>
                                            )}
                                            {settings?.app?.distributedNodes?.enabled && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider bg-violet-500/10 border border-violet-500/20 text-violet-400">
                                                    <Network size={9} /> Cluster
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Server Instances with Controls ── */}
                        <div className="space-y-2">
                            {/* Toolbar: Search + Sort + View Toggle */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-5">
                                {/* Sort Pills */}
                                <div className="flex items-center gap-1 flex-wrap order-2 sm:order-1">
                                    {[
                                        { key: 'name', label: 'Name' },
                                        { key: 'status', label: 'Status' },
                                        { key: 'cpu', label: 'CPU' },
                                        { key: 'memory', label: 'Mem' },
                                        { key: 'tps', label: 'TPS' },
                                        { key: 'players', label: 'Players' },
                                    ].map(s => (
                                        <button key={s.key} onClick={() => handleSort(s.key)}
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                                sortKey === s.key
                                                    ? 'bg-primary/10 border-primary/20 text-primary'
                                                    : 'bg-secondary/20 border-border/30 text-muted-foreground/60 hover:text-foreground hover:border-border/50'
                                            }`}
                                        >
                                            {s.label}
                                            {sortKey === s.key && (sortDir === 'asc' ? <ChevronUp size={10} className="inline ml-1 -mt-0.5" /> : <ChevronDown size={10} className="inline ml-1 -mt-0.5" />)}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-3 w-full sm:w-auto order-1 sm:order-2">
                                    {/* Expanding Search Bar (Pro) */}
                                    <motion.div 
                                        initial={false}
                                        animate={{ 
                                            width: searchQuery || (document.activeElement?.id === 'pro-search') ? 300 : 200,
                                            boxShadow: (document.activeElement?.id === 'pro-search') ? '0 0 0 2px hsl(var(--primary) / 0.1)' : '0 0 0 0px transparent'
                                        }}
                                        className={`relative flex-1 sm:flex-none rounded-xl border transition-all duration-300 ${
                                            (document.activeElement?.id === 'pro-search') ? 'border-primary/40 bg-secondary/40' : 'border-border/40 bg-secondary/20'
                                        }`}
                                    >
                                        <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                                            (document.activeElement?.id === 'pro-search') ? 'text-primary' : 'text-muted-foreground/40'
                                        }`} />
                                        <input
                                            id="pro-search"
                                            type="text" 
                                            value={searchQuery} 
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="Quick search..."
                                            className="w-full bg-transparent border-none pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 focus:ring-0 outline-none"
                                        />
                                    </motion.div>

                                    {/* View Toggle */}
                                    <div className="flex items-center gap-0.5 bg-secondary/20 rounded-xl border border-border/40 p-1">
                                        <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground border border-border/50' : 'text-muted-foreground/60 hover:text-foreground'}`}><LayoutList size={14} /></button>
                                        <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground border border-border/50' : 'text-muted-foreground/60 hover:text-foreground'}`}><LayoutGrid size={14} /></button>
                                    </div>
                                </div>
                            </div>

                            {/* Instance Count + Health */}
                            <div className="flex items-center justify-between px-1 mb-3">
                                <div className="flex items-center gap-2">
                                    <Server size={14} className="text-foreground/50" />
                                    <span className="text-xs font-bold text-foreground/70">Instances <span className="text-foreground/40 ml-1 tabular-nums font-mono">({sortedServers.length}{searchQuery ? ` / ${servers.length}` : ''})</span></span>
                                </div>
                                {onlineServers.length > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <Wifi size={10} className="text-emerald-500" />
                                        <span className="text-[10px] font-bold text-emerald-500/60">{onlineServers.length} live</span>
                                    </div>
                                )}
                            </div>

                            {/* Server Cards Container */}
                            {/* Virtualized Server Cards Container (v1.13.0) */}
                            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-2'}>
                            {sortedServers.length === 0 ? (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${viewMode === 'grid' ? 'col-span-2' : ''} rounded-md border border-dashed border-border/30 py-24 flex flex-col items-center gap-5 ${user?.preferences.visualQuality ? 'glass-morphism bg-secondary/5' : 'bg-card'}`}>
                                    <div className="w-16 h-16 rounded-full bg-secondary/30 border border-border/50 flex items-center justify-center">
                                        {searchQuery ? <Search className="text-foreground/20" size={28} /> : <Server className="text-foreground/20" size={28} strokeWidth={1.5} />}
                                    </div>
                                    <div className="text-center space-y-1">
                                        <h4 className="text-sm font-bold text-foreground/70">{searchQuery ? 'No instances found' : 'No instances deployed'}</h4>
                                        <p className="text-[11px] text-muted-foreground/40 font-medium max-w-[250px] mx-auto leading-relaxed">
                                            {searchQuery ? `We couldn't find any servers matching "${searchQuery}".` : "You don't have any servers running. Click the 'New Instance' button above to deploy."}
                                        </p>
                                    </div>
                                    {!searchQuery && (
                                        <button onClick={() => setShowImportModal(true)} className="mt-2 px-4 py-2 bg-foreground hover:bg-foreground/90 text-background rounded-lg text-xs font-bold transition-all flex items-center gap-2">
                                            <Plus size={14} /> Deploy Instance
                                        </button>
                                    )}
                                </motion.div>
                            ) : (
                                <>
                                    {sortedServers.map((server) => (
                                        <ServerCardWrapper 
                                            key={server.id}
                                            server={server}
                                            viewMode={viewMode}
                                            onSelect={onSelectServer}
                                            onVisibilityChange={(id, visible) => {
                                                setVisibleIds(prev => {
                                                    const next = new Set(prev);
                                                    if (visible) next.add(id);
                                                    else next.delete(id);
                                                    return next;
                                                });
                                            }}
                                            onDelete={handleDelete}
                                            onClone={(s) => { 
                                                setCloningServer(s); 
                                                setNewCloneName(`${s.name} (Clone)`); 
                                            }}
                                        />
                                    ))}
                                </>
                            )}
                            </div>
                        </div>
                    </>);
                })()}

                {/* ========== STANDARD VIEW ========== */}
                {!isPro && (
                <motion.div 
                    initial="hidden"
                    animate="visible"
                    variants={{
                        hidden: { opacity: 0 },
                        visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
                    }}
                    className="space-y-4"
                >
                    {/* Search Bar for Standard View */}
                    {Array.isArray(servers) && servers.length > 2 && (
                        <div className="flex justify-end mb-2">
                            <motion.div 
                                initial={false}
                                animate={{ 
                                    width: searchQuery || (document.activeElement?.id === 'std-search') ? 340 : 220,
                                    boxShadow: (document.activeElement?.id === 'std-search') ? '0 0 0 2px hsl(var(--primary) / 0.1)' : '0 0 0 0px transparent'
                                }}
                                className={`relative rounded-xl border transition-all duration-300 ${
                                    (document.activeElement?.id === 'std-search') ? 'border-primary/40 bg-secondary/40' : 'border-border/40 bg-secondary/20'
                                }`}
                            >
                                <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                                    (document.activeElement?.id === 'std-search') ? 'text-primary' : 'text-muted-foreground/40'
                                }`} />
                                <input
                                    id="std-search"
                                    type="text" 
                                    value={searchQuery} 
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search servers..."
                                    className="w-full bg-transparent border-none pl-9 pr-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/30 focus:ring-0 outline-none"
                                />
                            </motion.div>
                        </div>
                    )}

                    {(!Array.isArray(sortedServers) || sortedServers.length === 0) && (
                        <div className="w-full py-24 border border-dashed border-border/30 rounded-md flex flex-col items-center justify-center gap-6 select-none">
                            {searchQuery ? <Search className="text-foreground/10" size={48} strokeWidth={1.5} /> : <Server className="text-foreground/10" size={48} strokeWidth={1.5} />}
                            <p className="text-[13px] text-muted-foreground/50 font-medium tracking-tight">{searchQuery ? `No servers matching "${searchQuery}".` : 'No local instances found.'}</p>
                        </div>
                    )}

                    {Array.isArray(sortedServers) && sortedServers.length > 0 && sortedServers.map((server) => (
                        <ServerCardWrapper 
                            key={server.id}
                            server={server}
                            viewMode="list"
                            onSelect={onSelectServer}
                            onVisibilityChange={(id, visible) => {
                                setVisibleIds(prev => {
                                    const next = new Set(prev);
                                    if (visible) next.add(id);
                                    else next.delete(id);
                                    return next;
                                });
                            }}
                            onDelete={handleDelete}
                            onClone={(s) => { 
                                setCloningServer(s); 
                                setNewCloneName(`${s.name} (Clone)`); 
                            }}
                        />
                    ))}
                </motion.div>
                )}

                {/* Cloning Modal */}
                <AnimatePresence>
                    {cloningServer && (
                        <div className="fixed inset-0 bg-background/80 z-[60] flex items-center justify-center p-6 backdrop-blur-sm">
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card border border-border rounded-md shadow-xl w-full max-w-md overflow-hidden flex flex-col">
                                <form onSubmit={handleClone}>
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/20">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary"><Copy size={18} /></div>
                                            <h2 className="text-sm font-bold text-foreground">Clone Instance</h2>
                                        </div>
                                        <button type="button" onClick={() => setCloningServer(null)} className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"><X size={18} /></button>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 flex items-center gap-4">
                                            <div className="p-2 bg-amber-500/10 rounded text-amber-500"><AlertTriangle size={18} /></div>
                                            <div className="text-[11px] text-muted-foreground leading-relaxed">This will create a near-identical copy of <span className="text-foreground font-bold">{cloningServer.name}</span>, including all files, plugins, and configurations.</div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Namespace for New Clone</label>
                                            <input autoFocus type="text" value={newCloneName} onChange={e => setNewCloneName(e.target.value)} placeholder="Enter new server name..." className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-3 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none transition-all" />
                                        </div>
                                    </div>
                                    <div className="p-4 bg-secondary/10 border-t border-border flex gap-3">
                                        <button type="button" onClick={() => setCloningServer(null)} className="flex-1 py-2.5 text-xs font-bold text-muted-foreground hover:bg-secondary rounded-md transition-all">Cancel</button>
                                        <button type="submit" disabled={isCloning || !newCloneName.trim()} className="flex-[2] py-2.5 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2">
                                            {isCloning ? <Loader2 size={14} className="animate-spin" /> : <><CheckCircle2 size={14} /> Initialize Clone</>}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Import Server Modal */}
                {showImportModal && (
                    <ImportServerModal onClose={() => setShowImportModal(false)} onSuccess={() => refreshServers()} />
                )}
                
                <ConfirmDialog 
                    isOpen={isConfirmOpen}
                    {...confirmConfig}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />

                <DevWarningModal 
                    isOpen={showDevWarn} 
                    onClose={handleCloseDevWarn} 
                    visualQuality={user?.preferences.visualQuality} 
                    version={version}
                    metadata={metadata}
                />
            </div>
        </div>
    );
};

const ServerCardWrapper: React.FC<{
    server: ServerConfig;
    viewMode: 'list' | 'grid';
    onSelect: (s: ServerConfig) => void;
    onVisibilityChange: (id: string, visible: boolean) => void;
    onDelete: (e: React.MouseEvent, id: string, name: string) => void;
    onClone: (server: ServerConfig) => void;
}> = ({ server, viewMode, onSelect, onVisibilityChange, onDelete, onClone }) => {
    const { stats, installProgress, getUnifiedStatus } = useServers();
    const { nodes } = useSystem();
    const { user } = useUser();
    const cardRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            onVisibilityChange(server.id, entry.isIntersecting);
        }, { threshold: 0.1 });
        
        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [server.id, onVisibilityChange]);

    const stat = stats[server.id];
    const status = getUnifiedStatus(server);
    
    const isUnreachable = status === ServerStatus.NODE_UNREACHABLE;
    const isOnline = status === ServerStatus.ONLINE;
    const isTransitioning = (status === ServerStatus.STARTING || status === ServerStatus.STOPPING || status === ServerStatus.RESTARTING);
    const isInstalling = (!!installProgress[server.id] || status === ServerStatus.INSTALLING);
    const isCrashed = status === ServerStatus.CRASHED;
    const cpuVal = stat?.cpu || 0;
    const memPct = stat && server.ram ? (stat.memory / (server.ram * 1024)) * 100 : 0;
    const serverCpuColor = cpuVal > 80 ? '#ef4444' : cpuVal > 50 ? '#f59e0b' : '#3b82f6';
    const serverMemColor = memPct > 80 ? '#ef4444' : memPct > 50 ? '#f59e0b' : '#ffffff';
    const tpsVal = stat ? parseFloat(stat.tps) : 0;

    const formatUptime = (seconds: number) => {
        if (!seconds || seconds <= 0) return '—';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    return (
        <div 
            ref={cardRef}
            onClick={() => onSelect(server)}
            className={`group relative rounded-md border transition-all cursor-pointer overflow-hidden border-border/80 ${user?.preferences.visualQuality ? 'glass-morphism hover:border-primary/30 hover:scale-[1.005]' : 'bg-card hover:border-border-strong'}`}
        >

            <div className={`flex ${viewMode === 'grid' ? 'flex-col gap-3 p-4' : 'items-center gap-5 p-4'}`}>
                {/* Status icon */}
                <div className={`relative flex-shrink-0 ${viewMode === 'grid' ? 'mt-2' : ''}`}>
                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center border transition-all ${
                        isInstalling ? 'bg-foreground/5 border-foreground/10 text-foreground/40' :
                        isOnline ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                        isCrashed ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                        isTransitioning ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                        isUnreachable ? 'bg-rose-500/20 border-rose-500/40 text-rose-500 animate-pulse' :
                        'bg-secondary border-border text-muted-foreground/40'
                    }`}>
                        {isInstalling ? <Loader2 size={20} className="animate-spin" /> :
                         isUnreachable ? <Wifi size={20} className="opacity-50" /> :
                         isTransitioning ? <RotateCw size={20} className="animate-spin" /> :
                         <Server size={20} />}
                    </div>
                </div>

                {/* Server info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">{server.name}</h3>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase flex-shrink-0 ${server.software === 'Bedrock' ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20' : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'}`}>{server.software === 'Bedrock' ? 'Bedrock' : 'Java'}</span>
                        {server.executionEngine === 'docker' && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase flex-shrink-0 bg-blue-500/10 text-blue-400 border border-blue-500/20"><Database size={9} /> Docker</span>}
                        {server.executionEngine === 'remote' && server.nodeId && <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase flex-shrink-0 border ${isUnreachable ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-violet-500/10 text-violet-400 border-violet-500/20'}`}><Globe size={9} /> {nodes.find(n => n.id === server.nodeId)?.name || 'Remote'}</span>}
                        {isCrashed && <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded text-[8px] font-bold uppercase flex-shrink-0">Crashed</span>}
                        {isUnreachable && <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded text-[8px] font-bold uppercase flex-shrink-0 animate-pulse">Node Unreachable</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/40 font-mono">
                        {isInstalling ? (
                            <span className="text-foreground/40">{installProgress[server.id]?.message || 'Installing...'}</span>
                        ) : (
                            <>
                                <span>{server.software} {server.version}</span>
                                <span className="text-border">|</span>
                                <span>:{server.port}</span>
                                <span className="text-border">|</span>
                                <span>{server.ram}G RAM</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Mini Stats (v1.14.0) */}
                {isOnline && stat && (
                    <div className={viewMode === 'grid' ? "grid grid-cols-2 gap-3 w-full bg-secondary/10 p-3.5 rounded-md border border-border/40" : "hidden md:flex items-center gap-5 flex-shrink-0"}>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-foreground tabular-nums">{cpuVal.toFixed(1)}%</span>
                            <div className="text-[8px] text-muted-foreground/30 uppercase font-bold tracking-wider">CPU</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-foreground tabular-nums">{stat.memory > 1024 ? `${(stat.memory/1024).toFixed(1)}G` : `${Math.round(stat.memory)}M`}</span>
                            <div className="text-[8px] text-muted-foreground/30 uppercase font-bold tracking-wider">Mem</div>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[11px] font-bold text-foreground tabular-nums">{stat.players}</span>
                           <div className="text-[8px] text-muted-foreground/30 uppercase font-bold tracking-wider">Players</div>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className={`flex flex-shrink-0 items-center ${viewMode === 'grid' ? 'w-full gap-2 mt-2' : 'gap-1'}`}>
                    {/* Management Actions (Secondary) */}
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClone(server); }} 
                        className={`p-2 rounded-lg opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all text-foreground hover:bg-secondary ${viewMode === 'grid' ? 'bg-secondary/40 !opacity-100' : ''}`}
                        title="Clone Instance"
                    >
                        <Copy size={14} />
                    </button>
                    <button 
                        disabled={isOnline || server.status === ServerStatus.STARTING || isInstalling} 
                        onClick={(e) => onDelete(e, server.id, server.name)} 
                        className={`p-2 rounded-lg opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all ${(isOnline || server.status === ServerStatus.STARTING || isInstalling) ? 'text-foreground/15 cursor-not-allowed' : 'text-foreground hover:text-rose-500 hover:bg-rose-500/10'} ${viewMode === 'grid' ? 'bg-secondary/40 !opacity-100' : ''}`}
                        title="Delete Instance"
                    >
                        <Trash2 size={14} />
                    </button>
                    
                    {/* Main Action */}
                    <div className={`px-4 py-1.5 rounded-md bg-primary/10 border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground text-primary transition-all text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 ${viewMode === 'grid' ? 'flex-1 ml-auto' : 'ml-1'}`}>
                        Connect <ArrowRight size={12} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ServerSelection;
