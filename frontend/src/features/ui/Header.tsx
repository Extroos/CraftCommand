
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { getServerCapabilities } from '@shared/utils/CapabilityUtils';

import { 
    LayoutDashboard, TerminalSquare, BookOpenCheck, Command, ChevronLeft, 
    FolderOpen, Users, Package, ArchiveRestore, CalendarClock, Settings, 
    ChevronDown, Layers, ServerCog, LogOut, Webhook, User, Shield, Bell, Check, Trash2, X, Activity, Map as MapIcon,
    ExternalLink
} from 'lucide-react';
import { TabView, UserProfile, ServerConfig } from '@shared/types';

import { motion, AnimatePresence } from 'framer-motion';
import { API } from '@core/services/api';

interface HeaderProps {
    activeTab: TabView;
    setActiveTab: (tab: TabView) => void;
    onBackToServerList: () => void;
    onLogout: () => void;
    onNavigateProfile: () => void;
    onNavigateUsers?: () => void;
    onNavigateGlobalSettings?: () => void;
    onNavigateAuditLog?: () => void;
    onNavigateOperations?: () => void;
    currentServer: ServerConfig | null; // Added currentServer
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
    const { user, theme } = useUser();
    const { hostMode, settings } = useSystem();
    const { can } = usePermissions();
    
    // Derived Global Status
    const syncServers = Array.isArray(servers) ? servers.filter(s => s.includeInTotal !== false) : [];
    const onlineCount = syncServers.filter(s => s.status === 'ONLINE').length;
    const totalCount = syncServers.length;
    const isStarting = syncServers.some(s => s.status === 'STARTING');

    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [userDropdown, setUserDropdown] = useState(false);

