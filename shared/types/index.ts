// --- Shared / Backend Types ---
import { NetworkConfig } from './network';
import { UserRole, Permission } from '../constants/roles';
export type { UserRole, Permission };

export interface ResourceConfig {
    cpuPriority: 'normal' | 'high' | 'realtime';
    maxRam: number; // in MB
}

export interface ServerTemplate {
    id: string;
    name: string;
    type: 'Paper' | 'Fabric' | 'Forge' | 'NeoForge' | 'Modpack' | 'Vanilla' | 'Spigot' | 'Bedrock' | 'Velocity' | 'Folia';
    version: string; // Minecraft version
    build?: string; // Specific build/loader version
    icon?: string;
    recommendedRam: number;
    description: string;
    javaVersion: number;
    startupFlags?: string[]; // Recommended Aikar flags etc.
    downloadUrl?: string; // If static
}

export interface BackgroundSettings {
    enabled: boolean;
    url: string;
    opacity: number; // 0.0 to 1.0
    blur: number; // pixels
}

export interface CustomBackgrounds {
    global?: BackgroundSettings;
    login?: BackgroundSettings;
    serverSelection?: BackgroundSettings;
    dashboard?: BackgroundSettings;
    console?: BackgroundSettings;
    files?: BackgroundSettings;
    plugins?: BackgroundSettings;
    schedules?: BackgroundSettings;
    backups?: BackgroundSettings;
    players?: BackgroundSettings;
    access?: BackgroundSettings;
    settings?: BackgroundSettings;
    architect?: BackgroundSettings;
    integrations?: BackgroundSettings;
    users?: BackgroundSettings;
    globalSettings?: BackgroundSettings;
    auditLog?: BackgroundSettings;
    status?: BackgroundSettings;
    operations?: BackgroundSettings;
    profile?: BackgroundSettings;
    network?: BackgroundSettings;
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
    customRoleName?: string; // Phase 6: Flexible Role Labels
    preferences: {
        accentColor: string;
        reducedMotion: boolean;
        visualQuality: boolean;
        theme?: 'dark' | 'light' | 'system';  // Theme preference
        backgrounds?: CustomBackgrounds;
        dashboardLayout?: any; // Stores react-grid-layout state
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
    
    // Phase 64: 2FA Completion
    twoFactorEnabled?: boolean;
    twoFactorSecretEncrypted?: string;
    twoFactorVerifiedAt?: number;
    twoFactorBackupCodesHashed?: string[];
    twoFactorPendingSecretEncrypted?: string;
    twoFactorPendingCreatedAt?: number;
}

export interface ServerAdvancedFlags {
    aikarFlags?: boolean;
    installSpark?: boolean;
    useGraalVM?: boolean;
    antiDdos?: boolean;
    debugMode?: boolean;
    // Pro-Grade Technical
    gcEngine?: 'G1GC' | 'ZGC' | 'Shenandoah' | 'Parallel';
    socketBuffer?: number;
    compressionThreshold?: number;
    autoHealing?: boolean;
    healthCheckInterval?: number;
    retryPattern?: string;
    threadPriority?: 'low' | 'normal' | 'high' | 'ultra';
    startDelay?: number;
    killTimeout?: number;
    // Bedrock Specific
    tickDistance?: number;
    contentLog?: boolean;
    compressionLimit?: number;
}

export interface ServerConfig {
    id: string;
    name: string;
    folderName?: string; // Optional custom folder name
    loaderBuild?: string; // Specific build version
    version: string; // Minecraft Version
    software: 'Paper' | 'Spigot' | 'Forge' | 'Fabric' | 'Vanilla' | 'Purpur' | 'Bedrock' | 'Velocity' | 'Folia';
    isExternal?: boolean; // If true, files are owned by user, not panel
    port: number;
    ram: number; // GB
    cpuPriority?: 'normal' | 'high' | 'realtime';
    javaVersion: 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21';
    autoStart?: boolean;
    status: ServerStatus;
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
    executionEngine?: 'native' | 'docker' | 'remote';
    dockerImage?: string;
    nodeId?: string; // If set, this server runs on a remote node
    backupConfig?: {
        worldOnly: boolean; // Default: false (backup everything)
        customWorldPaths?: string[]; // Optional: specify custom world folder names
    };
    needsRestart?: boolean; // Track if plugin/config changes require a reboot
    collabSettings?: CollabSettings; // Per-server collaboration role gates
    network?: NetworkConfig;
    linkedProxyId?: string; // Explicit tracker for parent proxy (Velocity)
    lastSyncTime?: number;  // Last Unix timestamp for configuration enforcement
    crossPlay?: {
        enabled: boolean;
        bedrockPort: number;      // Default 19132
        geyserMode: 'plugin' | 'standalone';
        topology: 'standalone' | 'velocity';
        installedAt?: number;     // Timestamp of initial setup
    };
}

// --- Frontend Specific Types ---

export type TabView = 'DASHBOARD' | 'CONSOLE' | 'FILES' | 'PLUGINS' | 'SCHEDULES' | 'BACKUPS' | 'PLAYERS' | 'ACCESS' | 'SETTINGS' | 'ARCHITECT' | 'INTEGRATIONS' | 'NETWORK' | 'MAP';

export type AppState = 'LOGIN' | 'PUBLIC_STATUS' | 'SERVER_SELECTION' | 'CREATE_SERVER' | 'MANAGE_SERVER' | 'USER_MANAGEMENT' | 'USER_PROFILE' | 'GLOBAL_SETTINGS' | 'AUDIT_LOG' | 'GLOBAL_OPERATIONS';

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
    CRASHED = 'CRASHED',
    RECOVERING = 'RECOVERING',
    SAFE_MODE = 'SAFE_MODE',
    UNMANAGED = 'UNMANAGED',
    INSTALLING = 'INSTALLING'
}

