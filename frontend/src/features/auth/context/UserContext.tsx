import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile, AccentColor } from '@shared/types';
import { useStore } from '@/store';
import { API } from '../../core/services/api';
import i18n from '../../core/i18n';

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
    login: (email: string, password: string) => Promise<'success' | '2fa' | 'failed' | 'rate-limited'>;
    logout: () => void;
    updatePreferences: (prefs: Partial<UserProfile['preferences']>) => void;
    updateUser: (updates: Partial<UserProfile>) => Promise<void>;
    refreshUser: () => Promise<void>;
    verify2FA: (code: string, isRecovery?: boolean) => Promise<boolean>;
    twoFactorRequired: boolean;
    guestPrefs: { reducedMotion: boolean; visualQuality: boolean };
};

import { socketService } from '../../core/services/socket';

const UserContext = createContext<UserContextType | undefined>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
    theme: { text: '', bg: '', border: '', ring: '', softBg: '' },
    login: async () => 'failed',
    logout: () => {},
    updatePreferences: () => {},
    updateUser: async () => {},
    refreshUser: async () => {},
    verify2FA: async () => false,
    twoFactorRequired: false,
    guestPrefs: { reducedMotion: false, visualQuality: true }
});

export const useUser = () => {
    const store = useStore();
    return {
        user: store.user,
        token: store.token,
        isAuthenticated: store.isAuthenticated,
        isLoading: store.authLoading,
        theme: store.getThemeClasses(),
        login: store.login,
        logout: store.logout,
        updatePreferences: store.updatePreferences,
        updateUser: store.updateUser,
        refreshUser: store.refreshUser,
        verify2FA: store.verify2FA,
        twoFactorRequired: store.twoFactorRequired,
        guestPrefs: store.guestPrefs
    };
};

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const store = useStore();
    
    useEffect(() => {
        store.initAuth();
    }, []);

    useEffect(() => {
        const enabled = store.user ? store.user.preferences.reducedMotion : store.guestPrefs.reducedMotion;
        if (enabled) document.body.classList.add('reduce-motion');
        else document.body.classList.remove('reduce-motion');
    }, [store.user?.preferences?.reducedMotion, store.guestPrefs.reducedMotion]);
    
    useEffect(() => {
        const enabled = store.user ? store.user.preferences.visualQuality : store.guestPrefs.visualQuality;
        if (enabled) document.body.classList.add('visual-quality-high');
        else document.body.classList.remove('visual-quality-high');
    }, [store.user?.preferences?.visualQuality, store.guestPrefs.visualQuality]);
    
    // Sync System Language with i18next engine
    useEffect(() => {
        if (store.user?.preferences?.language) {
            i18n.changeLanguage(store.user.preferences.language);
        }
    }, [store.user?.preferences?.language]);

    return (
        <>
            {store.authLoading ? (
                <div className="min-h-screen bg-black flex items-center justify-center text-emerald-500 font-mono">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                        <span>AUTHENTICATING...</span>
                    </div>
                </div>
            ) : children}
        </>
    );
};
