// Color Token System for CraftCommand
// Defines semantic color tokens that adapt to dark/light themes

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export interface ColorToken {
    dark: string;
    light: string;
}

/**
 * Semantic color tokens for the application
 * Each token has both dark and light values
 */
export const colorTokens = {
    // Background colors
    'bg-app': { dark: '#09090b', light: '#fafafa' }, // Slightly darker than pure white
    'bg-card': { dark: '#18181b', light: '#ffffff' },
    'bg-secondary': { dark: '#27272a', light: '#f4f4f5' }, // Light gray
    'bg-tertiary': { dark: '#3f3f46', light: '#e4e4e7' },
    'bg-input': { dark: '#3f3f46', light: '#ffffff' },
    'bg-hover': { dark: '#52525b', light: '#e4e4e7' },
    'bg-active': { dark: '#71717a', light: '#d4d4d8' },
    
    // Foreground/Text colors
    'fg-primary': { dark: '#fafafa', light: '#18181b' }, // Almost black for readability
    'fg-secondary': { dark: '#e4e4e7', light: '#27272a' },
    'fg-muted': { dark: '#a1a1aa', light: '#52525b' }, // Medium gray
    'fg-subtle': { dark: '#71717a', light: '#71717a' }, // Same for both
    
    // Border colors
    'border-default': { dark: 'rgba(255, 255, 255, 0.1)', light: 'rgba(0, 0, 0, 0.1)' },
    'border-strong': { dark: 'rgba(255, 255, 255, 0.2)', light: 'rgba(0, 0, 0, 0.2)' },
    'border-subtle': { dark: 'rgba(255, 255, 255, 0.05)', light: 'rgba(0, 0, 0, 0.05)' },
    
    // Accent colors (theme-aware but maintain vibrancy)
    'accent-primary': { dark: '#8b5cf6', light: '#7c3aed' },
    'accent-emerald': { dark: '#10b981', light: '#059669' },
    'accent-blue': { dark: '#3b82f6', light: '#2563eb' },
    'accent-violet': { dark: '#8b5cf6', light: '#7c3aed' },
    'accent-amber': { dark: '#f59e0b', light: '#d97706' },
    'accent-rose': { dark: '#f43f5e', light: '#e11d48' },
    'accent-cyan': { dark: '#06b6d4', light: '#0891b2' },
    
    // Status colors (consistent across themes for recognizability)
    'status-success': { dark: '#10b981', light: '#059669' },
    'status-error': { dark: '#ef4444', light: '#dc2626' },
    'status-warning': { dark: '#f59e0b', light: '#d97706' },
    'status-info': { dark: '#3b82f6', light: '#2563eb' },
    
    // Server status specific
    'status-online': { dark: '#10b981', light: '#059669' },
    'status-offline': { dark: '#ef4444', light: '#dc2626' },
    'status-starting': { dark: '#f59e0b', light: '#d97706' },
    'status-stopping': { dark: '#f59e0b', light: '#d97706' },
    
    // Special UI elements
    'shadow': { dark: 'rgba(0, 0, 0, 0.5)', light: 'rgba(0, 0, 0, 0.1)' },
    'overlay': { dark: 'rgba(0, 0, 0, 0.8)', light: 'rgba(0, 0, 0, 0.5)' },
    'glass-bg': { dark: 'rgba(24, 24, 27, 0.6)', light: 'rgba(255, 255, 255, 0.6)' },
    'glass-border': { dark: 'rgba(255, 255, 255, 0.1)', light: 'rgba(0, 0, 0, 0.1)' },
} as const;

/**
 * Get color value for current theme
 */
export function getColorValue(token: keyof typeof colorTokens, theme: ResolvedTheme): string {
    return colorTokens[token][theme];
}

/**
 * Convert hex to RGB values for CSS variables
 */
export function hexToRgb(hex: string): string {
    // Handle rgba values
    if (hex.startsWith('rgba')) {
        const match = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            return `${match[1]} ${match[2]} ${match[3]}`;
        }
    }
    
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Convert 3-digit hex to 6-digit
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `${r} ${g} ${b}`;
}

/**
 * Generate CSS variable assignments for a theme
 */
export function generateThemeCSSVariables(theme: ResolvedTheme): Record<string, string> {
    const variables: Record<string, string> = {};
    
    Object.entries(colorTokens).forEach(([token, colors]) => {
        const value = colors[theme];
        // Convert to RGB if it's a hex color
        if (value.startsWith('#')) {
            variables[`--color-${token}`] = hexToRgb(value);
        } else {
            // For rgba values, extract RGB and Alpha
            const rgbaMatch = value.match(/rgba?\((\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)(?:\s*,\s*([\d.]+))?\)/);
            if (rgbaMatch) {
                const alpha = rgbaMatch[4];
                if (alpha) {
                    variables[`--color-${token}`] = `${rgbaMatch[1]} ${rgbaMatch[2]} ${rgbaMatch[3]} / ${alpha}`;
                } else {
                    variables[`--color-${token}`] = `${rgbaMatch[1]} ${rgbaMatch[2]} ${rgbaMatch[3]}`;
                }
            }
        }
    });
    
    return variables;
}
