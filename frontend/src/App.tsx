// CraftCommand Management App
import React, { useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import Header from './features/ui/Header';
import Dashboard from './features/dashboard/Dashboard';
import Console from './features/servers/Console';
import Architect from './features/installer/Architect';
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

import StatusPage from './features/servers/StatusPage';
import { TabView, AppState, ServerConfig } from '@shared/types';
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

const AppContent: React.FC = () => {
    const { user, isAuthenticated, logout: authLogout, isLoading: authLoading, guestPrefs } = useUser();
    const { servers, currentServer, setCurrentServerById, isLoading: serversLoading } = useServers();
    const { version, settings } = useSystem();
    const { can } = usePermissions();
    
    // Initialize State - ALWAYS start at LOGIN for fresh console starts
    const [appState, setAppState] = useState<AppState>('LOGIN');
    const [activeTab, setActiveTab] = useState<TabView>('DASHBOARD');
    const [isRestoring, setIsRestoring] = useState(true);

    // Unified Navigation Handler (Fixes navigation regression v1.7.7)
    const handleNavigateView = (tab: TabView) => {
        setActiveTab(tab);
        
        // If we are in a Global View and have a server, return to management
        if (currentServer) {
            setAppState('MANAGE_SERVER');
        } else {
            // If no server is selected, these tabs don't make sense.
            // Redirect to Server selection to prevent "Synchronizing..." gray screen fallthrough
            const serverSpecificTabs: TabView[] = ['DASHBOARD', 'CONSOLE', 'FILES', 'PLUGINS', 'PLAYERS', 'SETTINGS', 'BACKUPS', 'NETWORK', 'MAP', 'ACCESS', 'INTEGRATIONS', 'ARCHITECT', 'SCHEDULES'];
            if (serverSpecificTabs.includes(tab)) {
                setAppState('SERVER_SELECTION');
            }
        }
    };

    // Persist AppState to localStorage (but don't load from it on mount)
    React.useEffect(() => {
        if (appState !== 'LOGIN') {
            localStorage.setItem('cc_appState', appState);
        }
    }, [appState]);

    // Auto-navigate authenticated users away from login screen
    React.useEffect(() => {
        if (!authLoading && isAuthenticated && appState === 'LOGIN') {
            console.log('[App] User is authenticated, navigating to server selection');
            setAppState('SERVER_SELECTION');
        }
    }, [authLoading, isAuthenticated, appState]);

    // Smart Auto-Recovery: If we are managing a server but context is lost (null),
    // try to find it in the servers list and restore it.
    React.useEffect(() => {
        const savedServerId = localStorage.getItem('cc_serverId');
        if (appState === 'MANAGE_SERVER' && savedServerId && !currentServer && servers.length > 0) {
            console.log('[App] Smart Recovery: Found lost server context, restoring...');
            setCurrentServerById(savedServerId);
        }
    }, [servers, currentServer, appState, setCurrentServerById]);

    // Restore Server Context on Mount (Initial)
    React.useEffect(() => {
        if (!serversLoading) {
            const savedServerId = localStorage.getItem('cc_serverId');
            if (appState === 'MANAGE_SERVER' && savedServerId && !currentServer) {
                setCurrentServerById(savedServerId);
            }
            setIsRestoring(false);
        }
    }, [serversLoading, appState, setCurrentServerById]);

    const handleLogin = () => {
        setAppState('SERVER_SELECTION');
    };

    const handleBackToServerList = () => {
        setCurrentServerById(null);
        localStorage.removeItem('cc_serverId');
        setAppState('SERVER_SELECTION');
    };

    const handleSelectServer = (server: ServerConfig) => {
        setCurrentServerById(server.id);
        localStorage.setItem('cc_serverId', server.id);
        setAppState('MANAGE_SERVER');
        setActiveTab('DASHBOARD'); 
    };

    const handleDeploy = () => {
        setAppState('SERVER_SELECTION');
    };

    const handleLogout = () => {
        authLogout(); // Call UserContext logout to clear token & state
        setCurrentServerById(null); // Clear server state on logout
        localStorage.removeItem('cc_serverId');
        localStorage.removeItem('cc_appState');
        setAppState('LOGIN');
    };
    
    // Background Mapping Logic (High Performance)
    const getActiveBackground = () => {
        const cachedStr = localStorage.getItem('cc_backgrounds');
        const cached = cachedStr ? JSON.parse(cachedStr) : null;
        
        // Quality Mode Check
        const qualityEnabled = user ? user.preferences.visualQuality : guestPrefs.visualQuality;
        if (!qualityEnabled) return undefined;

        if (!user || !user.preferences.backgrounds) {
            // Pre-auth fallback for personal branding
            if (appState === 'LOGIN' && cached?.login) return cached.login;
            if (appState === 'PUBLIC_STATUS' && cached?.status) return cached.status;
            return cached?.global;
        }
        
        const b = user.preferences.backgrounds;

        // Helper to check if a setting is valid/active
        const isValid = (s?: any) => s?.enabled && s?.url;

        // 1. Identify specific view setting
        let specific: any = undefined;
        if (appState === 'LOGIN') specific = b.login;
        else if (appState === 'PUBLIC_STATUS') specific = b.status;
        else if (appState === 'SERVER_SELECTION') specific = b.serverSelection;
        else if (appState === 'USER_MANAGEMENT') specific = b.users;
        else if (appState === 'USER_PROFILE') specific = b.profile; 
        else if (appState === 'GLOBAL_SETTINGS') specific = b.globalSettings;
        else if (appState === 'AUDIT_LOG') specific = b.auditLog;
        else if (appState === 'GLOBAL_OPERATIONS') specific = b.operations;
        else if (appState === 'MANAGE_SERVER') {
            const tabKey = activeTab.toLowerCase();
            specific = (b as any)[tabKey] || b.dashboard;
        }

        // 2. Resolve final setting (Specific > Global > Dashboard fallback)
        if (isValid(specific)) return specific;
        if (isValid(b.global)) return b.global;
        return isValid(b.dashboard) ? b.dashboard : undefined;
    };

    // Show global initialization splash ONLY on first load or when authenticated & data is missing
    const showSplash = isRestoring || (isAuthenticated && serversLoading && servers.length === 0) || (isAuthenticated && authLoading);

    if (showSplash) {
         return <div className="min-h-screen bg-black flex items-center justify-center text-emerald-500 font-mono">INITIALIZING CONTROL PANEL...</div>;
    }


    const pageVariants = {
        initial: { opacity: 0, y: 10 },
        in: { opacity: 1, y: 0 },
        out: { opacity: 0, y: -10 }
    };

    const pageTransition = {
        type: 'spring',
        stiffness: user?.preferences.visualQuality ? 150 : 250, // Reduced for smoother ease
        damping: user?.preferences.visualQuality ? 20 : 25,     // More fluid
        mass: 0.8,
        duration: user?.preferences.visualQuality ? 0.5 : 0.25
    };

    // Render Logic wrapped in MotionConfig
    const renderContent = () => {
        const activeBg = getActiveBackground();
        const mainClasses = activeBg ? 'bg-transparent-if-bg' : 'bg-background';

        if (appState === 'LOGIN') {
            return (
                <Login 
                    onLogin={handleLogin} 
                    onViewStatus={() => setAppState('PUBLIC_STATUS')}
                />
            );
        }

        if (appState === 'PUBLIC_STATUS') {
            return <StatusPage onNavigateLogin={() => setAppState('LOGIN')} />;
        }
        if (appState === 'SERVER_SELECTION') {
            return (
                <ServerSelection 
                    onSelectServer={handleSelectServer} 
                    onCreateNew={() => setAppState('CREATE_SERVER')} 
                    onLogout={handleLogout}
                    onNavigateProfile={() => setAppState('USER_PROFILE')}
                    onNavigateUsers={() => setAppState('USER_MANAGEMENT')}
                    onNavigateGlobalSettings={() => setAppState('GLOBAL_SETTINGS')}
                    onNavigateAuditLog={() => setAppState('AUDIT_LOG')}
                    onNavigateOperations={() => setAppState('GLOBAL_OPERATIONS')}
                />
            );
        }

        if (appState === 'CREATE_SERVER') {
            return (
                <CreateServer 
                    onBack={() => setAppState('SERVER_SELECTION')}
                    onDeploy={handleDeploy}
                />
            );
        }
        
        if (appState === 'USER_MANAGEMENT') {
             if (!can('users.manage')) {
                 setAppState('SERVER_SELECTION');
                 return null;
             }
             return (
                <div className={`min-h-screen ${mainClasses} text-foreground antialiased selection:bg-primary/20 selection:text-primary flex flex-col relative overflow-y-auto`}>
                     <Header 
                        activeTab={activeTab} 
                        setActiveTab={handleNavigateView} 
                        onBackToServerList={handleBackToServerList}
                        onLogout={handleLogout}
                        onNavigateProfile={() => setAppState('USER_PROFILE')}
                        onNavigateUsers={() => setAppState('USER_MANAGEMENT')}
                        onNavigateGlobalSettings={() => setAppState('GLOBAL_SETTINGS')}
                        onNavigateAuditLog={() => setAppState('AUDIT_LOG')}
                        onNavigateOperations={() => setAppState('GLOBAL_OPERATIONS')}
                        currentServer={currentServer}
                    />
                    <main className="flex-1 px-4 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto py-8 pt-24">
                        <UsersPage />
                    </main>
                </div>
            );
        }

        if (appState === 'USER_PROFILE') {
            return (
                <div className={`min-h-screen ${mainClasses} text-foreground antialiased selection:bg-primary/20 selection:text-primary flex flex-col relative overflow-hidden`}>
                     <Header 
                        activeTab={activeTab} 
                        setActiveTab={handleNavigateView} 
                        onBackToServerList={handleBackToServerList}
                        onLogout={handleLogout}
                        onNavigateProfile={() => setAppState('USER_PROFILE')}
                        onNavigateUsers={() => setAppState('USER_MANAGEMENT')}
                        onNavigateGlobalSettings={() => setAppState('GLOBAL_SETTINGS')}
                        onNavigateOperations={() => setAppState('GLOBAL_OPERATIONS')}
                        currentServer={currentServer}
                    />
                    <main className="flex-1 px-4 sm:px-6 lg:px-8 w-full pt-20">
                        <UserProfileView />
                    </main>
                </div>
            );
        }

        if (appState === 'GLOBAL_SETTINGS') {
            if (!can('system.settings.manage')) {
                setAppState('SERVER_SELECTION');
                return null;
            }
            return (
                <div className={`min-h-screen ${mainClasses} text-foreground antialiased selection:bg-primary/20 selection:text-primary flex flex-col relative overflow-hidden`}>
                     <Header 
                        activeTab={activeTab} 
                        setActiveTab={handleNavigateView} 
                        onBackToServerList={handleBackToServerList}
                        onLogout={handleLogout}
                        onNavigateProfile={() => setAppState('USER_PROFILE')}
                        onNavigateUsers={() => setAppState('USER_MANAGEMENT')}
                        onNavigateGlobalSettings={() => setAppState('GLOBAL_SETTINGS')}
                        onNavigateAuditLog={() => setAppState('AUDIT_LOG')}
                        currentServer={currentServer}
                    />
                    <main className="flex-1 px-4 sm:px-6 lg:px-8 w-full py-8 pt-24">
                        <GlobalSettingsView />
                    </main>
                </div>
            );
        }

        if (appState === 'AUDIT_LOG') {
            if (!can('system.audit.view')) {
                setAppState('SERVER_SELECTION');
                return null;
            }
            return (
                <div className={`min-h-screen ${mainClasses} text-foreground antialiased selection:bg-primary/20 selection:text-primary flex flex-col relative overflow-hidden`}>
                     <Header 
                        activeTab={activeTab} 
                        setActiveTab={handleNavigateView} 
                        onBackToServerList={handleBackToServerList}
                        onLogout={handleLogout}
                        onNavigateProfile={() => setAppState('USER_PROFILE')}
                        onNavigateUsers={() => setAppState('USER_MANAGEMENT')}
                        onNavigateGlobalSettings={() => setAppState('GLOBAL_SETTINGS')}
                        onNavigateAuditLog={() => setAppState('AUDIT_LOG')}
                        currentServer={currentServer}
                    />
                    <main className="flex-1 px-4 sm:px-6 lg:px-8 w-full py-8 pt-24">
                        <AuditLog />
                    </main>
                </div>
            );
        }

        if (appState === 'GLOBAL_OPERATIONS') {
            if (!can('system.nodes.manage')) {
                setAppState('SERVER_SELECTION');
                return null;
            }
            if (settings && !settings.app.distributedNodes?.enabled) {
                setAppState('SERVER_SELECTION');
                return null;
            }
            return (
                <div className={`min-h-screen ${mainClasses} text-foreground antialiased selection:bg-primary/20 selection:text-primary flex flex-col relative overflow-hidden`}>
                     <Header 
                        activeTab={activeTab} 
                        setActiveTab={handleNavigateView} 
                        onBackToServerList={handleBackToServerList}
                        onLogout={handleLogout}
                        onNavigateProfile={() => setAppState('USER_PROFILE')}
                        onNavigateUsers={() => setAppState('USER_MANAGEMENT')}
                        onNavigateGlobalSettings={() => setAppState('GLOBAL_SETTINGS')}
                        onNavigateAuditLog={() => setAppState('AUDIT_LOG')}
                        onNavigateOperations={() => setAppState('GLOBAL_OPERATIONS')}
                        currentServer={currentServer}
                    />
                    <main className="flex-1 w-full max-w-7xl mx-auto py-8 pt-24">
                    <GlobalOperations onNavigate={(state) => setAppState(state)} />
                </main>
                </div>
            );
        }

        return (
            <div className={`min-h-screen ${mainClasses} text-foreground antialiased selection:bg-primary/20 selection:text-primary flex flex-col relative overflow-hidden`}>
                <Header 
                    activeTab={activeTab} 
                    setActiveTab={handleNavigateView} 
                    onBackToServerList={handleBackToServerList}
                    onLogout={handleLogout}
                    onNavigateProfile={() => setAppState('USER_PROFILE')}
                    onNavigateUsers={() => setAppState('USER_MANAGEMENT')}
                    onNavigateGlobalSettings={() => setAppState('GLOBAL_SETTINGS')}
                    onNavigateAuditLog={() => setAppState('AUDIT_LOG')}
                    onNavigateOperations={() => setAppState('GLOBAL_OPERATIONS')}
                    currentServer={currentServer}
                />
                
                <main className="flex-1 py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-20 overflow-visible">
                    {currentServer ? (
                        <ErrorBoundary key={currentServer.id}>
                                    {activeTab === 'DASHBOARD' && (
                                        currentServer.software === 'Velocity' ? (
                                            <VelocityDashboard serverId={currentServer.id} />
                                        ) : (
                                            <Dashboard serverId={currentServer.id} />
                                        )
                                    )}
                                    {activeTab === 'CONSOLE' && <Console serverId={currentServer.id} />}
                                    {activeTab === 'FILES' && <FileManager serverId={currentServer.id} />}
                                    {activeTab === 'PLUGINS' && <PluginManager serverId={currentServer.id} />}
                                    {activeTab === 'SCHEDULES' && <ScheduleManager serverId={currentServer.id} />}
                                    {activeTab === 'BACKUPS' && <BackupManager serverId={currentServer.id} />}
                                    {activeTab === 'PLAYERS' && <PlayerManager serverId={currentServer.id} />}
                                    {activeTab === 'ACCESS' && <AccessControl serverId={currentServer.id} />}
                                    {activeTab === 'SETTINGS' && (
                                        <SettingsManager serverId={currentServer.id} />
                                    )}
                                    {activeTab === 'ARCHITECT' && <Architect />}
                                    {activeTab === 'INTEGRATIONS' && <Integrations serverId={currentServer.id} />}
                                    {activeTab === 'NETWORK' && <ProxyNetworkManager serverId={currentServer.id} />}
                                    {activeTab === 'MAP' && <MapManager serverId={currentServer.id} />}
                        </ErrorBoundary>
                    ) : (
                        <div className="text-center py-20 flex flex-col items-center justify-center h-full min-h-[400px]">
                             <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="relative"
                             >
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary/50 opacity-20"></div>
                                <div className="absolute inset-0 animate-pulse flex items-center justify-center">
                                    <div className="h-2 w-2 rounded-full bg-primary"></div>
                                </div>
                             </motion.div>
                             <p className="mt-6 text-sm font-medium text-muted-foreground tracking-tight">Accessing Instance Protocol...</p>
                             <button 
                                onClick={() => setAppState('SERVER_SELECTION')}
                                className="mt-4 text-xs text-primary hover:underline"
                             >
                                Return to Selection
                             </button>
                        </div>
                    )}
                </main>

                <footer className="py-6 border-t border-border/40 mt-auto">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center text-[11px] font-medium tracking-tight text-muted-foreground/30">
                        <div className="flex items-center gap-2 italic">
                            CraftCommand Protocol v{version}
                        </div>
                        <div>Licensed under AGPLv3 &copy; 2026 Extroos</div>
                    </div>
                </footer>
            </div>
        );
    };

    const activeBg = getActiveBackground();

    return (
        <MotionConfig reducedMotion={user?.preferences.reducedMotion ? "always" : "never"}>
            <div className={`relative min-h-screen transition-colors duration-500 ${activeBg ? 'has-custom-bg' : 'bg-background'} ${user?.preferences.reducedMotion ? 'reduced-motion' : ''}`}>
                {/* Background Layer (Hardware Accelerated) */}
                <AnimatePresence>
                    {activeBg && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="background-layer"
                            style={{ 
                                backgroundImage: `url(${activeBg.url.startsWith('/') ? `http://${window.location.hostname}:3001${activeBg.url}` : activeBg.url})`,
                                filter: `blur(${activeBg.blur}px)`,
                                opacity: activeBg.opacity
                            }}
                        />
                    )}
                </AnimatePresence>

                <div className="relative z-10 min-h-screen flex flex-col">
                    {renderContent()}
                </div>
            </div>
        </MotionConfig>
    );
};

import { BrowserRouter } from 'react-router-dom';

const App: React.FC = () => {
    return (
        <BrowserRouter>
            <ErrorBoundary>
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
        </BrowserRouter>
    );
};

const OperatorChatWrapper = () => {
    const { hostMode } = useSystem();
    const { isAuthenticated } = useUser();
    if (!hostMode || !isAuthenticated) return null;
    return <OperatorChat />;
};

export default App;
