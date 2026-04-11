import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { getServerCapabilities } from '@shared/utils/CapabilityUtils';

import { 
    LayoutDashboard, TerminalSquare, BookOpenCheck, Command, ChevronLeft, 
    FolderOpen, Users, Package, ArchiveRestore, CalendarClock, Settings, 
    ChevronDown, Layers, ServerCog, LogOut, Webhook, User, Shield, Bell, Check, Trash2, X, Activity, Map as MapIcon,
    ExternalLink, Zap, Database, UserPlus, Menu
} from 'lucide-react';
import { TabView, UserProfile, ServerConfig } from '@shared/types';

import { motion, AnimatePresence } from 'framer-motion';
import { API } from '@core/services/api';

interface HeaderProps {
    activeTab: TabView;
    setActiveTab: (tab: TabView) => void;
    onBackToServerList: () => void;
    onLogout: () => void;
    onNavigateProfile: (section?: string) => void;
    onNavigateUsers?: () => void;
    onNavigateGlobalSettings?: () => void;
    onNavigateAuditLog?: () => void;
    onNavigateOperations?: () => void;
    currentServer: ServerConfig | null;
}

type NavItem = {
    id?: TabView;
    label: string;
    icon: React.ReactNode;
    type: 'link' | 'dropdown';
    children?: { id: TabView; label: string; icon: React.ReactNode }[];
};

import { useUser } from '@features/auth/context/UserContext';
import { useServers } from '@features/servers/context/ServerContext';
import { useNotifications } from '@features/system/context/NotificationContext';
import { useSystem } from '@features/system/context/SystemContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';

const formatDistanceToNow = (timestamp: number | string, options?: { addSuffix?: boolean }) => {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years" + (options?.addSuffix ? " ago" : "");
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months" + (options?.addSuffix ? " ago" : "");
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days" + (options?.addSuffix ? " ago" : "");
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours" + (options?.addSuffix ? " ago" : "");
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes" + (options?.addSuffix ? " ago" : "");
    
    return Math.floor(seconds) + " seconds" + (options?.addSuffix ? " ago" : "");
};

