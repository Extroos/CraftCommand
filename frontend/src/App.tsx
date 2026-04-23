// CraftCommand Management App
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import pkg from '../package.json';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { Loader2 } from 'lucide-react';

import Header from './features/ui/Header';
import Dashboard from './features/dashboard/Dashboard';
import AdvancedDashboard from './features/dashboard/AdvancedDashboard';
import Console from './features/servers/Console';
import KnowledgeBase from './features/installer/KnowledgeBase';
import FileManager from './features/files/FileManager';
import PlayerManager from './features/servers/PlayerManager';
import PluginManager from './features/plugins/PluginManager';
import BackupManager from './features/backups/BackupManager';
import ScheduleManager from './features/scheduling/ScheduleManager';
import SettingsManager from './features/servers/SettingsManager';
import Integrations from './features/integrations/Integrations';
import AccessControl from './features/auth/AccessControl';
import UserProfileView from './features/auth/UserProfile';
import UsersPage from './features/auth/UsersPage';
import GlobalSettingsView from './features/system/GlobalSettings';
import AuditLog from './features/auth/AuditLog';
import Login from './features/auth/Login';
import ServerSelection from './features/servers/ServerSelection';
import CreateServer from './features/servers/CreateServer/index';
import GlobalOperations from './features/system/GlobalOperations';
import ProxyNetworkManager from './features/network/ProxyNetworkManager';
import VelocityDashboard from './features/dashboard/VelocityDashboard';
import { MapManager } from './features/servers/MapManager';
import { DatabaseManager } from './features/servers/DatabaseManager';
import { SubuserManager } from './features/servers/SubuserManager';
import StatusPage from './features/servers/StatusPage';
import DeploymentProgressOverlay from './features/servers/CreateServer/DeploymentProgressOverlay';
import ActivityTray from './features/ui/ActivityTray';

import { TabView, ServerConfig } from '@shared/types';
import { ToastProvider } from './features/ui/Toast';
import ErrorBoundary from './features/ui/ErrorBoundary';
import { UserProvider, useUser } from './features/auth/context/UserContext';
import { ThemeProvider } from './features/ui/context/ThemeContext';
import { ServerProvider, useServers } from './features/servers/context/ServerContext';
import { NotificationProvider } from './features/system/context/NotificationContext';
import { CollaborationProvider } from './features/collaboration/context/CollaborationContext';
import { SystemProvider, useSystem } from './features/system/context/SystemContext';
import { usePermissions } from './features/auth/hooks/usePermissions';
import OperatorChat from './features/collaboration/OperatorChat';

