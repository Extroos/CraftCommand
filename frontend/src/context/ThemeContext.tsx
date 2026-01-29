import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ThemeMode, ResolvedTheme, generateThemeCSSVariables, colorTokens } from '../styles/theme-tokens';
import { useUser } from './UserContext';

interface ThemeContextType {
    theme: ThemeMode;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useUser();
    const [theme, setThemeState] = useState<ThemeMode>('dark');
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

    // Load theme preference from user preferences or localStorage
    useEffect(() => {
        // Priority: user preference > localStorage > default 'dark'
        const userTheme = user?.preferences?.theme as ThemeMode | undefined;
        const savedTheme = localStorage.getItem('cc_theme') as ThemeMode | null;
        const initialTheme = userTheme || savedTheme || 'dark';
        
        setThemeState(initialTheme);
    }, [user]);

    // Resolve 'system' theme to actual dark/light based on OS preference
    useEffect(() => {
        const resolveTheme = () => {
            if (theme === 'system') {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                setResolvedTheme(isDark ? 'dark' : 'light');
            } else {
                setResolvedTheme(theme);
            }
        };

        resolveTheme();

        // Listen for system theme changes if using 'system' mode
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = (e: MediaQueryListEvent) => {
                setResolvedTheme(e.matches ? 'dark' : 'light');
            };
            
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        }
    }, [theme]);

    // Apply theme to document and generate CSS variables
    useEffect(() => {
        const root = document.documentElement;
        
        // Set data-theme attribute for CSS selectors
        root.setAttribute('data-theme', resolvedTheme);
        
        // Toggle 'dark' class for Tailwind dark mode
        root.classList.toggle('dark', resolvedTheme === 'dark');
        
        // Generate and apply CSS variables
        const cssVariables = generateThemeCSSVariables(resolvedTheme);
        Object.entries(cssVariables).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    }, [resolvedTheme]);

    // Persist theme changes
    const setTheme = (newTheme: ThemeMode) => {
        setThemeState(newTheme);
        localStorage.setItem('cc_theme', newTheme);
        
        // TODO: Sync to user preferences via API
        // if (user) {
        //     API.updateUserPreferences({ theme: newTheme });
        // }
    };

    // Toggle between dark and light (useful for quick theme switching)
    const toggleTheme = () => {
        const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
