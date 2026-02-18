import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BackgroundSettings } from '@shared/types';

interface PageBackgroundProps {
    settings?: BackgroundSettings;
}

import { useUser } from '@features/auth/context/UserContext';
import { useTheme } from '@features/ui/context/ThemeContext';

const PageBackground: React.FC<PageBackgroundProps> = ({ settings }) => {
    const { user } = useUser();
    const { resolvedTheme } = useTheme();
    const [loadedUrl, setLoadedUrl] = React.useState<string | null>(null);
    const [activeSettings, setActiveSettings] = React.useState<BackgroundSettings | null>(null);

    React.useEffect(() => {
        if (!settings || !settings.enabled || !settings.url) {
            setLoadedUrl(null);
            setActiveSettings(null);
            return;
        }

        // If it's the same URL, just update the settings (opacity/blur)
        if (settings.url === loadedUrl) {
            setActiveSettings(settings);
            return;
        }

        // Preload logic
        const img = new Image();
        img.src = settings.url;
        img.onload = () => {
            setLoadedUrl(settings.url!);
            setActiveSettings(settings);
        };
        img.onerror = () => {
            console.warn('[PageBackground] Preload failed, showing anyway:', settings.url);
            setLoadedUrl(settings.url!);
            setActiveSettings(settings);
        };
    }, [settings?.url, settings?.enabled]);

    // Absolute Reset: Disable all background images and effects
    return null;
}

export default PageBackground;
