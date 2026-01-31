
import React, { useState, useRef, useEffect } from 'react';
import { 
    LayoutDashboard, TerminalSquare, BookOpenCheck, Command, ChevronLeft, 
    FolderOpen, Users, Package, ArchiveRestore, CalendarClock, Settings, 
    ChevronDown, Layers, ServerCog, LogOut, Webhook, User, Shield 
} from 'lucide-react';
import { TabView, UserProfile, ServerConfig } from '@shared/types';

import { motion, AnimatePresence } from 'framer-motion';
import { API } from '../../services/api';

interface HeaderProps {
    activeTab: TabView;
    setActiveTab: (tab: TabView) => void;
    onBackToServerList: () => void;
    onLogout: () => void;
    onNavigateProfile: () => void;
    onNavigateUsers?: () => void;
    onNavigateGlobalSettings?: () => void;
    onNavigateAuditLog?: () => void;
    currentServer: ServerConfig | null; // Added currentServer
}

type NavItem = {
    id?: TabView;
    label: string;
    icon: React.ReactNode;
    type: 'link' | 'dropdown';
    children?: { id: TabView; label: string; icon: React.ReactNode }[];
};

import { useUser } from '../../context/UserContext';
import { useServers } from '../../context/ServerContext';

const Header: React.FC<HeaderProps> = ({ 
    activeTab, setActiveTab, onBackToServerList, onLogout, 
    onNavigateProfile, onNavigateUsers, onNavigateGlobalSettings, onNavigateAuditLog,
    currentServer 
}) => {
    const { servers } = useServers();
    const { user, theme } = useUser();
    
    // Derived Global Status
    const syncServers = servers.filter(s => s.includeInTotal !== false);
    const onlineCount = syncServers.filter(s => s.status === 'ONLINE').length;
    const totalCount = syncServers.length;
    const isStarting = syncServers.some(s => s.status === 'STARTING');

    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [userDropdown, setUserDropdown] = useState(false);

    const navRef = useRef<HTMLDivElement>(null);
    const userRef = useRef<HTMLDivElement>(null);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (navRef.current && !navRef.current.contains(event.target as Node)) {
                setOpenDropdown(null);
            }
            if (userRef.current && !userRef.current.contains(event.target as Node)) {
                setUserDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []); 

    // Filtered Navigation: Only show server-specific items if a server is selected
    const navigation: NavItem[] = currentServer ? [
        { 
            id: 'DASHBOARD', 
            label: 'Overview', 
            icon: <LayoutDashboard size={16} />, 
            type: 'link' 
        },
        { 
            id: 'CONSOLE', 
            label: 'Terminal', 
            icon: <TerminalSquare size={16} />, 
            type: 'link' 
        },
        { 
            id: 'FILES', 
            label: 'Files', 
            icon: <FolderOpen size={16} />, 
            type: 'link' 
        },
        {
            label: 'Manage',
            icon: <Layers size={16} />,
            type: 'dropdown',
            children: [
                { id: 'PLAYERS', label: 'Players', icon: <Users size={16} /> },
                { id: 'SCHEDULES', label: 'Schedules', icon: <CalendarClock size={16} /> },
                { id: 'BACKUPS', label: 'Backups', icon: <ArchiveRestore size={16} /> },
                { id: 'INTEGRATIONS', label: 'Integrations', icon: <Webhook size={16} /> },
                { id: 'ACCESS', label: 'Access Control', icon: <Shield size={16} /> },
            ]
        },
        {
            label: 'System',
            icon: <ServerCog size={16} />,
            type: 'dropdown',
            children: [
                { id: 'SETTINGS', label: 'Settings', icon: <Settings size={16} /> },
                { id: 'ARCHITECT', label: 'Architect', icon: <BookOpenCheck size={16} /> },
            ]
        }
    ] : [];

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
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wider ml-2">Initializing</span>
                </div>
            );
        }
        
        if (totalCount === 0) {
             return (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-muted rounded border border-border">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30"></span>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider ml-2">No Instances</span>
                </div>
            );
        }

        if (onlineCount > 0) {
             return (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/20 rounded border border-emerald-200 dark:border-emerald-900/50">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider ml-2">
                        {onlineCount}/{totalCount} Systems Online
                    </span>
                </div>
            );
        }

        return (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-rose-50 dark:bg-rose-950/20 rounded border border-rose-200 dark:border-rose-900/50">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span className="text-[10px] text-rose-700 dark:text-rose-400 font-bold uppercase tracking-wider ml-2">Systems Offline</span>
            </div>
        );
    };

    return (
        <header className="border-b border-border bg-card sticky top-0 z-50 shadow-sm">
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
                            <img src="/website-icon.png" alt="Craft Commands Logo" className="w-12 h-12 object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold tracking-tight text-foreground leading-none">Craft Commands</span>
                            {currentServer ? (
                                <motion.div 
                                    initial={{ opacity: 0, x: -5 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center gap-1.5 mt-1"
                                >
                                    <span className="text-[10px] text-primary font-mono font-bold tracking-tight bg-primary/10 px-1.5 py-0.5 rounded leading-none">
                                        {currentServer.ip || '127.0.0.1'}:{currentServer.port}
                                    </span>
                                </motion.div>
                            ) : (
                                <span className="text-[10px] text-muted-foreground font-mono tracking-wider mt-0.5 uppercase">PRO PLATFORM</span>
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
                        
                        {/* Users Button (Admin Only) */}
                        {onNavigateUsers && (user?.role === 'OWNER' || user?.role === 'ADMIN') && (
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
                                        className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-2xl z-50 p-1"
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
                                        
                                        {/* Global Settings (Owner Only) */}
                                        {onNavigateGlobalSettings && user?.role === 'OWNER' && (
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

                                        {/* Users Management (Owner/Admin) */}
                                        {onNavigateUsers && (user?.role === 'OWNER' || user?.role === 'ADMIN') && (
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
                                        {onNavigateAuditLog && (user?.role === 'OWNER' || user?.role === 'ADMIN') && (
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