export interface GlobalSettings {
    app: {
        hostMode: boolean;
        autoUpdate: boolean;
        theme: 'dark' | 'light' | 'system';
        storageProvider?: 'json' | 'sqlite';
        security?: {
            forceAdmin2FA: boolean;
        };
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
        dockerEnabled?: boolean;
        distributedNodes?: {
            enabled: boolean;
        };
        autoHealing?: boolean;
        autoHealingV3?: {
            driftDetectionEnabled: boolean;
            ioThrottlingThreshold: number;
            healthSnapshotInterval: number;
        };
        updateWeb?: boolean;
        network?: NetworkConfig;
    };
    discordBot?: DiscordBotConfig;
    version?: string; // Programmatic version from version.json
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
    scope?: 'full' | 'world'; // Track if this was a world-only backup
}

export interface ScheduleTask {
    id: string;
    serverId: string; // Added for storage consolidation
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
    | 'SERVER_IMPORT_LOCAL' | 'SERVER_IMPORT_ARCHIVE'
    | 'TEMPLATE_INSTALL' | 'FILE_EDIT' | 'EULA_ACCEPT' | 'PERMISSION_DENIED'
    | 'SYSTEM_SETTINGS_UPDATE' | 'SYSTEM_CACHE_CLEAR' | 'DISCORD_RECONNECT' | 'DISCORD_SYNC'
    | 'ASSET_UPLOAD' | 'WEB_UPDATE_RUN' | 'WEB_UPDATE_ROLLBACK' | 'WEB_UPDATE_FAIL'
    | 'SERVER_IMPORT' | 'SERVER_IMPORT_UNDO' | 'AUTO_HEAL' | 'SERVER_HEAL'
    | 'SERVER_ICON_UPDATE'
    | 'AUTH_2FA_ENABLE' | 'AUTH_2FA_DISABLE' | 'AUTH_2FA_SUCCESS' | 'AUTH_2FA_FAIL' | 'AUTH_2FA_RECOVERY_USE';

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

export interface ImportAnalysis {
    software: 'Paper' | 'Spigot' | 'Forge' | 'Fabric' | 'Vanilla' | 'Purpur' | 'Bedrock' | 'Velocity' | 'Folia';
    version: string;
    executable: string;
    port: number;
    ram: number;
    javaVersion: 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21';
    isModded: boolean;
    portConflict?: { port: number; process?: string };
    javaMissing?: boolean;
    loaderMismatch?: boolean;
    suggestions: string[];
    pterodactylDetected: boolean;
}

// --- Diagnosis Types (Synced) ---

export interface DiagnosisResult {
    id: string; // Unique ID for this specific diagnosis instance
    ruleId: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    title: string;
    explanation: string;
    recommendation: string;
    action?: {
        type: 'UPDATE_CONFIG' | 'SWITCH_JAVA' | 'AGREE_EULA' | 'INSTALL_DEPENDENCY' | 'REPAIR_PROPERTIES' | 'CLEANUP_TELEMETRY' | 'OPTIMIZE_ARGUMENTS' | 'PURGE_GHOST' | 'RESOLVE_PORT_CONFLICT' | 'REMOVE_DUPLICATE_PLUGIN' | 'CREATE_PLUGIN_FOLDER' | 'TAKE_HEAP_SNAPSHOT' | 'RESTORE_DATA_BACKUP' | 'REINSTALL_BEDROCK' | 'RESYNC_VELOCITY_SECRET' | 'INSTALL_JAVA' | 'TRIGGER_DDNS_UPDATE' | 'REINSTALL_GEYSER' | 'REINSTALL_FLOODGATE' | 'RESYNC_CROSSPLAY_FORWARDING' | 'REASSIGN_BEDROCK_PORT' | 'CLEANUP_WORLD_LOCK' | 'FIX_JVM_ARGS' | 'ENABLE_ENTITY_PURGE' | 'RESTORE_LEVEL_DATA' | 'REMOVE_MOD';
        payload: any;
        autoHeal?: boolean; // If true, AutoHealingService can execute this automatically
    };
    connectedCrashReport?: {
        id: string;
        analysis: string;
    };
    
