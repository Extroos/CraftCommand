
// --- Shared / Backend Types ---

export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'VIEWER';

export type Permission = 
    | 'server.view'
    | 'server.start'
    | 'server.stop'
    | 'server.restart'
    | 'server.console.read'
    | 'server.console.write'
    | 'server.files.read'
    | 'server.files.write'
    | 'server.settings'
    | 'server.players.manage'
    | 'server.backups.manage'
    | 'users.manage'
    | 'system.remote_access.manage';

export interface ResourceConfig {
    cpuPriority: 'normal' | 'high' | 'realtime';
    maxRam: number; // in MB
}

export interface ServerTemplate {
    id: string;
    name: string;
    type: 'Paper' | 'Fabric' | 'Forge' | 'NeoForge' | 'Modpack' | 'Vanilla' | 'Spigot';
    version: string; // Minecraft version
    build?: string; // Specific build/loader version
    icon?: string;
    recommendedRam: number;
    description: string;
    javaVersion: number;
    startupFlags?: string[]; // Recommended Aikar flags etc.
    downloadUrl?: string; // If static
}

export interface UserProfile {
    id: string; // UUID
    email: string;
    username: string;
    passwordHash?: string; // Hashed with bcrypt
    role: UserRole;
    schemaVersion?: number; // Added for Phase 5 Migration Check
    permissions?: Partial<Record<string, Permission[]>>; // Deprecated: Migration target
    serverAcl?: Record<string, { allow: Permission[], deny: Permission[] }>; // Phase 5 ACL
    avatarUrl?: string;
    preferences: {
        accentColor: string;
        reducedMotion: boolean;
        theme?: 'dark' | 'light' | 'system';  // Theme preference
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
        };
        updates?: {
            check: boolean;
        };
    };
    lastLogin?: number;
    minecraftIgn?: string;
    apiKey?: string;
    password?: string; // For updates only
}

export interface ServerAdvancedFlags {
    aikarFlags?: boolean;
    installSpark?: boolean;
    useGraalVM?: boolean;
    antiDdos?: boolean;
    debugMode?: boolean;
}

export interface ServerConfig {
    id: string;
    name: string;
    folderName?: string; // Optional custom folder name
    loaderBuild?: string; // Specific build version
    version: string; // Minecraft Version
    software: 'Paper' | 'Spigot' | 'Forge' | 'Fabric' | 'Vanilla' | 'Purpur';
    port: number;
    ram: number; // GB
    cpuPriority?: 'normal' | 'high' | 'realtime';
    javaVersion: 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21';
    autoStart?: boolean;
    status: 'ONLINE' | 'OFFLINE' | 'STARTING' | 'STOPPING' | 'RESTARTING' | 'CRASHED';
    iconUrl?: string; // Data URI
    workingDirectory: string;
    executable?: string; // Custom JAR or start script
    startTime?: number; // Timestamp
    advancedFlags?: ServerAdvancedFlags;
    onlineMode?: boolean;
    maxPlayers?: number;
    ip?: string;
    motd?: string;
    discordConfig?: DiscordConfig;
    securityConfig?: SecurityConfig;
    logLocation?: string;
    executionCommand?: string;
    stopCommand?: string;
    autostartDelay?: number;
    updateUrl?: string;
    shutdownTimeout?: number;
    crashExitCodes?: string;
    logRetention?: number;
    gamemode?: string;
    difficulty?: string;
    pvp?: boolean;
    hardcore?: boolean;
    allowFlight?: boolean;
    spawnMonsters?: boolean;
    spawnAnimals?: boolean;
    levelSeed?: string;
    viewDistance?: number;
    crashDetection?: boolean;
    includeInTotal?: boolean;
    publicStatus?: boolean;
}

// --- Frontend Specific Types ---

export type TabView = 'DASHBOARD' | 'CONSOLE' | 'FILES' | 'PLUGINS' | 'SCHEDULES' | 'BACKUPS' | 'PLAYERS' | 'ACCESS' | 'SETTINGS' | 'ARCHITECT' | 'INTEGRATIONS';

