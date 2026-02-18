import { ServerCapabilities } from '../types';

export const getServerCapabilities = (software: string): ServerCapabilities => {
    const sw = software.toLowerCase();
    
    if (sw === 'bedrock') {
        return {
            softwareCategory: 'BEDROCK',
            supportsPlugins: false,
            supportsModpacks: false,
            supportsJava: false,
            supportsJvmFlags: false,
            useUdpPort: true,
            supportsSpark: false,
            supportsSchedules: true,
            supportsMap: false,
            recommendedPort: 19132,
            binaryName: process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server',
            termMod: 'Behavior Packs',
            termPlugin: 'Add-ons'
        };
    }

    if (sw === 'velocity') {
        return {
            softwareCategory: 'JAVA',
            supportsPlugins: true,
            supportsModpacks: false,
            supportsJava: true,
            supportsJvmFlags: true,
            useUdpPort: false,
            supportsSpark: false, // Spark usually for Bukkit/Forge
            supportsSchedules: true,
            supportsMap: false,
            recommendedPort: 25565,
            binaryName: 'velocity.jar',
            termMod: 'Mods',
            termPlugin: 'Plugins'
        };
    }

    // Default Java Server (Paper, Spigot, Forge, etc.)
    return {
        softwareCategory: 'JAVA',
        supportsPlugins: sw === 'paper' || sw === 'spigot' || sw === 'purpur',
        supportsModpacks: sw === 'forge' || sw === 'fabric' || sw === 'neoforge' || sw === 'modpack',
        supportsJava: true,
        supportsJvmFlags: true,
        useUdpPort: false,
        supportsSpark: true,
        supportsSchedules: true,
        supportsMap: sw === 'paper' || sw === 'spigot' || sw === 'purpur' || sw === 'forge' || sw === 'fabric',
        recommendedPort: 25565,
        binaryName: 'server.jar',
        termMod: 'Mods',
        termPlugin: 'Plugins'
    };
};
