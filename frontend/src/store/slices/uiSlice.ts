import { StateCreator } from 'zustand';
import { ThemeMode, ResolvedTheme, generateThemeCSSVariables } from '../../styles/theme-tokens';
import { StoreState } from '../index';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
}

export interface UISlice {
    theme: ThemeMode;
    resolvedTheme: ResolvedTheme;
    toasts: Toast[];

    // Actions
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
    addToast: (type: ToastType, title: string, message?: string) => void;
    removeToast: (id: string) => void;
    applyTheme: (resolved: ResolvedTheme) => void;
    
    // Initialization
    initUI: () => void;
}

export const createUISlice: StateCreator<StoreState, [["zustand/devtools", never], ["zustand/persist", unknown]], [], UISlice> = (set, get) => ({
    theme: (localStorage.getItem('cc_theme') as ThemeMode) || 'dark',
    resolvedTheme: 'dark',
    toasts: [],

    setTheme: (newTheme) => {
        set({ theme: newTheme });
        localStorage.setItem('cc_theme', newTheme);
        
        // Resolve System Theme
        const resolve = () => {
            if (newTheme === 'system') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return newTheme as ResolvedTheme;
        };

        const resolved = resolve();
        set({ resolvedTheme: resolved });
        get().applyTheme(resolved);

        // Sync to user prefs if available
        const { user, updatePreferences } = get();
        if (user) {
            updatePreferences({ theme: newTheme } as any);
        }
    },

    toggleTheme: () => {
        const { resolvedTheme } = get();
        const next = resolvedTheme === 'dark' ? 'light' : 'dark';
        get().setTheme(next);
    },

    addToast: (type, title, message) => {
        const id = Math.random().toString(36).substring(7);
        set(state => ({ toasts: [...state.toasts, { id, type, title, message }] }));
        setTimeout(() => get().removeToast(id), 5000);
    },

    removeToast: (id) => {
        set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    },

    applyTheme: (resolved: ResolvedTheme) => {
        const root = document.documentElement;
        root.setAttribute('data-theme', resolved);
        root.classList.toggle('dark', resolved === 'dark');
        
        const cssVariables = generateThemeCSSVariables(resolved);
        Object.entries(cssVariables).forEach(([key, value]) => {
            root.style.setProperty(key, value as string);
        });
    },

    initUI: () => {
        const { theme } = get();
        
        // Initial Resolution
        const resolve = () => {
            if (theme === 'system') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return theme as ResolvedTheme;
        };
        
        const resolved = resolve();
        set({ resolvedTheme: resolved });

        // Listen for OS theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent) => {
            if (get().theme === 'system') {
                const newResolved = e.matches ? 'dark' : 'light';
                set({ resolvedTheme: newResolved });
                get().applyTheme(newResolved);
            }
        };
        
        mediaQuery.addEventListener('change', handler);
        get().applyTheme(resolved); // Apply on init
    }
});
