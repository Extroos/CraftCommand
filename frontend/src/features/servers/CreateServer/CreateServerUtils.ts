import { FormData } from './types';

export const getRecommendedJavaForVersion = (ver: string, software?: string): string => {
    // Velocity and modern proxies generally require Java 17 or 21
    if (software === 'Velocity') return 'Java 21';

    try {
        const parts = ver.split('.');
        if (parts.length < 2) return 'Java 21';
        
        const major = parseInt(parts[1]);
        const minor = parseInt(parts[2] || '0');
        
        if (major >= 21) return 'Java 21'; // 1.21+
        if (major === 20) return minor >= 5 ? 'Java 21' : 'Java 17'; // 1.20.5+ -> 21
        if (major >= 17) return 'Java 17'; // 1.17+ -> 17
        return 'Java 8'; // 1.16.5 and below
    } catch { return 'Java 21'; }
};

export const synthesizeDefaultState = (
    software: string, 
    currentData: FormData, 
    bedrockVersions?: { latest: string }
): FormData => {
    const newData = { ...currentData, software };
    
    // 1. Reset Versions & Critical Identifiers
    if (software === 'Velocity') {
        newData.version = '3.4.0-SNAPSHOT';
        newData.ram = Math.max(newData.ram, 1);
        newData.forwardingMode = newData.forwardingMode || 'modern';
        newData.usePurpur = false;
        newData.templateId = undefined;
    } else if (software === 'Bedrock') {
        newData.version = bedrockVersions?.latest || '1.26.1.1';
        newData.port = newData.port === 25565 ? 19132 : newData.port;
        newData.ram = Math.max(newData.ram, 1);
        newData.usePurpur = false;
        newData.templateId = undefined;
    } else {
        // Game Server (Java)
        if (newData.version.includes('SNAPSHOT') || newData.version.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            newData.version = '1.21.11';
        }
        if (newData.port === 19132) newData.port = 25565;
        
        // RAM Adjustments
        if (['Forge', 'NeoForge', 'Modpack'].includes(software)) {
            if (newData.ram < 4) newData.ram = 4;
        } else if (newData.ram < 2) {
            newData.ram = 2;
        }
    }

    // 2. Synchronize Java Version
    newData.javaVersion = getRecommendedJavaForVersion(newData.version, software) as any;

    return newData;
};

export const validateFormData = (data: FormData): { isValid: boolean; error?: string } => {
    if (!data.name || data.name.trim().length < 3) {
        return { isValid: false, error: 'Instance name must be at least 3 characters.' };
    }
    
    if (data.port < 1 || data.port > 65535) {
        return { isValid: false, error: 'Invalid port number (1-65535).' };
    }

    if (data.ram < 0.5) {
        return { isValid: false, error: 'Minimum RAM is 0.5 GB.' };
    }

    return { isValid: true };
};