    // Intelligence Brain v2 Properties
    confidence?: number; // 0-100 (Optional: Brain will populate if missing)
    isRootCause?: boolean; // Primary issue
    isHealable?: boolean; // Quick hint for UI
    suppressedBy?: string[]; // IDs of deeper issues that suppressed this
    
    timestamp: number;
}

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface Notification {
    id: string;
    userId: string; // 'ALL', 'ADMIN', or UUID
    type: NotificationType;
    title: string;
    message: string;
    read: boolean;
    createdAt: number;
    metadata?: any;
    link?: string;
    actionLabel?: string; // Custom label for the link button (e.g. "Install", "View")
    dismissible?: boolean; // If false, cannot be deleted by user
}

export type ConnectivityMethod = 'vpn' | 'proxy' | 'direct' | 'cloudflare';

export interface ConnectionStatus {
    enabled: boolean;
    method?: ConnectivityMethod;
    externalIP?: string;
    localIP?: string;
    bindAddress: string;
    error?: string;
    details?: any; // Provider specific details (e.g. tunnel URL)
}

// --- Plugin Marketplace Types ---

export type PluginSource = 'spiget' | 'modrinth' | 'hangar' | 'manual' | 'direct';
export type PluginPlatform = 'bukkit' | 'spigot' | 'paper' | 'purpur' | 'forge' | 'fabric';

export interface MarketplacePlugin {
    sourceId: string;       // ID on the external platform
    source: PluginSource;
    name: string;
    slug: string;
    description: string;
    author: string;
    iconUrl?: string;
    downloads: number;
    rating?: number;
    category: string;
    platforms: PluginPlatform[];
    latestVersion: string;
    latestGameVersions: string[];
    externalUrl?: string;
    updatedAt: number;
}

export interface InstalledPlugin {
    id: string;             // Internal UUID
    serverId: string;
    sourceId?: string;
    source: PluginSource;
    name: string;
    fileName: string;       // e.g. "EssentialsX-2.20.1.jar"
    version: string;
    installedAt: number;
    updatedAt?: number;
    autoUpdate: boolean;    // Opt-in only, never forced
    enabled: boolean;       // false = renamed to .jar.disabled
    
