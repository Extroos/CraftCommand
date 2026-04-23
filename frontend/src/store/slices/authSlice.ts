import { StateCreator } from 'zustand';
import { UserProfile, AccentColor } from '@shared/types';
import { API } from '../../features/core/services/api';
import { socketService } from '../../features/core/services/socket';
import i18n from '../../features/core/i18n';
import { StoreState } from '../index';

export interface AuthSlice {
    user: UserProfile | null;
    token: string | null;
    isAuthenticated: boolean;
    authLoading: boolean;
    twoFactorRequired: boolean;
    guestPrefs: { reducedMotion: boolean; visualQuality: boolean };
    
    // Actions
    setToken: (token: string | null) => void;
    login: (email: string, password: string) => Promise<'success' | '2fa' | 'failed' | 'rate-limited'>;
    logout: () => void;
    verify2FA: (code: string, isRecovery?: boolean) => Promise<boolean>;
    updatePreferences: (prefs: Partial<UserProfile['preferences']>) => void;
    updateUser: (updates: Partial<UserProfile>) => Promise<void>;
    refreshUser: () => Promise<void>;
    initAuth: () => Promise<void>;
    
    // Theme Helper (Derived)
    getThemeClasses: () => { text: string; bg: string; border: string; ring: string; softBg: string };
}

export const createAuthSlice: StateCreator<StoreState, [["zustand/devtools", never], ["zustand/persist", unknown]], [], AuthSlice> = (set, get) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    authLoading: true,
    twoFactorRequired: false,
    guestPrefs: {
        reducedMotion: localStorage.getItem('cc_reducedMotion') === 'true',
        visualQuality: localStorage.getItem('cc_visualQuality') !== 'false'
    },

    setToken: (token) => {
        if (token) localStorage.setItem('cc_token', token);
        else localStorage.removeItem('cc_token');
        set({ token });
    },

    login: async (email, password) => {
        try {
            const data = await API.login(email, password);
            if (data.twoFactorRequired) {
                set({ token: data.token, twoFactorRequired: true });
                return '2fa';
            }
            if (data.token) {
                localStorage.setItem('cc_token', data.token);
                set({ 
                    token: data.token, 
                    user: data.user, 
                    isAuthenticated: true, 
                    twoFactorRequired: false 
                });
                socketService.connect();
                return 'success';
            }
            return 'failed';
        } catch (e: any) {
            if (e.status === 429) return 'rate-limited';
            return 'failed';
        }
    },

    logout: () => {
        localStorage.removeItem('cc_token');
        set({ 
            token: null, 
            user: null, 
            isAuthenticated: false, 
            twoFactorRequired: false 
        });
        socketService.disconnect();
        window.dispatchEvent(new Event('cc_logout'));
    },

    verify2FA: async (code, isRecovery = false) => {
        const { token } = get();
        if (!token) return false;
        try {
            const data = await API.verify2FA(code, token, isRecovery);
            if (data.success && data.token) {
                localStorage.setItem('cc_token', data.token);
                set({ 
                    token: data.token, 
                    user: data.user!, 
                    isAuthenticated: true, 
                    twoFactorRequired: false 
                });
                socketService.connect();
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    },

    updatePreferences: (newPrefs) => {
        const { user, guestPrefs } = get();
        if (!user) return;

        const updated = {
            ...user.preferences,
            ...newPrefs,
            notifications: { ...user.preferences.notifications, ...newPrefs.notifications },
            terminal: { ...user.preferences.terminal, ...newPrefs.terminal }
        };

        set({ user: { ...user, preferences: updated } });

        API.updateUser({ preferences: updated }).catch(() => {});

        if (newPrefs.reducedMotion !== undefined) {
            localStorage.setItem('cc_reducedMotion', String(newPrefs.reducedMotion));
            set({ guestPrefs: { ...guestPrefs, reducedMotion: newPrefs.reducedMotion } });
        }
        if (newPrefs.visualQuality !== undefined) {
            localStorage.setItem('cc_visualQuality', String(newPrefs.visualQuality));
            set({ guestPrefs: { ...guestPrefs, visualQuality: newPrefs.visualQuality } });
        }
    },

    updateUser: async (updates) => {
        const { user } = get();
        if (!user) return;
        const previousUser = { ...user };
        set({ user: { ...user, ...updates } });
        try {
            const updated = await API.updateUser(updates);
            set({ user: updated });
        } catch (e) {
            set({ user: previousUser });
            throw e;
        }
    },

    refreshUser: async () => {
        try {
            const u = await API.getCurrentUser();
            set({ user: u });
        } catch (e) {}
    },

    initAuth: async () => {
        const token = localStorage.getItem('cc_token');
        
        // --- NON-BLOCKING OPTIMIZATION ---
        // If we have a token, we "optimistically" allow the app to render using cached state.
        // initAuth will continue validating the session in the background.
        if (token) {
            set({ token, authLoading: false, isAuthenticated: true });
        } else {
            set({ authLoading: false, isAuthenticated: false });
            return;
        }

        try {
            // Enforce a 5-second deadline for the identity check.
            // This prevents the "AUTHENTICATING..." freeze after system sleep/wake.
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 5000)
            );

            const userPromise = API.getCurrentUser();
            const u = await Promise.race([userPromise, timeoutPromise]) as UserProfile;

            set({ 
                user: u, 
                isAuthenticated: true
            });
            socketService.connect();
            console.log('[Auth] Session validated successfully.');
        } catch (e: any) {
            if (e.message === 'AUTH_TIMEOUT') {
                console.warn('[Auth] Identity check timed out. Maintaining stale session.');
                // We keep isAuthenticated: true so the user can see the dashboard 
                // while the network recovers. API calls will handle 401s if they happen.
            } else if (e.response?.status === 401 && e.response?.data?.mfaRequired) {
                set({ twoFactorRequired: true, isAuthenticated: false });
            } else {
                console.error(`[Auth] Session validation failed: ${e.message}`);
                // Important: We do NOT force logout here. We just mark it as possibly unauthenticated.
                // The app will attempt to function or show a non-intrusive re-auth prompt later.
            }
        } finally {
            set({ authLoading: false });
        }
    },

    getThemeClasses: () => {
        const { user } = get();
        const color = (user?.preferences?.accentColor || 'emerald') as AccentColor;
        const map: Record<AccentColor, any> = {
            emerald: { text: 'text-emerald-500', bg: 'bg-emerald-500', border: 'border-emerald-500', ring: 'ring-emerald-500', softBg: 'bg-emerald-500/10' },
            blue: { text: 'text-blue-500', bg: 'bg-blue-500', border: 'border-blue-500', ring: 'ring-blue-500', softBg: 'bg-blue-500/10' },
            violet: { text: 'text-violet-500', bg: 'bg-violet-500', border: 'border-violet-500', ring: 'ring-violet-500', softBg: 'bg-violet-500/10' },
            amber: { text: 'text-amber-500', bg: 'bg-amber-500', border: 'border-amber-500', ring: 'ring-amber-500', softBg: 'bg-amber-500/10' },
            rose: { text: 'text-rose-500', bg: 'bg-rose-500', border: 'border-rose-500', ring: 'ring-rose-500', softBg: 'bg-rose-500/10' },
        };
        return map[color] || map.emerald;
    }
});