export type AppState = 'LOGIN' | 'PUBLIC_STATUS' | 'SERVER_SELECTION' | 'CREATE_SERVER' | 'MANAGE_SERVER' | 'USER_MANAGEMENT' | 'USER_PROFILE' | 'GLOBAL_SETTINGS' | 'AUDIT_LOG';

export type AccentColor = 'emerald' | 'blue' | 'violet' | 'amber' | 'rose';

export interface LogEntry {
    id: string;
    timestamp: string;
    level: string;
    message: string;
}

export enum ServerStatus {
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
    STARTING = 'STARTING',
    STOPPING = 'STOPPING',
    RESTARTING = 'RESTARTING',
    CRASHED = 'CRASHED'
}

export interface GlobalSettings {
    app: {
        hostMode: boolean;
        autoUpdate: boolean;
        theme: 'dark' | 'light' | 'system';
        storageProvider?: 'json' | 'sqlite';
        https?: {
            enabled: boolean;
            keyPath: string;
            certPath: string;
            passphrase?: string;
        };
        remoteAccess?: {
            enabled: boolean;
            method?: 'vpn' | 'proxy' | 'direct' | 'cloudflare';
            externalIP?: string;
        };
    };
    discordBot?: DiscordBotConfig;
}

export interface Player {
    name: string;
    uuid?: string;
    online?: boolean;
    isOp?: boolean;
    ip?: string;
    ping?: number;
    lastSeen?: number;
    skinUrl?: string;
}

export interface Backup {
    id: string;
    name: string;
    date: number;
    size: number;
    locked?: boolean;
    description?: string;
    createdAt?: number;
    type?: 'Manual' | 'Scheduled' | 'Auto';
    filename?: string;
}

export interface ScheduleTask {
    id: string;
    name: string;
    command: string;
    cron: string;
    isActive: boolean;
    lastRun?: number | string;
    nextRun?: string;
}


export interface FileNode {
    id?: string;
    name: string;
    path: string;
    isDirectory: boolean;
    type?: string;
    size: number | string;
    lastModified?: number;
    modified?: any;
    isProtected?: boolean;
    children?: FileNode[];
}

export interface DiscordConfig {
    enabled: boolean;
    webhookUrl?: string;
    botToken?: string;
    channelId?: string;
    botName?: string;
    guildId?: string;
    avatarUrl?: string;
    events?: {
        serverStart?: boolean;
        serverStop?: boolean;
        playerJoin?: boolean;
        playerLeave?: boolean;
        onStart?: boolean;
        onStop?: boolean;
        onJoin?: boolean;
        onLeave?: boolean;
        onCrash?: boolean;
    };
}

export interface DiscordBotConfig {
    token: string;
    clientId: string;
    guildId?: string;
    enabled?: boolean;
    commandRoles?: any;
    notificationChannel?: string;
}

export interface SecurityConfig {
    firewallEnabled: boolean;
    allowedIps: string[];
    ddosProtection: boolean;
    requireOp2fa: boolean;
    forceSsl: boolean;
    regionLock: string[];
}

export interface Plugin {
    id: string;
    name: string;
    version: string;
    enabled?: boolean;
    installed?: boolean;
    category?: string;
    icon?: string;
    description?: string;
    author?: string;
    authors?: string[];
    downloads?: string;
    website?: string;
}


// --- Audit Logging Types ---

export type AuditAction = 
    | 'LOGIN_SUCCESS' | 'LOGIN_FAIL' 
    | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE'
    | 'SERVER_CREATE' | 'SERVER_DELETE' | 'SERVER_START' | 'SERVER_STOP' | 'SERVER_RESTART' | 'SERVER_UPDATE'
    | 'TEMPLATE_INSTALL' | 'FILE_EDIT' | 'EULA_ACCEPT' | 'PERMISSION_DENIED'
    | 'SYSTEM_SETTINGS_UPDATE' | 'SYSTEM_CACHE_CLEAR' | 'DISCORD_RECONNECT' | 'DISCORD_SYNC';

export interface AuditLog {
    id: string;
    timestamp: number;
    userId: string;
    userEmail?: string;
    action: AuditAction;
    resourceId?: string;
    metadata?: any;
    ip?: string;
}
