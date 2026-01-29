import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { motion } from 'framer-motion';

export const ThemeToggle: React.FC = () => {
    const { theme, setTheme } = useTheme();

    const themes: Array<{ value: 'dark' | 'light' | 'system'; icon: React.ReactNode; label: string }> = [
        { value: 'dark', icon: <Moon size={16} />, label: 'Dark' },
        { value: 'light', icon: <Sun size={16} />, label: 'Light' },
        { value: 'system', icon: <Monitor size={16} />, label: 'System' },
    ];

    return (
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg border border-border/50">
            {themes.map(({ value, icon, label }) => (
                <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`
                        relative px-3 py-1.5 rounded-md text-xs font-medium
                        transition-all duration-200 flex items-center gap-1.5
                        ${theme === value 
                            ? 'text-primary' 
                            : 'text-muted-foreground hover:text-foreground'
                        }
                    `}
                >
                    {theme === value && (
                        <motion.div
                            layoutId="theme-indicator"
                            className="absolute inset-0 bg-background rounded-md shadow-sm"
                            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                        />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                        {icon}
                        {label}
                    </span>
                </button>
            ))}
        </div>
    );
};
