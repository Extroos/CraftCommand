// CraftCommand Management App
import React, { useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import Header from './components/Layout/Header';
import Dashboard from './components/Views/Dashboard';
import Console from './components/Views/Console';
import Architect from './components/Views/Architect';
import FileManager from './components/Views/FileManager';
import PlayerManager from './components/Views/PlayerManager';
import PluginManager from './components/Views/PluginManager';
import BackupManager from './components/Views/BackupManager';
import ScheduleManager from './components/Views/ScheduleManager';
import SettingsManager from './components/Views/SettingsManager';
import Integrations from './components/Views/Integrations';
import UserProfileView from './components/Views/UserProfile';
import Login from './components/Auth/Login';
import ServerSelection from './components/Server/ServerSelection';
import CreateServer from './components/Server/CreateServer';
import StatusPage from './components/Public/StatusPage';
import { TabView, AppState, ServerConfig } from './types';
import { ToastProvider } from './components/UI/Toast';
import ErrorBoundary from './components/UI/ErrorBoundary';
import { UserProvider, useUser } from './context/UserContext';

import { ServerProvider, useServers } from './context/ServerContext';

const AppContent: React.FC = () => {
    const { user } = useUser();
    const { servers, currentServer, setCurrentServerById, isLoading: serversLoading } = useServers();
    
    // Initialize State from LocalStorage
    const [appState, setAppState] = useState<AppState>(() => 
        (localStorage.getItem('cc_appState') as AppState) || 'LOGIN'
    );
    const [activeTab, setActiveTab] = useState<TabView>('DASHBOARD');
    const [isRestoring, setIsRestoring] = useState(true);

    // Persist AppState
    React.useEffect(() => {
        localStorage.setItem('cc_appState', appState);
    }, [appState]);

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
        localStorage.removeItem('cc_serverId');
        setAppState('LOGIN');
    };

    if (isRestoring || serversLoading) {
         return <div className="min-h-screen bg-black flex items-center justify-center text-emerald-500 font-mono">INITIALIZING CONTROL PANEL...</div>;
    }


    const pageVariants = {
        initial: { opacity: 0, y: 10 },
        in: { opacity: 1, y: 0 },
        out: { opacity: 0, y: -10 }
    };

    const pageTransition = {
        type: 'tween',
        ease: 'circOut',
        duration: 0.3
    };

    // Render Logic wrapped in MotionConfig
    const renderContent = () => {
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

        if (appState === 'USER_PROFILE') {
            return (
                <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary flex flex-col">
                     <Header 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab} 
                        onBackToServerList={() => setAppState('SERVER_SELECTION')}
                        onLogout={handleLogout}
                        onNavigateProfile={() => setAppState('USER_PROFILE')}
                    />
                    <main className="flex-1 px-4 sm:px-6 lg:px-8 w-full">
                        <UserProfileView />
                    </main>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary flex flex-col">
                <Header 
                    activeTab={activeTab} 
                    setActiveTab={setActiveTab} 
                    onBackToServerList={() => setAppState('SERVER_SELECTION')}
                    onLogout={handleLogout}
                    onNavigateProfile={() => setAppState('USER_PROFILE')}
                />
                
                <main className="flex-1 py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                    {currentServer ? (
                        <ErrorBoundary key={currentServer.id}>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial="initial"
                                    animate="in"
                                    exit="out"
                                    variants={pageVariants}
                                    transition={pageTransition}
                                    className="h-full"
                                >

                                    {activeTab === 'DASHBOARD' && <Dashboard serverId={currentServer.id} />}
                                    {activeTab === 'CONSOLE' && <Console serverId={currentServer.id} />}
                                    {activeTab === 'FILES' && <FileManager serverId={currentServer.id} />}
                                    {activeTab === 'PLUGINS' && <PluginManager />}
                                    {activeTab === 'SCHEDULES' && <ScheduleManager serverId={currentServer.id} />}
                                    {activeTab === 'BACKUPS' && <BackupManager serverId={currentServer.id} />}
                                    {activeTab === 'PLAYERS' && <PlayerManager serverId={currentServer.id} />}
                                    {activeTab === 'SETTINGS' && <SettingsManager serverId={currentServer.id} />}
                                    {activeTab === 'ARCHITECT' && <Architect />}
                                    {activeTab === 'INTEGRATIONS' && <Integrations serverId={currentServer.id} />}
                                </motion.div>
                            </AnimatePresence>
                        </ErrorBoundary>
                    ) : (
                        <div className="text-center py-20 flex flex-col items-center justify-center h-full">
                             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                             <p className="mt-4 text-muted-foreground">Synchronizing Server Context...</p>
                        </div>
                    )}
                </main>

                <footer className="py-6 border-t border-border/40 mt-auto">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center text-[10px] font-mono tracking-wider text-muted-foreground/40 uppercase">
                        <div>CraftCommand Management Protocol v1.3.0</div>
                        <div>Licensed under MIT &copy; 2026 Extroos</div>
                    </div>
                </footer>
            </div>
        );
    };

    return (
        /* MotionConfig globally controls all framer-motion components */
        <MotionConfig transition={user.preferences.reducedMotion ? { duration: 0 } : undefined}>
            {renderContent()}
        </MotionConfig>
    );
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <UserProvider>
                <ServerProvider>
                    <ToastProvider>
                        <AppContent />
                    </ToastProvider>
                </ServerProvider>
            </UserProvider>
        </ErrorBoundary>
    );
};

export default App;