    const navRef = useRef<HTMLDivElement>(null);
    const userRef = useRef<HTMLDivElement>(null);
    const notificationRef = useRef<HTMLDivElement>(null);
    const [notificationDropdown, setNotificationDropdown] = useState(false);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (navRef.current && !navRef.current.contains(event.target as Node)) {
                setOpenDropdown(null);
            }
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setNotificationDropdown(false);
            }
            if (userRef.current && !userRef.current.contains(event.target as Node)) {
                setUserDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []); 

    // Capabilities for dynamic UI gating
    const capabilities = useMemo(() => 
        currentServer ? getServerCapabilities(currentServer.software) : null
    , [currentServer?.software]);

    const navigation: NavItem[] = useMemo(() => {
        if (!currentServer || !capabilities) return [];

        const isVelocity = currentServer.software === 'Velocity';
        const serverId = currentServer.id;

        const nav: NavItem[] = [
            { 
                id: 'DASHBOARD', 
                label: 'Overview', 
                icon: <LayoutDashboard size={16} />, 
                type: 'link' 
            },
            ...(isVelocity && can('server.proxy.manage', serverId) ? [{ 
                id: 'NETWORK', 
                label: 'Proxy Network', 
                icon: <Webhook size={16} />, 
                type: 'link' 
            }] as NavItem[] : []),
            ...(can('server.console.read', serverId) ? [{ 
                id: 'CONSOLE', 
                label: 'Terminal', 
                icon: <TerminalSquare size={16} />, 
                type: 'link' 
            }] as NavItem[] : []),
            ...(can('server.files.read', serverId) ? [{ 
                id: 'FILES', 
                label: 'Files', 
                icon: <FolderOpen size={16} />, 
                type: 'link' 
            }] as NavItem[] : []),
            {
                label: isVelocity ? 'Network' : 'Manage',
                icon: <Layers size={16} />,
                type: 'dropdown',
                children: [
                    ...(!isVelocity ? [
                        ...(can('server.players.manage', serverId) ? [{ id: 'PLAYERS', label: 'Players', icon: <Users size={16} /> }] : []),
                        ...(can('server.schedules.manage', serverId) ? [{ id: 'SCHEDULES', label: 'Schedules', icon: <CalendarClock size={16} /> }] : []),
                        ...(can('server.backups.manage', serverId) ? [{ id: 'BACKUPS', label: 'Backups', icon: <ArchiveRestore size={16} /> }] : [])
                    ] : []),
                    ...(capabilities.supportsPlugins && !isVelocity && can('server.plugins.view', serverId) ? [{ id: 'PLUGINS', label: 'Plugins', icon: <Package size={16} /> }] : []),
                    ...(capabilities.supportsMap && can('server.map.view', serverId) ? [{ id: 'MAP', label: 'Server Map', icon: <MapIcon size={16} /> }] : []),
                    ...(can('server.integrations.manage', serverId) ? [{ id: 'INTEGRATIONS', label: 'Integrations', icon: <Webhook size={16} /> }] : []),
                    // Access Control requires high level server manage permission
                    ...(can('server.settings', serverId) ? [{ id: 'ACCESS', label: 'Access Control', icon: <Shield size={16} /> }] : []),
                ] as { id: TabView; label: string; icon: React.ReactNode }[]
            },
            {
                label: 'System',
                icon: <ServerCog size={16} />,
                type: 'dropdown',
                children: [
                    ...(can('server.settings', serverId) ? [{ id: 'SETTINGS', label: 'Settings', icon: <Settings size={16} /> }] : []),
                    ...(capabilities.supportsJava && !isVelocity && can('server.files.write', serverId) ? [{ id: 'ARCHITECT', label: 'Architect', icon: <BookOpenCheck size={16} /> }] : []),
                ] as { id: TabView; label: string; icon: React.ReactNode }[]
            }
        ];

        // Clean up empty dropdowns
        return nav.filter(item => item.type === 'link' || (item.children && item.children.length > 0));
    }, [currentServer, capabilities, can]);


    const handleNavClick = (item: NavItem) => {
        if (item.type === 'link' && item.id) {
            setActiveTab(item.id);
            setOpenDropdown(null);
        } else if (item.type === 'dropdown') {
            setOpenDropdown(openDropdown === item.label ? null : item.label);
        }
    };

    const handleChildClick = (id: TabView) => {
        setActiveTab(id);
        setOpenDropdown(null);
    };

    const isChildActive = (item: NavItem) => {
        return item.children?.some(child => child.id === activeTab);
    };

    const getStatusUI = () => {
        if (isStarting) {
            return (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-900/50">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold ml-2">Initializing</span>
                </div>
            );
        }
        
        if (totalCount === 0) {
             return (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-muted rounded border border-border">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30"></span>
                    <span className="text-[10px] text-muted-foreground font-bold ml-2">No Instances Detected</span>
                </div>
            );
        }

        if (onlineCount > 0) {
             return (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/20 rounded border border-emerald-200 dark:border-emerald-900/50">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold ml-2">
                        {onlineCount}/{totalCount} Systems Online
                    </span>
                </div>
            );
        }

        return (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-rose-50 dark:bg-rose-950/20 rounded border border-rose-200 dark:border-rose-900/50">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span className="text-[10px] text-rose-700 dark:text-rose-400 font-bold ml-2">Systems Offline</span>
            </div>
        );
    };

    return (
        <header className={`fixed top-0 left-0 w-full border-b border-border z-[100] ${user?.preferences.visualQuality ? 'glass-morphism !overflow-visible' : 'bg-card shadow-sm'} !rounded-none`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
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
                            <img src="/website-icon.png" alt="CraftCommand Logo" className="w-12 h-12 object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold tracking-tight text-foreground leading-none">CraftCommand</span>
                            {currentServer ? (
                                <motion.div 
                                    initial={{ opacity: 0, x: -5 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center gap-1.5 mt-1"
                                >
                                    <span className="text-[10px] text-primary font-mono font-bold tracking-tight bg-primary/10 px-1.5 py-0.5 rounded leading-none">
                                        {currentServer.ip || '127.0.0.1'}:{currentServer.port}
                                    </span>
                                    {currentServer.software === 'Bedrock' ? (
                                        <span className="text-[9px] bg-blue-500 text-white font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">Bedrock</span>
                                    ) : (
                                        <span className="text-[9px] bg-emerald-500 text-white font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">Java Edition</span>
                                    )}
                                </motion.div>
                            ) : (
                                <span className="text-[10px] text-muted-foreground font-medium tracking-tight mt-0.5 italic opacity-60">Enterprise Edition</span>
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
                                className="hidden md:flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border mx-4"
                            >
                                {navigation.map((item) => {
                                    const isActive = item.id === activeTab || isChildActive(item);
                                    return (
                                        <div key={item.label} className="relative">
                                            <button
                                                onClick={() => handleNavClick(item)}
                                                className={`
                                                    relative flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200 ease-in-out whitespace-nowrap z-10
                                                    ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}
                                                `}
                                            >
                                                {isActive && (
                                                    <motion.div
                                                        layoutId="nav-pill"
                                                        className="absolute inset-0 bg-background shadow-sm border border-border/80 rounded-md -z-10"
                                                        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                                                    />
                                                )}
                                                {item.icon}
                                                <span>{item.label}</span>
                                                {item.type === 'dropdown' && (
                                                    <motion.div
                                                        animate={{ rotate: openDropdown === item.label ? 180 : 0 }}
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        <ChevronDown size={12} />
                                                    </motion.div>
                                                )}
                                            </button>

                                            {/* Dropdown Menu */}
                                            <AnimatePresence>
                                                {item.type === 'dropdown' && openDropdown === item.label && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                        transition={{ duration: 0.15 }}
                                                        className="absolute top-full left-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-xl z-50 p-1"
                                                    >
                                                        {item.children?.map((child) => (
                                                            <button
                                                                key={child.id}
                                                                onClick={() => handleChildClick(child.id)}
                                                                className={`
                                                                    w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors
                                                                    ${activeTab === child.id 
                                                                        ? 'bg-primary/10 text-primary font-medium' 
                                                                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}
                                                                `}
                                                            >
                                                                {child.icon}
                                                                {child.label}
                                                            </button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </motion.nav>
                        )}
                    </AnimatePresence>

                    {/* Status Indicator & User Profile */}
                    <div className="flex items-center gap-4 shrink-0">
                        {getStatusUI()}
                        <div className="h-4 w-[1px] bg-border/60 hidden lg:block"></div>

                        {/* Notifications */}
                        <div className="relative" ref={notificationRef}>
                            <button
                                onClick={() => setNotificationDropdown(!notificationDropdown)}
                                className="relative p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Notifications"
                            >
                                <Bell size={18} />
                                {unreadCount > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-background"></span>
                                )}
                            </button>

                            <AnimatePresence>
                                {notificationDropdown && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute top-full right-0 mt-2 w-80 md:w-96 bg-card border border-border rounded-lg shadow-2xl z-50 flex flex-col max-h-[80vh]"
                                    >
                                        <div className="p-3 border-b border-border flex justify-between items-center bg-muted/30 rounded-t-lg">
                                            <h3 className="font-semibold text-sm">Notifications</h3>
                                            {unreadCount > 0 && (
                                                <button 
                                                    onClick={() => markAllAsRead()}
                                                    className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                                                >
                                                    <Check size={12} /> Mark all read
                                                </button>
                                            )}
                                        </div>
                                        
                                        <div className="overflow-y-auto flex-1 p-1">
                                            {notifications.length === 0 ? (
                                                <div className="py-8 text-center text-muted-foreground">
                                                    <Bell className="mx-auto mb-2 opacity-20" size={32} />
                                                    <p className="text-xs">No notifications</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    {notifications.map(notification => (
                                                        <div 
                                                            key={notification.id} 
                                                            className={`
                                                                relative group p-3 rounded-lg border transition-all duration-200
                                                                ${notification.read ? 'bg-background border-transparent hover:bg-secondary/50' : 'bg-primary/5 border-primary/20 hover:bg-primary/10'}
                                                            `}
                                                        >
                                                            <div className="flex justify-between items-start gap-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-0.5">
                                                                        <h4 className={`text-sm font-medium truncate ${notification.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                                                                            {notification.title}
                                                                        </h4>
                                                                        {!notification.read && (
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground break-words line-clamp-3">
                                                                        {notification.message}
                                                                    </p>
                                                                    <p className="text-[10px] text-muted-foreground/60 mt-1.5 font-mono">
                                                                        {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                                                                    </p>
                                                                    {notification.link && notification.actionLabel && (
                                                                        notification.link.startsWith('/') ? (
                                                                             <button 
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (notification.link === '/settings/system' && onNavigateGlobalSettings) {
                                                                                        onNavigateGlobalSettings();
                                                                                        setNotificationDropdown(false);
                                                                                    }
                                                                                }}
                                                                                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition-colors self-start"
                                                                            >
                                                                                {notification.actionLabel}
                                                                                <Settings size={10} />
                                                                            </button>
                                                                        ) : (
                                                                            <a 
                                                                                href={notification.link}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition-colors self-start"
                                                                            >
                                                                                {notification.actionLabel}
                                                                                <ExternalLink size={10} />
                                                                            </a>
                                                                        )
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {!notification.read && (
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); markAsRead(notification.id); }}
                                                                            className="p-1 hover:bg-background rounded text-primary"
                                                                            title="Mark as read"
                                                                        >
                                                                            <Check size={12} />
                                                                        </button>
                                                                    )}
                                                                    {notification.dismissible !== false && (
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                                                                            className="p-1 hover:bg-background rounded text-rose-500"
                                                                            title="Delete"
                                                                        >
                                                                            <Trash2 size={12} />
                                                                        </button>
                                                                    )}
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
                        
                        {/* Users Button (Admin Only & Host Mode ONLY) */}
                        {onNavigateUsers && hostMode && can('users.manage') && (
                             <button 
                                onClick={onNavigateUsers}
                                className="hidden lg:flex p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Manage Users"
                            >
                                <Users size={18} />
                            </button>
                        )}

                        {/* User Profile Dropdown */}
                        <div className="relative" ref={userRef}>
                            <button 
                                onClick={() => setUserDropdown(!userDropdown)}
                                className="flex items-center gap-3 pl-2 pr-1 py-1 rounded-full hover:bg-secondary/50 transition-colors border border-transparent hover:border-border group"
                            >
                                <div className="hidden md:block text-right">
                                    <div className="text-xs font-bold text-foreground">{user?.username}</div>
                                    <div className="text-[10px] text-muted-foreground">{user?.role}</div>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-secondary border border-border overflow-hidden relative">
                                    {user?.avatarUrl ? (
                                        <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
                                            <User size={16} />
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
                                        className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-2xl z-[110] p-1"
                                    >
                                        <div className="p-2 border-b border-border/50 mb-1">
                                            <p className="text-xs font-semibold text-foreground truncate">{user?.email || 'Guest'}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">Signed in</p>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                onNavigateProfile();
                                                setUserDropdown(false);
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"
                                        >
                                            <User size={16} /> User Profile
                                        </button>
                                        
                                        {/* Global Settings (Owner/Admin) */}
                                        {onNavigateGlobalSettings && can('system.settings.manage') && (
                                            <button 
                                                onClick={() => {
                                                    onNavigateGlobalSettings();
                                                    setUserDropdown(false);
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"
                                            >
                                                <Settings size={16} /> System Config
                                            </button>
                                        )}

                                        {/* Users Management (Owner/Admin & Host Mode ONLY) */}
                                        {onNavigateUsers && hostMode && can('users.manage') && (
                                            <button 
                                                onClick={() => {
                                                    onNavigateUsers();
                                                    setUserDropdown(false);
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"
                                            >
                                                <Users size={16} /> Manage Users
                                            </button>
                                        )}

                                        {/* Audit Log (Owner/Admin) */}
                                        {onNavigateAuditLog && can('system.audit.view') && (
                                            <button 
                                                onClick={() => {
                                                    onNavigateAuditLog();
                                                    setUserDropdown(false);
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"
                                            >
                                                <Shield size={16} /> Audit Log
                                            </button>
                                        )}

                                        {/* Global Operations (Monitoring) */}
                                        {onNavigateOperations && settings?.app?.distributedNodes?.enabled && can('system.nodes.manage') && (
                                            <button 
                                                onClick={() => {
                                                    onNavigateOperations();
                                                    setUserDropdown(false);
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"
                                            >
                                                <Activity size={16} /> Monitoring
                                            </button>
                                        )}

                                        <button 
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-1"
                                        >
                                            <Shield size={16} /> 2FA Security
                                        </button>
                                        <div className="h-[1px] bg-border/50 my-1 mx-2"></div>
                                        <button 
                                            onClick={onLogout}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                                        >
                                            <LogOut size={16} /> Sign Out
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
