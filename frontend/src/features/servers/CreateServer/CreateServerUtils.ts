import { FormData } from './types';

export const getRecommendedJavaForVersion = (ver: string, software?: string): string => {
    // Velocity and modern proxies generally require Java 17 or 21
    if (software === 'Velocity') return 'Java 21';

    try {
        const parts = ver.split('.');
        if (parts.length < 2) return 'Java 21';
        
        const major = parseInt(parts[0]);
        const minor = parseInt(parts[1] || '0');
        const patch = parseInt(parts[2] || '0');
        
        // 26+ or any future year-based major version
        if (major >= 26) return 'Java 21';
        
        // Legacy 1.x logic
        if (major === 1) {
            if (minor > 20 || (minor === 20 && patch >= 5)) return 'Java 21';
            if (minor >= 17) return 'Java 17';
        }
        
        // default for older or unknown
        return 'Java 8';
    } catch { return 'Java 21'; }
};

export const synthesizeDefaultState = (
    software: string, 
    currentData: FormData, 
    bedrockVersions?: { latest: string }
): FormData => {
    let finalSoftware = software;
    if (software === 'Paper' && currentData.usePurpur) {
        finalSoftware = 'Purpur';
    }
    const newData = { ...currentData, software: finalSoftware };
    
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
        if (software !== 'Paper' && software !== 'Purpur') {
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
        
        // Only reset Purpur if we are actually switching to a different BASE software category
        const currentIsPaperBase = currentData.software === 'Paper' || currentData.software === 'Purpur';
        const newIsPaperBase = software === 'Paper' || software === 'Purpur';
        
        if (!newIsPaperBase) {
            newData.usePurpur = false;
        } else if (newIsPaperBase) {
            // Ensure software field correctly reflects the toggle
            newData.software = newData.usePurpur ? 'Purpur' : 'Paper';
        }
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
    let bestVersion = currentData.version;
    if (pack.game_versions && pack.game_versions.length > 0) {
        // Try to find exact match if possible, otherwise use the first one from Modrinth
        const modrinthVersions = pack.game_versions;
        bestVersion = modrinthVersions[0]; 
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
        return { isValid: false, error: 'err_name_short' };
    }
    
    if (data.port < 1 || data.port > 65535) {
        return { isValid: false, error: 'err_invalid_port' };
    }

    if (data.ram < 0.5) {
        return { isValid: false, error: 'err_min_ram' };
    }

    return { isValid: true };
};
