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
        if (software !== 'Paper') {
            newData.usePurpur = false;
        }

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

    // 3. Clear Template (If switching software manually, we shouldn't keep a ghost template)
    if (software !== currentData.software) {
        newData.templateId = undefined;
        newData.modpackUrl = undefined;
    }

    return newData;
};

export const syncFormDataForModpack = (
    pack: { id: string; title: string; game_versions?: string[] },
    loader: string,
    currentData: FormData,
    bedrockVersions?: { latest: string }
): FormData => {
    // 1. Map lower-case Modrinth loader to software option
    const loaderMap: Record<string, string> = {
        'fabric': 'Fabric',
        'forge': 'Forge',
        'neoforge': 'NeoForge',
        'quilt': 'Fabric',
        'paper': 'Paper',
        'spigot': 'Paper'
    };
    const targetSoftware = loaderMap[loader] || currentData.software;

    // 2. Smart version selection (Find best match between mod and panel)
    const panelVersions = [
        "1.21.11", "1.21.10", "1.21.9", "1.21.8", "1.21.7", "1.21.6", "1.21.5", 
        "1.21.4", "1.21.3", "1.21.2", "1.21.1", "1.21", "1.20.6", "1.20.4", "1.20.1",
        "1.19.4", "1.19.2", "1.18.2", "1.17.1", "1.16.5", "1.12.2", "1.8.9", "1.8.8", "1.7.10"
    ];

    let bestVersion = currentData.version;
    if (pack.game_versions && pack.game_versions.length > 0) {
        const common = pack.game_versions.filter(v => panelVersions.includes(v));
        if (common.length > 0) {
            common.sort((a, b) => panelVersions.indexOf(a) - panelVersions.indexOf(b));
            bestVersion = common[0];
        } else {
            bestVersion = pack.game_versions[pack.game_versions.length - 1];
        }
    }

    const base = synthesizeDefaultState(targetSoftware, currentData, bedrockVersions);
    
    return {
        ...base, 
        name: pack.title, 
        software: targetSoftware,
        modpackUrl: `modrinth:${pack.id}`,
        version: bestVersion,
        javaVersion: getRecommendedJavaForVersion(bestVersion, targetSoftware) as any
    };
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