// Reusable shell that wraps every non-login page with Header + layout
const PageShell: React.FC<{
    children: React.ReactNode;
    activeTab?: TabView;
    currentServer: ServerConfig | null;
    mainClassName?: string;
    wrapperClassName?: string;
}> = ({ 
    children, activeTab, currentServer, 
    mainClassName, wrapperClassName 
}) => {
    const navigate = useNavigate();
    const { logout: authLogout } = useUser();
    const { setCurrentServerById } = useServers();

    const handleNavigate = (tab: TabView) => {
        if (currentServer) {
            const path = tab === 'KNOWLEDGE_BASE' ? 'guide' : tab.toLowerCase();
            navigate(`/server/${currentServer.id}/${path}`);
        }
    };

    const handleBack = () => {
        setCurrentServerById(null);
        localStorage.removeItem('cc_serverId');
        navigate('/servers');
    };

    const handleLogout = () => {
        authLogout();
        setCurrentServerById(null);
        localStorage.removeItem('cc_serverId');
        navigate('/login');
    };

    return (
        <div className={wrapperClassName || `min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary relative`}>
            <Header
                activeTab={activeTab || 'DASHBOARD'}
                setActiveTab={handleNavigate}
                onBackToServerList={handleBack}
                onLogout={handleLogout}
                onNavigateProfile={() => navigate('/profile')}
                onNavigateUsers={() => navigate('/users')}
                onNavigateGlobalSettings={() => navigate('/settings')}
                onNavigateAuditLog={() => navigate('/audit')}
                onNavigateOperations={() => navigate('/operations')}
                currentServer={currentServer}
            />
            <main className={mainClassName || 'flex-1 px-4 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto py-8 pt-24'}>
                {children}
            </main>
            <footer className="py-6 border-t border-border/5 mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <img src="/website-icon.png" alt="Logo" className="w-5 h-5 opacity-40 filter grayscale" />
                        <p className="text-xs text-muted-foreground/60">
                            &copy; 2026 Extroos &bull; Licensed under MIT
                        </p>
                    </div>
                    <div className="flex items-center gap-6">
                        <span className="text-xs font-medium text-muted-foreground/30">v{pkg.version}</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

const ServerRouteWrapper: React.FC<{ tab: TabView }> = ({ tab }) => {
    const { serverId } = useParams<{ serverId: string }>();
    const { servers, currentServer, setCurrentServerById, isLoading: serversLoading } = useServers();
    const { settings, isLoading: systemLoading } = useSystem();

    useEffect(() => {
        if (serverId && (!currentServer || currentServer.id !== serverId)) {
            setCurrentServerById(serverId);
        }
    }, [serverId, currentServer, setCurrentServerById, servers]);

    const renderTab = () => {
        if (serversLoading || systemLoading || (serverId && !currentServer)) {
            return (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    <span className="text-sm font-medium text-muted-foreground">Attaching to instance...</span>
                </div>
            );
        }

        if (!currentServer) return <Navigate to="/servers" />;

        switch (tab) {
            case 'DASHBOARD':
                if (currentServer.software === 'Velocity') return <VelocityDashboard serverId={currentServer.id} />;
                return settings.app.detailedDashboard 
                    ? <AdvancedDashboard serverId={currentServer.id} /> 
                    : <Dashboard serverId={currentServer.id} />;
            case 'CONSOLE': return <Console serverId={currentServer.id} />;
            case 'FILES': return <FileManager serverId={currentServer.id} />;
            case 'PLUGINS': return <PluginManager serverId={currentServer.id} />;
            case 'PLAYERS': return <PlayerManager serverId={currentServer.id} />;
            case 'SCHEDULES': return <ScheduleManager serverId={currentServer.id} />;
            case 'BACKUPS': return <BackupManager serverId={currentServer.id} />;
            case 'SETTINGS': return <SettingsManager serverId={currentServer.id} />;
            case 'ACCESS': return <AccessControl serverId={currentServer.id} />;
            case 'INTEGRATIONS': return <Integrations serverId={currentServer.id} />;
            case 'NETWORK': return <ProxyNetworkManager serverId={currentServer.id} />;
            case 'DATABASES': return <DatabaseManager serverId={currentServer.id} />;
            case 'SUBUSERS': return <SubuserManager serverId={currentServer.id} />;
            case 'MAP': return <MapManager serverId={currentServer.id} />;
            case 'KNOWLEDGE_BASE': return <KnowledgeBase />;
            default: return <Dashboard serverId={currentServer?.id || ''} />;
        }
    };

    return (
        <PageShell activeTab={tab} currentServer={currentServer || null}>
            <ErrorBoundary key={`${serverId}-${tab}`}>
                {renderTab()}
            </ErrorBoundary>
        </PageShell>
    );
};

const AppContent: React.FC = () => {
    const { user, isAuthenticated, isLoading: authLoading, guestPrefs, logout } = useUser();
    const { servers, isLoading: serversLoading } = useServers();
    const { isRestarting, isActivityTrayOpen, setActivityTrayOpen } = useSystem();
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Background Layer logic
    const activeBg = React.useMemo(() => {
        const qualityEnabled = user ? user.preferences.visualQuality : guestPrefs?.visualQuality;
        if (!qualityEnabled || !user || !user.preferences.backgrounds) return undefined;
        
        const b = user.preferences.backgrounds;
        const path = location.pathname;
        
        const getActive = () => {
            // Auth & Selection
            if (path === '/login') return b.login;
            if (path === '/status') return b.status;
            if (path === '/servers') return b.serverSelection;
            if (path === '/create-server') return b.knowledgeBase;

            // User & System Management
            if (path === '/profile') return b.profile;
            if (path === '/users') return b.users;
            if (path === '/settings') return b.globalSettings;
            if (path === '/audit') return b.auditLog;
            if (path === '/operations') return b.operations;

            // Server Specific Sub-routes
            if (path.startsWith('/server/')) {
                const subPath = path.split('/').slice(3)[0]; // e.g., 'console', 'files'
                switch (subPath) {
                    case 'dashboard': return b.dashboard;
                    case 'console': return b.console;
                    case 'files': return b.files;
                    case 'plugins': return b.plugins;
                    case 'players': return b.players;
                    case 'backups': return b.backups;
                    case 'schedules': return b.schedules;
                    case 'settings': return b.settings;
                    case 'access': return b.access;
                    case 'integrations': return b.integrations;
                    case 'network': return b.network;
                    case 'map': return b.status;
                    case 'guide': return b.knowledgeBase;
                    default: return b.dashboard;
                }
            }
            return undefined;
        };

        const specific = getActive();
        if (specific?.enabled && specific?.url) return specific;
        
        // Fallback to global if specific is disabled or not set
        if (b.global?.enabled && b.global?.url) return b.global;

        return undefined;
    }, [location.pathname, user, guestPrefs]);

    if (authLoading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
                <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <span className="text-sm font-medium text-muted-foreground">Starting CraftCommand...</span>
            </div>
        );
    }

    const qualityEnabled = user ? user.preferences.visualQuality : guestPrefs?.visualQuality;

    return (
        <MotionConfig reducedMotion={user?.preferences.reducedMotion ? "always" : "never"}>
            <div className={`relative min-h-screen transition-colors duration-500 ${activeBg?.enabled && activeBg?.url ? 'has-custom-bg' : 'bg-background'} ${qualityEnabled ? 'quality-enabled' : ''}`}>
                <AnimatePresence>
                    {activeBg?.enabled && activeBg?.url && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="background-layer"
                            style={{ backgroundImage: `url(${activeBg.url})`, filter: `blur(${activeBg.blur}px)`, opacity: activeBg.opacity }}
                        />
                    )}
                </AnimatePresence>

                <div className="relative z-10 min-h-screen">
                    <AnimatePresence>
                        {isRestarting && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[1000] bg-background/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-6"
                            >
                                <div className="w-16 h-16 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-8" />
                                
                                <h2 className="text-xl font-semibold text-foreground mb-2">Platform Restarting</h2>
                                <p className="text-muted-foreground text-sm max-w-sm">
                                    CraftCommand services are restarting to apply updates. Re-establishing connection...
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <Routes>
                        <Route path="/login" element={!isAuthenticated ? <Login onLogin={() => navigate('/servers')} onViewStatus={() => navigate('/status')} /> : <Navigate to="/servers" />} />
                        <Route path="/status" element={<StatusPage onNavigateLogin={() => navigate('/login')} />} />
                        
                        <Route path="/servers" element={isAuthenticated ? <ServerSelection onSelectServer={(s) => navigate(`/server/${s.id}/dashboard`)} onCreateNew={() => navigate('/create-server')} onLogout={handleLogout} /> : <Navigate to="/login" />} />
                        <Route path="/create-server" element={isAuthenticated ? <CreateServer onBack={() => navigate('/servers')} onDeploy={() => navigate('/servers')} /> : <Navigate to="/login" />} />
                        
                        <Route path="/profile" element={isAuthenticated ? <PageShell currentServer={null}><UserProfileView /></PageShell> : <Navigate to="/login" />} />
                        <Route path="/users" element={isAuthenticated ? <PageShell currentServer={null}><UsersPage /></PageShell> : <Navigate to="/login" />} />
                        <Route path="/settings" element={isAuthenticated ? <PageShell currentServer={null}><GlobalSettingsView /></PageShell> : <Navigate to="/login" />} />
                        <Route path="/audit" element={isAuthenticated ? <PageShell currentServer={null}><AuditLog /></PageShell> : <Navigate to="/login" />} />
                        <Route path="/operations" element={isAuthenticated ? <PageShell currentServer={null}><GlobalOperations /></PageShell> : <Navigate to="/login" />} />
                        
                        <Route path="/server/:serverId/dashboard" element={<ServerRouteWrapper tab="DASHBOARD" />} />
                        <Route path="/server/:serverId/console" element={<ServerRouteWrapper tab="CONSOLE" />} />
                        <Route path="/server/:serverId/files" element={<ServerRouteWrapper tab="FILES" />} />
                        <Route path="/server/:serverId/players" element={<ServerRouteWrapper tab="PLAYERS" />} />
                        <Route path="/server/:serverId/plugins" element={<ServerRouteWrapper tab="PLUGINS" />} />
                        <Route path="/server/:serverId/backups" element={<ServerRouteWrapper tab="BACKUPS" />} />
                        <Route path="/server/:serverId/schedules" element={<ServerRouteWrapper tab="SCHEDULES" />} />
                        <Route path="/server/:serverId/settings" element={<ServerRouteWrapper tab="SETTINGS" />} />
                        <Route path="/server/:serverId/access" element={<ServerRouteWrapper tab="ACCESS" />} />
                        <Route path="/server/:serverId/integrations" element={<ServerRouteWrapper tab="INTEGRATIONS" />} />
                        <Route path="/server/:serverId/network" element={<ServerRouteWrapper tab="NETWORK" />} />
                        <Route path="/server/:serverId/databases" element={<ServerRouteWrapper tab="DATABASES" />} />
                        <Route path="/server/:serverId/map" element={<ServerRouteWrapper tab="MAP" />} />
                        <Route path="/server/:serverId/guide" element={<ServerRouteWrapper tab="KNOWLEDGE_BASE" />} />

                        <Route path="/" element={<Navigate to={isAuthenticated ? "/servers" : "/login"} />} />
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                    <DeploymentProgressOverlay />
                    <ActivityTray isOpen={isActivityTrayOpen} onClose={() => setActivityTrayOpen(false)} />
                </div>
            </div>
        </MotionConfig>
    );
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            {/* 
                Performance Note: Monolithic Context Providers have been refactored into Zustand slices.
                The following wrappers are now lean bridges for initialization and UI overlays.
            */}
            <UserProvider>
                <ThemeProvider>
                    <SystemProvider>
                        <ServerProvider>
                            <ToastProvider>
                                <NotificationProvider>
                                    <CollaborationProvider>
                                        <AppContent />
                                        <OperatorChatWrapper />
                                    </CollaborationProvider>
                                </NotificationProvider>
                            </ToastProvider>
                        </ServerProvider>
                    </SystemProvider>
                </ThemeProvider>
            </UserProvider>
        </ErrorBoundary>
    );
};

const OperatorChatWrapper = () => {
    const { hostMode } = useSystem();
    const { isAuthenticated } = useUser();
    if (!hostMode || !isAuthenticated) return null;
    return <OperatorChat />;
};

export default App;
