
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

import { UserProfile, AccentColor } from '../types';
import { API } from '../services/api';


interface ThemeClasses {
    text: string;
    bg: string;
    border: string;
    ring: string;
    softBg: string; // bg-opacity-10
}

interface UserContextType {
    user: UserProfile;
    updatePreferences: (newPrefs: Partial<UserProfile['preferences']>) => void;
    refreshUser: () => void;
    theme: ThemeClasses;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) throw new Error('useUser must be used within UserProvider');
    return context;
};


    export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserProfile | null>(null); // Initialize user as null
    const [isLoading, setIsLoading] = useState<boolean>(true); // Add isLoading state

    useEffect(() => {
        const loadUser = async () => {
             try {
                 const u = await API.getUser();
                 setUser(u);
             } catch (e) {
                 console.error("Failed to load user profile:", e);
                 // Fallback to avoid crash
                 setUser({
                    email: 'admin@craftcommand.io',
                    username: 'Offline User',
                    role: 'Owner',
                    preferences: {
                        accentColor: 'emerald',
                        reducedMotion: false,
                        notifications: { browser: true, sound: true, events: { onJoin: true, onCrash: true } },
                        terminal: { fontSize: 13, fontFamily: 'monospace' }
                    }
                 });
             } finally {
                 setIsLoading(false);
             }
        };
        loadUser();
    }, []);

    const refreshUser = async () => {
        setIsLoading(true);
        try {
            const u = await API.getUser();
            setUser(u);
        } catch (e) {
            console.error("Failed to refresh user profile:", e);
            // Keep current user or set a default if user was null
            if (!user) {
                setUser({
                    email: 'admin@craftcommand.io',
                    username: 'Offline User',
                    role: 'Owner',
                    preferences: {
                        accentColor: 'emerald',
                        reducedMotion: false,
                        notifications: { browser: true, sound: true, events: { onJoin: true, onCrash: true } },
                        terminal: { fontSize: 13, fontFamily: 'monospace' }
                    }
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const updatePreferences = (newPrefs: Partial<UserProfile['preferences']>) => {
        if (!user) return; // Cannot update preferences if user is not loaded

        // Deep merge for nested objects like notifications/terminal
        const updated = {
            ...user.preferences,
            ...newPrefs,
            notifications: { ...user.preferences.notifications, ...newPrefs.notifications },
            terminal: { ...user.preferences.terminal, ...newPrefs.terminal }
        };
        
        // Persist to backend
        API.updateUser({ preferences: updated }).catch(e => {
            console.error("Failed to save preferences:", e);
        });

        setUser({ ...user, preferences: updated });
    };



    // Global Effect: Toggle Reduced Motion Class on Body
    useEffect(() => {
        if (user?.preferences.reducedMotion) {
            document.body.classList.add('reduce-motion');
        } else {
            document.body.classList.remove('reduce-motion');
        }
    }, [user?.preferences?.reducedMotion]);

    // Map accent color to Tailwind classes
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

    const theme = user ? getThemeClasses(user.preferences.accentColor) : getThemeClasses('emerald');

    return (
        <UserContext.Provider value={{ 
            user: user || {
                email: '',
                username: '',
                role: 'Admin',
                preferences: {
                    accentColor: 'emerald',
                    reducedMotion: false,
                    notifications: { browser: false, sound: false, events: { onJoin: false, onCrash: false } },
                    terminal: { fontSize: 13, fontFamily: 'monospace' }
                }
            }, 
            updatePreferences, 
            refreshUser, 
            theme 
        }}>
            {isLoading || !user ? (
                <div className="min-h-screen bg-black flex items-center justify-center text-emerald-500 font-mono">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                        <span>INITIALIZING SYSTEM...</span>
                    </div>
                </div>
            ) : children}
        </UserContext.Provider>
    );
};
