import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile, AccentColor } from '@shared/types';
import { API } from '../services/api';

interface ThemeClasses {
    text: string;
    bg: string;
    border: string;
    ring: string;
    softBg: string;
}

type UserContextType = {
    user: UserProfile | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    theme: ThemeClasses;
    login: (email: string, password: string) => Promise<boolean>;
    logout: () => void;
    updatePreferences: (prefs: Partial<UserProfile['preferences']>) => void;
    updateUser: (updates: Partial<UserProfile>) => Promise<void>;
    refreshUser: () => Promise<void>;
};

import { socketService } from '../services/socket';

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) throw new Error('useUser must be used within UserProvider');
    return context;
};

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Attempt to load token from localStorage
    const [token, setToken] = useState<string | null>(localStorage.getItem('cc_token'));
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Initial Load / Token Verification
    useEffect(() => {
        const initAuth = async () => {
            if (token) {
                try {
                    const u = await API.getCurrentUser(token);
                    setUser(u);
                    setIsAuthenticated(true);
                    socketService.connect(); // Connect Socket
                } catch (e) {
                    console.error("Auth Token Invalid:", e);
                    logout(); // Clear invalid token
                }
            } else {
                setIsAuthenticated(false);
            }
            setIsLoading(false);
        };
        initAuth();
    }, [token]);

    // Multi-tab Sync
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'cc_token') {
                if (!e.newValue) {
                    // Logout triggered in another tab
                    setToken(null);
                    setUser(null);
                    setIsAuthenticated(false);
                    socketService.disconnect();
                } else if (e.newValue !== token) {
                    // Login triggered in another tab
                    setToken(e.newValue);
                    // trigger re-auth verification via main useEffect
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [token]);

    const login = async (email: string, pass: string) => {
        try {
            const data = await API.login(email, pass);
            if (data.token) {
                localStorage.setItem('cc_token', data.token);
                setToken(data.token);
                setUser(data.user);
                setIsAuthenticated(true);
                socketService.connect(); // Connect Socket
                return true;
            }
            return false;
        } catch (e) {
            console.error("Login failed:", e);
            return false;
        }
    };

    const logout = () => {
        localStorage.removeItem('cc_token');
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
        socketService.disconnect(); // Disconnect Socket
        window.dispatchEvent(new Event('cc_logout'));
    };

    const updatePreferences = (newPrefs: Partial<UserProfile['preferences']>) => {
        if (!user) return;
        
        const updated = {
            ...user.preferences,
            ...newPrefs,
            notifications: { ...user.preferences.notifications, ...newPrefs.notifications },
            terminal: { ...user.preferences.terminal, ...newPrefs.terminal }
        };

        // Optimistic update
        setUser({ ...user, preferences: updated });

        // Sync
        API.updateUser({ preferences: updated }, token!).catch(e => {
            console.error("Failed to save pref:", e);
        });
    };

    const updateUser = async (updates: Partial<UserProfile>) => {
        if (!user || !token) return;

        // Optimistic update
        const previousUser = { ...user };
        setUser({ ...user, ...updates });

        try {
            const updated = await API.updateUser(updates, token);
            setUser(updated); // Final sync
        } catch (e) {
            console.error("Failed to update user:", e);
            setUser(previousUser); // Rollback
            throw e;
        }
    };

    const refreshUser = async () => {
        if (!token) return;
        try {
            const u = await API.getCurrentUser(token);
            setUser(u);
        } catch (e) {
            console.error("Refresh failed:", e);
        }
    };

    // Theming Helpers
    const getThemeClasses = (color: AccentColor): ThemeClasses => {
        const map: Record<AccentColor, ThemeClasses> = {
            emerald: { text: 'text-emerald-500', bg: 'bg-emerald-500', border: 'border-emerald-500', ring: 'ring-emerald-500', softBg: 'bg-emerald-500/10' },
            blue: { text: 'text-blue-500', bg: 'bg-blue-500', border: 'border-blue-500', ring: 'ring-blue-500', softBg: 'bg-blue-500/10' },
            violet: { text: 'text-violet-500', bg: 'bg-violet-500', border: 'border-violet-500', ring: 'ring-violet-500', softBg: 'bg-violet-500/10' },
            amber: { text: 'text-amber-500', bg: 'bg-amber-500', border: 'border-amber-500', ring: 'ring-amber-500', softBg: 'bg-amber-500/10' },
            rose: { text: 'text-rose-500', bg: 'bg-rose-500', border: 'border-rose-500', ring: 'ring-rose-500', softBg: 'bg-rose-500/10' },
        };
        return map[color] || map.emerald;
    };

    const theme = user ? getThemeClasses(user.preferences.accentColor as AccentColor) : getThemeClasses('emerald');

    // Reduced Motion
    useEffect(() => {
        if (user?.preferences.reducedMotion) {
            document.body.classList.add('reduce-motion');
        } else {
            document.body.classList.remove('reduce-motion');
        }
    }, [user?.preferences?.reducedMotion]);

    const value: UserContextType = {
        user,
        token,
        isAuthenticated,
        isLoading,
        theme,
        login,
        logout,
        updatePreferences,
        updateUser,
        refreshUser
    };

    return isLoading ? (
        <div className="min-h-screen bg-black flex items-center justify-center text-emerald-500 font-mono">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                <span>AUTHENTICATING...</span>
            </div>
        </div>
    ) : <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