    // Rich Metadata (Synced from Marketplace)
    description?: string;
    author?: string;
    iconUrl?: string;
    category?: string;
    externalUrl?: string;
    dependencies?: string[];
}

export interface PluginSearchQuery {
    query: string;
    category?: string;
    platform?: PluginPlatform;
    gameVersion?: string;
    source?: PluginSource;
    page?: number;
    limit?: number;
    sort?: 'downloads' | 'updated' | 'name' | 'rating';
}

export interface PluginSearchResult {
    plugins: MarketplacePlugin[];
    total: number;
    page: number;
    pages: number;
}

export interface PluginUpdateInfo {
    pluginId: string;
    name: string;
    currentVersion: string;
    latestVersion: string;
    source: PluginSource;
    sourceId: string;
}

// --- Collaboration Types ---

export interface PresenceEntry {
    userId: string;
    username: string;
    role: UserRole;
    avatar?: string;
    joinedAt: number;
    activeView: string;   // 'console' | 'dashboard' | 'files' | 'plugins' | etc.
}

export type ActivityAction =
    | 'SERVER_START' | 'SERVER_STOP' | 'SERVER_RESTART'
    | 'COMMAND_SENT' | 'PLUGIN_INSTALLED' | 'PLUGIN_REMOVED' | 'PLUGIN_TOGGLED'
    | 'BACKUP_CREATED' | 'BACKUP_RESTORED'
    | 'CONFIG_CHANGED' | 'FILE_EDITED' | 'PLAYER_KICKED' | 'PLAYER_BANNED'
    | 'USER_JOINED_PANEL' | 'USER_LEFT_PANEL'
    | 'SCHEDULE_CREATED' | 'SCHEDULE_DELETED';

export interface ActivityEvent {
    id: string;
    serverId: string;
    userId: string;
    username: string;
    action: ActivityAction;
    detail: string;
    metadata?: Record<string, any>;
    visibility: UserRole;   // Minimum role to see this event
    timestamp: number;
}

export interface ChatMessage {
    id: string;
    serverId: string;
    userId: string;
    username: string;
    role: UserRole;
    content: string;
    avatar?: string;
    timestamp: number;
    type: 'message' | 'system' | 'whisper';
}

/**
 * Per-server collaboration settings.
 * The OWNER/ADMIN can configure minimum role requirements for each feature.
 * This is stored on the ServerConfig for per-server control.
 */
export interface CollabSettings {
    activityFeed: {
        enabled: boolean;
        minRole: UserRole;       // Who can SEE the activity feed (default: 'VIEWER')
    };
    chat: {
        enabled: boolean;
        minRole: UserRole;       // Who can READ chat (default: 'VIEWER')
        minSendRole: UserRole;   // Who can SEND messages (default: 'MANAGER')
    };
    presence: {
        enabled: boolean;
        minRole: UserRole;       // Who can see presence indicators (default: 'VIEWER')
    };
    console: {
        readRole: UserRole;      // Who can READ console output (default: 'VIEWER')
        writeRole: UserRole;     // Who can SEND commands (default: 'MANAGER')
    };
}

// --- Distributed Node Types ---

export enum NodeStatus {
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
    DEGRADED = 'DEGRADED',
    ENROLLING = 'ENROLLING',
    REMOVED = 'REMOVED'
}

export interface NodeHealth {
    cpu: number;           // 0-100 percentage
    memoryUsed: number;    // bytes
    memoryTotal: number;   // bytes
    diskUsed: number;      // bytes
    diskTotal: number;     // bytes
    serverCount: number;   // active servers on this node
    uptime: number;        // seconds
}

export interface NodeCapabilities {
    java?: string;         // e.g. "17.0.2"
    docker?: boolean;      // Is Docker engine available?
    git?: boolean;         // Is git installed?
    node?: string;         // Node.js version
    os?: string;           // e.g. "Linux 5.10" or "Windows 10"
}

export interface NodeInfo {
    id: string;            // UUID
    name: string;          // Human-readable label (e.g. "Gaming Rig", "VPS-01")
    host: string;          // IP or hostname
    port: number;          // Agent port
    status: NodeStatus;
    health?: NodeHealth;
    capabilities?: NodeCapabilities;
    protocolVersion: string; // Must match panel version
    enrolledAt: number;    // Timestamp
    lastHeartbeat: number; // Timestamp
    labels?: string[];     // Tags for scheduling (e.g. "high-ram", "ssd")
    agentVersion?: string; // Version of the node agent binary
    enrollmentSecret?: string; // Secret used during pre-enrollment
    enrollmentToken?: string;  // Short-lived token for download authentication
}

// --- Ecosystem Types (Phase 17) ---

export interface ServerProfile {
    name: string;
    description?: string;
    version: string; // Minecraft version
    software: 'Paper' | 'Spigot' | 'Forge' | 'Fabric' | 'Vanilla' | 'Purpur' | 'Bedrock' | 'Velocity' | 'Folia';
    javaVersion: 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21';
    ram: number;
    port?: number;
    advancedFlags?: ServerAdvancedFlags;
    modpackUrl?: string; // If applicable
    plugins?: {
        name: string;
        sourceUrl?: string; // Optional reference
    }[];
    platformVersion: string; // CraftCommand version exported from
}

export type WebhookTrigger = 'SERVER_START' | 'SERVER_STOP' | 'SERVER_CRASH' | 'BACKUP_COMPLETE' | 'PLAYER_JOIN' | 'PLAYER_LEAVE';

export interface WebhookConfig {
    id: string;
    url: string;
    name: string;
    enabled: boolean;
    triggers: WebhookTrigger[];
    secret?: string; // For signature validation
    failureCount: number;
    serverId?: string; // Target server filter
}

export interface ServerCapabilities {
    softwareCategory: 'JAVA' | 'BEDROCK' | 'OTHER';
    supportsPlugins: boolean;
    supportsModpacks: boolean;
    supportsJava: boolean;
    supportsJvmFlags: boolean;
    useUdpPort: boolean;
    supportsSpark: boolean;
    supportsSchedules: boolean;
    supportsMap: boolean;
    recommendedPort: number;
    binaryName: string; // e.g. 'bedrock_server.exe' or 'server.jar'
    termMod: string; // 'Mods' vs 'Behavior Packs'
    termPlugin: string; // 'Plugins' vs 'Add-ons'
}

export interface MapStatus {
    installed: boolean;
    port: number | null;
    verified: boolean;
    error?: string;
    internalUrl?: string;
}

export interface ConfigMismatch {
    setting: string;
    diskValue: any;
    dbValue: any;
    severity: 'low' | 'medium' | 'high';
}

export interface SyncReport {
    synchronized: boolean;
    mismatches: ConfigMismatch[];
    eulaAccepted: boolean;
}
