import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ThemeMode, ResolvedTheme, generateThemeCSSVariables, colorTokens } from '../../../styles/theme-tokens';
import { useStore } from '@/store';
import { useUser } from '../../auth/context/UserContext';

interface ThemeContextType {
    theme: ThemeMode;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
    const store = useStore();
    return { 
        theme: store.theme, 
        resolvedTheme: store.resolvedTheme, 
        setTheme: store.setTheme, 
        toggleTheme: store.toggleTheme 
    };
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const store = useStore();

    useEffect(() => {
        store.initUI();
    }, []);

    return <>{children}</>;
};