const Header: React.FC<HeaderProps> = ({ 
    activeTab, setActiveTab, onBackToServerList, onLogout, 
    onNavigateProfile, onNavigateUsers, onNavigateGlobalSettings, onNavigateAuditLog, onNavigateOperations,
    currentServer 
}) => {
    const { servers } = useServers();
    const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
    const { user } = useUser();
    const { hostMode, settings, isActivityTrayOpen, setActivityTrayOpen } = useSystem();
    const { backgroundTasks, installProgress } = useServers();
    const { can } = usePermissions();
    
    const syncServers = Array.isArray(servers) ? servers.filter(s => s.includeInTotal !== false) : [];
    const onlineCount = syncServers.filter(s => s.status === 'ONLINE').length;
    const totalCount = syncServers.length;
    const isStarting = syncServers.some(s => s.status === 'STARTING');

    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [userDropdown, setUserDropdown] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navRef = useRef<HTMLDivElement>(null);
    const userRef = useRef<HTMLDivElement>(null);
    const notificationRef = useRef<HTMLDivElement>(null);
    const drawerRef = useRef<HTMLDivElement>(null);
    const [notificationDropdown, setNotificationDropdown] = useState(false);

    // --- ROBUST CLICK HANDLING ---
    const handleClickOutside = useCallback((event: MouseEvent) => {
        const target = event.target as Node;

        // Dropdown Close Logic (Desktop & Mobile Unified)
        if (openDropdown) {
            const inNav = navRef.current?.contains(target);
            const inDrawer = drawerRef.current?.contains(target);
            if (!inNav && !inDrawer) {
                setOpenDropdown(null);
            }
        }

        // Contextual UI Closes
        if (notificationDropdown && !notificationRef.current?.contains(target)) {
            setNotificationDropdown(false);
        }
        if (userDropdown && !userRef.current?.contains(target)) {
            setUserDropdown(false);
        }
    }, [openDropdown, notificationDropdown, userDropdown]);

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [handleClickOutside]); 

    const capabilities = useMemo(() => 
        currentServer ? getServerCapabilities(currentServer.software) : null
    , [currentServer?.software]);

    const navigation: NavItem[] = useMemo(() => {
        if (!currentServer || !capabilities) return [];
        const isVelocity = currentServer.software === 'Velocity';
        const serverId = currentServer.id;

        const nav: NavItem[] = [
            { id: 'DASHBOARD', label: 'Overview', icon: <LayoutDashboard size={16} />, type: 'link' },
            ...(isVelocity && can('server.proxy.manage', serverId) ? [{ id: 'NETWORK', label: 'Proxy Network', icon: <Webhook size={16} />, type: 'link' }] as NavItem[] : []),
            ...(can('server.console.read', serverId) ? [{ id: 'CONSOLE', label: 'Terminal', icon: <TerminalSquare size={16} />, type: 'link' }] as NavItem[] : []),
            ...(can('server.files.read', serverId) ? [{ id: 'FILES', label: 'Files', icon: <FolderOpen size={16} />, type: 'link' }] as NavItem[] : []),
            {
                label: isVelocity ? 'Network' : 'Manage',
                icon: <Layers size={16} />,
                type: 'dropdown',
                children: [
                    ...(!isVelocity ? [
                        ...(can('server.players.manage', serverId) ? [{ id: 'PLAYERS', label: 'Players', icon: <Users size={16} /> }] : []),
                        ...(can('server.schedules.manage', serverId) ? [{ id: 'SCHEDULES', label: 'Schedules', icon: <CalendarClock size={16} /> }] : []),
                        ...(can('server.backups.manage', serverId) ? [{ id: 'BACKUPS', label: 'Backups', icon: <ArchiveRestore size={16} /> }] : []),
                        ...(can('server.settings', serverId) ? [
                             { id: 'DATABASES', label: 'Databases', icon: <Database size={16} /> }
                        ] : [])
                    ] : []),
                    ...(capabilities.supportsPlugins && !isVelocity && can('server.plugins.view', serverId) ? [{ id: 'PLUGINS', label: 'Plugins', icon: <Package size={16} /> }] : []),
                    ...(capabilities.supportsMap && can('server.map.view', serverId) ? [{ id: 'MAP', label: 'Server Map', icon: <MapIcon size={16} /> }] : []),
                    ...(can('server.integrations.manage', serverId) ? [{ id: 'INTEGRATIONS', label: 'Integrations', icon: <Webhook size={16} /> }] : []),
                    ...(can('server.settings', serverId) ? [{ id: 'ACCESS', label: 'Access Control', icon: <Shield size={16} /> }] : []),
                ] as { id: TabView; label: string; icon: React.ReactNode }[]
            },
            {
                label: 'System',
                icon: <ServerCog size={16} />,
                type: 'dropdown',
                children: [
                    ...(can('server.settings', serverId) ? [{ id: 'SETTINGS', label: 'Settings', icon: <Settings size={16} /> }] : []),
                    ...(can('server.console.read', serverId) ? [{ id: 'KNOWLEDGE_BASE', label: 'Setup Guide', icon: <BookOpenCheck size={16} /> }] : []),
                ] as { id: TabView; label: string; icon: React.ReactNode }[]
            }
        ];
        return nav.filter(item => item.type === 'link' || (item.children && item.children.length > 0));
    }, [currentServer, capabilities, can]);

    const handleNavClick = (item: NavItem) => {
        if (item.type === 'link' && item.id) {
            setActiveTab(item.id);
            setOpenDropdown(null);
            setIsMobileMenuOpen(false); // Stability: ensure mobile menu closes
        } else if (item.type === 'dropdown') {
            setOpenDropdown(openDropdown === item.label ? null : item.label);
        }
    };

    const handleChildClick = (id: TabView) => {
        setActiveTab(id);
        setOpenDropdown(null);
        setIsMobileMenuOpen(false); // Stability: ensure mobile menu closes
    };

    const isChildActive = (item: NavItem) => item.children?.some(child => child.id === activeTab);

    const getStatusUI = () => {
        if (isStarting) {
            return (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/5 rounded border border-amber-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                    <span className="text-[11px] text-amber-600 dark:text-amber-500 font-semibold">Initializing</span>
                </div>
            );
        }
        if (totalCount === 0) {
             return (
                <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded border border-border">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"></span>
                    <span className="text-[11px] text-muted-foreground font-semibold">Discovery mode</span>
                </div>
            );
        }
        if (onlineCount > 0) {
             return (
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/5 rounded border border-emerald-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-500 font-semibold">
                        {onlineCount}/{totalCount} systems active
                    </span>
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/5 rounded border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span className="text-[11px] text-rose-600 dark:text-rose-500 font-semibold">Systems offline</span>
            </div>
        );
    };

    return (
        <header className={`fixed top-0 left-0 w-full border-b border-border z-[999] shadow-sm transition-colors duration-500 !overflow-visible ${user?.preferences.visualQuality ? 'glass-morphism header-locked !bg-transparent' : 'bg-card'}`}>
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
                <div className="flex h-16 items-center justify-between gap-4">
                    
                    {/* Brand Area */}
                    <div className="flex items-center gap-3 shrink-0">
                        <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={onBackToServerList}
                            className="bg-secondary/50 border border-border hover:bg-secondary text-muted-foreground hover:text-foreground p-2 rounded-lg transition-colors mr-1"
                            title="Back to Server List"
                        >
                            <ChevronLeft size={20} />
                        </motion.button>
                        <div className="hidden sm:block">
                            <img src="/website-icon.png" alt="CraftCommand Logo" className="w-10 h-10 object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold tracking-tight text-foreground leading-none">CraftCommand</span>
                            {currentServer ? (
                                <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1.5 mt-1">
                                    <span className="text-[10px] text-primary font-mono font-medium tracking-tight bg-primary/10 px-2 py-0.5 rounded leading-none shrink-0 cursor-default">
                                        {currentServer.ip || '127.0.0.1'}:{currentServer.port}
                                    </span>
                                    <span className={`text-[10px] ${currentServer.software === 'Bedrock' ? 'bg-sky-500' : 'bg-primary'} text-white font-semibold px-2 py-0.5 rounded uppercase tracking-tight hidden xs:block`}>
                                        {currentServer.software === 'Bedrock' ? 'Bedrock' : 'Java'}
                                    </span>
                                </motion.div>
                            ) : (
                                <span className="text-[10px] text-primary font-semibold mt-1 flex items-center gap-1 opacity-60">
                                    {settings?.app?.professionalMode ? <><Zap size={10} className="fill-primary text-primary" /> Professional</> : <i>Standard Edition</i>}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Desktop Navigation */}
                    <AnimatePresence mode="wait">
                        {currentServer && (
                            <motion.nav 
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                ref={navRef} 
                                className="hidden md:flex flex-1 items-center justify-center gap-1 overflow-visible"
                            >
                                <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border">
                                    {navigation.map((item) => {
                                        const isActive = item.id === activeTab || isChildActive(item);
                                        return (
                                            <div key={item.label} className="relative">
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation(); // Stability: isolated event
                                                        handleNavClick(item);
                                                    }} 
                                                    className={`relative flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200 whitespace-nowrap z-10 ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                                >
                                                    {isActive && <motion.div layoutId="nav-pill" className="absolute inset-0 bg-background shadow-sm border border-border/80 rounded-md -z-10" transition={{ type: "spring", bounce: 0, duration: 0.3 }} />}
                                                    {item.icon}
                                                    <span className="hidden lg:block">{item.label}</span>
                                                    {item.type === 'dropdown' && <motion.div animate={{ rotate: openDropdown === item.label ? 180 : 0 }} className="hidden lg:block"><ChevronDown size={12} /></motion.div>}
                                                </button>
                                                <AnimatePresence>
                                                    {item.type === 'dropdown' && openDropdown === item.label && (
                                                        <motion.div 
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                                                            animate={{ opacity: 1, y: 0, scale: 1 }} 
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }} 
                                                            className="absolute top-full left-0 mt-2 w-52 bg-card border border-border rounded-lg shadow-xl z-50 p-1"
                                                        >
                                                            {item.children?.map(child => (
                                                                <button key={child.id} onClick={() => handleChildClick(child.id)} className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${activeTab === child.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
                                                                    {child.icon}{child.label}
                                                                </button>
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.nav>
                        )}
                    </AnimatePresence>

                    {/* Right Area (Notifications, Profile, Menu) */}
                    <div className="flex items-center gap-2 md:gap-4 shrink-0">
                        <div className="hidden lg:flex shrink-0">{getStatusUI()}</div>
                        
                        <button
                            onClick={() => onNavigateProfile('2FA')}
                            className={`px-2 py-1 rounded-md border hidden sm:flex items-center justify-center transition-colors ${user?.twoFactorEnabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground'}`}
                            title={user?.twoFactorEnabled ? '2FA Protected' : 'Security: Off'}
                        >
                            <Shield size={14} className={user?.twoFactorEnabled ? 'fill-emerald-500/20' : ''} />
                        </button>

                        <div className="h-4 w-[1px] bg-border/60 hidden sm:block"></div>

                        {/* Global Activity Tray Toggle */}
                        <div className="relative">
                            <button 
                                onClick={() => setActivityTrayOpen(!isActivityTrayOpen)}
                                className={`relative p-2 rounded-lg transition-all ${isActivityTrayOpen ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
                                title="Cluster Activity Monitor"
                            >
                                <Activity size={18} />
                                {(Object.keys(backgroundTasks).length > 0 || Object.keys(installProgress).length > 0) && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[9px] font-bold flex items-center justify-center ring-2 ring-background text-primary-foreground">
                                        {Object.keys(backgroundTasks).length + Object.keys(installProgress).length}
                                    </span>
                                )}
                            </button>
                        </div>

                        <div className="relative" ref={notificationRef}>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setNotificationDropdown(!notificationDropdown); }} 
                                className="relative p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                                <Bell size={18} />
                                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-background"></span>}
                            </button>
                            <AnimatePresence>
                                {notificationDropdown && (
                                    <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-80 md:w-96 bg-card border border-border rounded-lg shadow-2xl z-50 flex flex-col max-h-[80vh]">
                                        <div className="p-3 border-b border-border flex justify-between items-center bg-muted/30 rounded-t-lg">
                                            <h3 className="font-semibold text-sm">Notifications</h3>
                                            {unreadCount > 0 && <button onClick={() => markAllAsRead()} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"><Check size={12} /> Mark all read</button>}
                                        </div>
                                        <div className="overflow-y-auto flex-1 p-1">
                                            {notifications.length === 0 ? (
                                                <div className="py-8 text-center text-muted-foreground"><Bell className="mx-auto mb-2 opacity-20" size={32} /><p className="text-xs">No notifications</p></div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    {notifications.map(n => (
                                                        <div key={n.id} className={`relative group p-3 rounded-lg border transition-all duration-200 ${n.read ? 'bg-background border-transparent hover:bg-secondary/50' : 'bg-primary/5 border-primary/20 hover:bg-primary/10'}`}>
                                                            <div className="flex justify-between items-start gap-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-0.5">
                                                                        <h4 className={`text-sm font-medium truncate ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>{n.title}</h4>
                                                                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>}
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground break-words line-clamp-3">{n.message}</p>
                                                                    <p className="text-[10px] text-muted-foreground/60 mt-1.5 font-mono">{formatDistanceToNow(n.createdAt, { addSuffix: true })}</p>
                                                                    {n.link && n.actionLabel && (
                                                                        <button onClick={() => { if (n.link === '/settings/system' && onNavigateGlobalSettings) { onNavigateGlobalSettings(); setNotificationDropdown(false); } else if (!n.link.startsWith('/')) window.open(n.link, '_blank'); }} className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition-colors">
                                                                            {n.actionLabel}{n.link.startsWith('/') ? <Settings size={10} /> : <ExternalLink size={10} />}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {!n.read && <button onClick={() => markAsRead(n.id)} className="p-1 hover:bg-background rounded text-primary"><Check size={12} /></button>}
                                                                    {n.dismissible !== false && <button onClick={() => deleteNotification(n.id)} className="p-1 hover:bg-background rounded text-rose-500"><Trash2 size={12} /></button>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div className="hidden md:block relative" ref={userRef}>
                            <button onClick={(e) => { e.stopPropagation(); setUserDropdown(!userDropdown); }} className="flex items-center gap-3 pl-2 pr-1 py-1 rounded-full hover:bg-secondary/50 transition-colors border border-transparent hover:border-border group">
                                <div className="text-right"><div className="text-xs font-bold text-foreground">{user?.username}</div><div className="text-[10px] text-muted-foreground">{user?.role}</div></div>
                                <div className="relative">
                                    <div className="h-8 w-8 rounded-full bg-secondary border border-border overflow-hidden">
                                        {user?.avatarUrl ? <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary"><User size={16} /></div>}
                                    </div>
                                    {user?.twoFactorEnabled && (
                                        <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 border-2 border-background shadow-lg z-10">
                                            <Shield size={10} className="fill-current" />
                                        </div>
                                    )}
                                </div>
                            </button>
                            <AnimatePresence>{userDropdown && (
                                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-2xl z-[110] p-1">
                                    <div className="p-2 border-b border-border/50 mb-1"><p className="text-xs font-semibold text-foreground truncate">{user?.email || 'Guest'}</p><p className="text-[10px] text-muted-foreground mt-0.5">Signed in</p></div>
                                    <button onClick={() => { onNavigateProfile(); setUserDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"><User size={16} /> User Profile</button>
                                    {onNavigateGlobalSettings && can('system.settings.manage') && <button onClick={() => { onNavigateGlobalSettings(); setUserDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"><Settings size={16} /> System Config</button>}
                                    {onNavigateUsers && hostMode && can('users.manage') && <button onClick={() => { onNavigateUsers(); setUserDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"><Users size={16} /> Manage Users</button>}
                                    {onNavigateAuditLog && can('system.audit.view') && <button onClick={() => { onNavigateAuditLog(); setUserDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"><Shield size={16} /> Audit Log</button>}
                                    <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"><LogOut size={16} /> Sign Out</button>
                                </motion.div>
                            )}</AnimatePresence>
                        </div>

                        {/* Hamburger Menu (Mobile Only) */}
                        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors md:hidden">
                            <Menu size={24} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Navigation Drawer */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[200] md:hidden" />
                        <motion.div ref={drawerRef} initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed inset-y-0 right-0 w-[300px] bg-card border-l border-border z-[210] md:hidden flex flex-col shadow-2xl">
                            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
                                <div className="flex items-center gap-2">
                                    <img src="/website-icon.png" alt="Logo" className="w-6 h-6 object-contain" />
                                    <span className="text-sm font-semibold text-foreground">Navigation</span>
                                </div>
                                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-rose-500/10 hover:text-rose-500 rounded-lg transition-colors"><X size={20} /></button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                {currentServer && (
                                    <div className="space-y-2">
                                        <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2">Manage</p>
                                        <div className="space-y-1">
                                            {navigation.map(item => (
                                                <div key={item.label}>
                                                    <button onClick={() => handleNavClick(item)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${item.id === activeTab || isChildActive(item) ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:bg-secondary border border-transparent'}`}>
                                                        <div className="flex items-center gap-3">{item.icon}{item.label}</div>
                                                        {item.type === 'dropdown' && <motion.div animate={{ rotate: openDropdown === item.label ? 180 : 0 }}><ChevronDown size={14} /></motion.div>}
                                                    </button>
                                                    <AnimatePresence>
                                                        {item.type === 'dropdown' && openDropdown === item.label && (
                                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-6 mt-1 space-y-1">
                                                                {item.children?.map(child => (
                                                                    <button key={child.id} onClick={() => handleChildClick(child.id)} className={`w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-colors ${activeTab === child.id ? 'bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}>
                                                                        {child.icon}{child.label}
                                                                    </button>
                                                                ))}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2">Subsystems</p>
                                    <div className="px-2">{getStatusUI()}</div>
                                    <button onClick={() => { onNavigateProfile('2FA'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center justify-center px-4 py-2.5 rounded-lg border transition-all ${user?.twoFactorEnabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-muted/30 text-muted-foreground border-border'}`}>
                                        <Shield size={16} className={user?.twoFactorEnabled ? 'fill-emerald-500/20' : ''} />
                                        <ChevronLeft size={14} className="rotate-180 opacity-40 ml-auto" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-4 border-t border-border bg-muted/10 space-y-3">
                                <div className="flex items-center gap-3 px-2 mb-2">
                                    <div className="h-10 w-10 rounded-full bg-secondary border border-border overflow-hidden">
                                        {user?.avatarUrl ? <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-primary"><User size={20} /></div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-foreground truncate">{user?.username}</div>
                                        <div className="text-[10px] text-muted-foreground font-medium">{user?.role}</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => { onNavigateProfile(); setIsMobileMenuOpen(false); }} className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-secondary text-xs font-bold text-muted-foreground hover:text-foreground transition-all"><User size={14} /> Profile</button>
                                    <button onClick={() => { onLogout(); setIsMobileMenuOpen(false); }} className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-rose-50/10 text-xs font-bold text-rose-500 hover:bg-rose-500 hover:text-white transition-all"><LogOut size={14} /> Quit</button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </header>
    );
};

export default Header;
