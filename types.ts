
export interface ServerPlanResponse {
    plan: string;
}

export enum ServerStatus {
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
    STARTING = 'STARTING',
    STOPPING = 'STOPPING',
    CRASHED = 'CRASHED'
}

export interface Player {
    name: string;
    uuid: string;
    skinUrl: string;
    isOp?: boolean;
    ping?: number;
    ip?: string; // New field for IP management
    online?: boolean; // New field for runtime status
    lastSeen?: string; // ISO Date string
}

export interface LogEntry {
    id: string;
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
}

export type TabView = 'DASHBOARD' | 'CONSOLE' | 'FILES' | 'PLUGINS' | 'SCHEDULES' | 'BACKUPS' | 'PLAYERS' | 'SETTINGS' | 'ARCHITECT' | 'INTEGRATIONS';

// Added USER_PROFILE to AppState
export type AppState = 'LOGIN' | 'SERVER_SELECTION' | 'CREATE_SERVER' | 'MANAGE_SERVER' | 'PUBLIC_STATUS' | 'USER_PROFILE';

export type AccentColor = 'emerald' | 'blue' | 'violet' | 'amber' | 'rose';

export interface UserProfile {
    email: string;
    username: string; // Web username
    password?: string; // For updates only
    minecraftIgn?: string; // Linked In-Game Name
    avatarUrl?: string; // URL derived from skin
    role: 'Owner' | 'Admin' | 'Moderator';
    apiKey?: string;
    preferences: {
        accentColor: AccentColor;
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
            fontFamily: 'monospace' | 'sans-serif';
        };
        updates: {
            check: boolean; // Global update check toggle
        };
    };
}

export interface DiscordConfig {
    enabled: boolean;
    webhookUrl: string;
    botName: string;
    avatarUrl: string;
    events: {
        onStart: boolean;
        onStop: boolean;
        onJoin: boolean;
        onLeave: boolean;
        onCrash: boolean;
    };
}

export interface DiscordBotConfig {
    enabled: boolean;
    token: string;
    clientId: string;
    guildId: string;
    commandRoles: string[];
    notificationChannel: string;
}

export interface GlobalSettings {
    discordBot: DiscordBotConfig;
    app: {
        theme: 'dark' | 'light' | 'system';
        autoUpdate: boolean;
    };
}

export interface SecurityConfig {
    firewallEnabled: boolean;
    allowedIps: string[];
    ddosProtection: boolean;
    requireOp2fa: boolean;
    forceSsl: boolean;
    regionLock: string[];
}

export interface ServerConfig {
    id: string;
    name: string;
    software: 'Paper' | 'Fabric' | 'Forge' | 'Modpack' | 'Vanilla' | 'Spigot' | 'NeoForge';
    version: string;
    port: number;
    ram: number;
    status: ServerStatus;
    // New backend fields
    motd?: string;
    maxPlayers?: number;
    startTime?: number; // timestamp when server started
    stats?: {
        cpu: number;
        memory: number;
    };
    
    // Advanced Configuration
    workingDirectory?: string;
    logLocation?: string;
    executable?: string;
    javaVersion?: string;
    executionCommand?: string;
    stopCommand?: string;
    autostartDelay?: number;
    updateUrl?: string;
    ip?: string;
    shutdownTimeout?: number;
    crashExitCodes?: string;
    logRetention?: number;

    // Game Rules
    gamemode?: string;
    difficulty?: string;
    pvp?: boolean;
    hardcore?: boolean;
    allowFlight?: boolean;
    spawnMonsters?: boolean;
    spawnAnimals?: boolean;
    levelSeed?: string;
    viewDistance?: number;
    onlineMode?: boolean;

    // Automation
    autoStart?: boolean;
    crashDetection?: boolean;
    includeInTotal?: boolean;
    publicStatus?: boolean;

    // Integrations
    discordConfig?: DiscordConfig;
    
    // Security
    securityConfig?: SecurityConfig;

    // Phase 20: Optimizations
    advancedFlags?: {
        aikarFlags: boolean;
        antiDdos?: boolean;
        forceSsl?: boolean;
        debugMode?: boolean;
        proxySupport?: boolean; // Velocity/BungeeCord
        installSpark?: boolean; // Profiler
    };
}

export interface FileNode {
    id: string;
    name: string;
    type: 'folder' | 'file' | 'archive' | 'config';
    size: string;
    modified: string;
    path: string;
    isDirectory: boolean;
    children?: FileNode[];
    content?: string;
    isProtected?: boolean; // New field to prevent deletion of system files
}

export interface Plugin {
    id: string;
    name: string;
    description: string;
    author: string;
    downloads: string;
    icon?: string;
    category: 'Admin' | 'General' | 'World' | 'Economy' | 'Chat';
    installed: boolean;
    version: string;
}

export interface Backup {
    id: string;
    filename: string;
    size: number;
    createdAt: string;
    description?: string;
    locked?: boolean;
    type?: 'Manual' | 'Scheduled' | 'Auto-Save';
}

export interface ScheduleTask {
    id: string;
    name: string;
    cron: string;
    command: string;
    lastRun: string;
    nextRun: string;
    isActive: boolean;
}
