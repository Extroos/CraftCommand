
export interface UserProfile {
    email: string;
    username: string;
    role: 'Owner' | 'Admin' | 'Moderator';
    preferences: {
        accentColor: string;
        reducedMotion: boolean;
        notifications: {
            browser: boolean;
            sound: boolean;
            events: {
                onJoin: boolean;
                onCrash: boolean;
            }
        };
        terminal: {
            fontSize: number;
            fontFamily: string;
        }
    };
}

export interface ServerAdvancedFlags {
    aikarFlags?: boolean;
    proxySupport?: boolean;
    installSpark?: boolean;
    useGraalVM?: boolean;
}

export interface ServerConfig {
    id: string;
    name: string;
    version: string; // Minecraft Version
    software: 'Paper' | 'Spigot' | 'Forge' | 'Fabric' | 'Vanilla' | 'Purpur';
    port: number;
    ram: number; // GB
    javaVersion: 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21';
    autoStart?: boolean;
    status: 'ONLINE' | 'OFFLINE' | 'STARTING' | 'STOPPING' | 'RESTARTING' | 'CRASHED';
    iconUrl?: string; // Data URI
    workingDirectory: string;
    executable?: string; // Custom JAR or start script
    startTime?: number; // Timestamp
    advancedFlags?: ServerAdvancedFlags;
    onlineMode?: boolean;
}
