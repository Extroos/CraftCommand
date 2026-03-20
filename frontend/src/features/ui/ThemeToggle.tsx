import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '@features/ui/context/ThemeContext';
import { motion } from 'framer-motion';

export const ThemeToggle: React.FC = () => {
    const { theme, setTheme } = useTheme();

    const themes: Array<{ value: 'dark' | 'light' | 'system'; icon: React.ReactNode; label: string }> = [
        { value: 'dark', icon: <Moon size={16} />, label: 'Dark' },
        { value: 'light', icon: <Sun size={16} />, label: 'Light' },
        { value: 'system', icon: <Monitor size={16} />, label: 'System' },
    ];

    return (
        <div className="flex gap-1 p-1 bg-secondary/30 rounded-lg border border-border/50">
            {themes.map(({ value, icon, label }) => (
                <button
                    key={value}
                    onClick={() => setTheme(value)}
                    title={label}
                    className={`
                        relative px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide
                        transition-all duration-300 flex items-center justify-center
                        ${theme === value 
                            ? 'text-indigo-400' 
                            : 'text-muted-foreground hover:text-foreground'
                        }
                    `}
                >
                    {theme === value && (
                        <motion.div
                            layoutId="theme-indicator"
                            className="absolute inset-0 bg-indigo-500/10 border border-indigo-500/20 rounded-lg"
                            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                        />
                    )}
                    <span className="relative z-10 flex items-center justify-center">
                        {icon}
                    </span>
                </button>
            ))}
        </div>
    );
};
