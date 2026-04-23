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
    type: 'Paper' | 'Fabric' | 'Forge' | 'NeoForge' | 'Modpack' | 'Vanilla' | 'Spigot' | 'Bedrock' | 'Velocity' | 'Folia' | 'Purpur';
    version: string; // Minecraft version
    build?: string; // Specific build/loader version
    icon?: string;
    recommendedRam: number;
    description: string;
    javaVersion: number;
    startupFlags?: string[]; // Recommended Aikar flags etc.
    downloadUrl?: string; // If static
    executable?: string; // Specific fallback filename (e.g. velocity.jar)
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
    knowledgeBase?: BackgroundSettings;
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
    schemaVersion?: number; // Migration Check
    permissions?: Partial<Record<string, Permission[]>>; // Deprecated: Migration target
    serverAcl?: Record<string, { allow: Permission[], deny: Permission[] }>; // Server ACL
    avatarUrl?: string;
    customRoleName?: string; // Flexible Role Labels
    preferences: {
        accentColor: string;
        reducedMotion: boolean;
        visualQuality: boolean;
        theme?: 'dark' | 'light' | 'system';  // Theme preference
        language?: string; // Preferred language (e.g., 'en', 'es', 'fr')
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
    
    // 2FA Completion
    twoFactorEnabled?: boolean;
    twoFactorSecretEncrypted?: string;
    twoFactorVerifiedAt?: number;
    twoFactorBackupCodesHashed?: string[];
    twoFactorPendingSecretEncrypted?: string;
    twoFactorPendingCreatedAt?: number;
}

export interface ServerPort {
    id: string;
    name: string;
    port: number;
    status: 'Listening' | 'Closed' | 'Provisioning' | 'Rotating';
    isImmutable?: boolean;
}

export interface DatabaseInstance {
    id: string;
    serverId: string;
    name: string;
    type: string;
    host: string;
    username: string;
    password?: string;
    createdAt?: number;
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
    automaticRepair?: boolean;
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
    javaVersion: 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21' | 'Java 25';
    autoStart?: boolean;
    status: ServerStatus;
    iconUrl?: string; // Data URI
    workingDirectory: string;
    executable?: string; // Custom JAR or start script
    startTime?: number; // Timestamp
    lifecyclePolicy?: ServerLifecyclePolicy;
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
    executionEngine?: 'native' | 'docker' | 'remote' | 'default';
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
    // Modpack / Content Metadata
    modpackId?: string;
    modpackTitle?: string;
    modpackIcon?: string;
    modpackAuthor?: string;
    modpackType?: 'mod' | 'modpack';
    
    // Connectivity & Networking
    sftpPassword?: string;
    additionalPorts?: ServerPort[];
    databases?: DatabaseInstance[];
    
    // Telemetry (Live)
    players?: number;
    cpu?: number;
    memory?: number;
    uptime?: number;
    tps?: string;
    latency?: number;
    playerList?: string[];
    hasStarted?: boolean;
}

// --- Frontend Specific Types ---

export type TabView = 'DASHBOARD' | 'CONSOLE' | 'FILES' | 'PLUGINS' | 'SCHEDULES' | 'BACKUPS' | 'PLAYERS' | 'ACCESS' | 'SETTINGS' | 'KNOWLEDGE_BASE' | 'INTEGRATIONS' | 'NETWORK' | 'MAP' | 'DATABASES' | 'SUBUSERS';

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
    INSTALLING = 'INSTALLING',
    NODE_UNREACHABLE = 'NODE_UNREACHABLE'
}

export enum ServerLifecyclePolicy {
    MANUAL = 'MANUAL',          // Only start when clicked
    ADAPTIVE = 'ADAPTIVE',      // Restore state on boot (Default)
    RESILIENT = 'RESILIENT'     // Watchdog: Always try to be ONLINE
}

export interface GlobalSettings {
    app: {
        hostMode: boolean;
        autoUpdate: boolean;
        theme: 'dark' | 'light' | 'system';
        storageProvider?: 'json' | 'sqlite';
        security?: {
            forceAdmin2FA: boolean;
            ipSessionBinding?: boolean; // Strict session protection
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
            nodeHeartbeatThresholdMs?: number;
            mirrorRemoteBackups?: boolean;
        };
        automaticRepair?: boolean;
        automaticRepairV3?: {
            driftDetectionEnabled: boolean;
            ioThrottlingThreshold: number;
            healthSnapshotInterval: number;
        };
        updateWeb?: boolean;
        professionalMode?: boolean;
        network?: NetworkConfig;
        backupLimitGB?: number;
        defaultExecutionEngine?: 'native' | 'remote' | 'docker';
        defaultLifecyclePolicy?: ServerLifecyclePolicy;
        hostPersistenceEnabled?: boolean; // If true, agent is registered for OS boot
    };
    discordBot?: DiscordBotConfig;
    webhooks?: WebhookConfig[];
    apiTokens?: ApiToken[];
    version?: string; // Programmatic version from version.json
}

export interface ApiToken {
    id: string;
    name: string;
    token: string;
    createdAt: number;
    lastUsedAt?: number;
    expiresAt?: number;
    scopes: string[];
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
    // Ban detail fields (from Minecraft banned-players.json / banned-ips.json)
    isIp?: boolean;
    banReason?: string;
    banCreated?: string;
    banExpires?: string; // 'forever' or ISO date
}

export interface CloudUploadResult {
    destination: string;
    type: string;
    success: boolean;
    remotePath?: string;
    error?: string;
    durationMs: number;
}

export interface CloudBackupDestination {
    type: 'local-copy' | 's3' | 'sftp';
    enabled: boolean;
    name: string;
    config: Record<string, any>;
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
    cloudUploads?: CloudUploadResult[];
}

export interface ScheduleAction {
    type: 'command' | 'backup' | 'restart' | 'start' | 'stop';
    command: string; // The command or detail
}

export interface ScheduleTask {
    id: string;
    serverId: string; // Added for storage consolidation
    name: string;
    command: string; // Deprecated: use actions[0] for legacy compatibility
    actions?: ScheduleAction[]; // Chained actions
    cron: string;
    isActive: boolean;
    lastRun?: number | string;
    nextRun?: string;
    runOnce?: boolean;    // One-time task: auto-disables after first execution
    runAt?: string;       // ISO date string for one-time task scheduling
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
    chatChannel?: string;
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
    | 'SERVER_CREATE' | 'SERVER_DELETE' | 'SERVER_START' | 'SERVER_STOP' | 'SERVER_STOP_GRACEFUL' | 'SERVER_STOP_CANCEL' | 'SERVER_RESTART' | 'SERVER_UPDATE'
    | 'SERVER_IMPORT_LOCAL' | 'SERVER_IMPORT_ARCHIVE'
    | 'TEMPLATE_INSTALL' | 'FILE_EDIT' | 'EULA_ACCEPT' | 'PERMISSION_DENIED'
    | 'SYSTEM_SETTINGS_UPDATE' | 'SYSTEM_CACHE_CLEAR' | 'DISCORD_RECONNECT' | 'DISCORD_SYNC'
    | 'ASSET_UPLOAD' | 'WEB_UPDATE_RUN' | 'WEB_UPDATE_ROLLBACK' | 'WEB_UPDATE_FAIL'
    | 'SERVER_IMPORT' | 'SERVER_IMPORT_UNDO' | 'AUTOMATIC_REPAIR' | 'SERVER_REPAIR' | 'SERVER_REPAIR_RESET' | 'SERVER_HEAL'
    | 'SERVER_ICON_UPDATE' | 'SERVER_RESTORE'
    | 'AUTH_2FA_ENABLE' | 'AUTH_2FA_DISABLE' | 'AUTH_2FA_SUCCESS' | 'AUTH_2FA_FAIL' | 'AUTH_2FA_RECOVERY_USE'
    | 'AUTH_2FA_BACKUP_REGEN' | 'SYSTEM_STORAGE_MIGRATE' | 'REMOTE_ACCESS_VALIDATED'
    | 'PLUGIN_INSTALL' | 'PLUGIN_UNINSTALL' | 'PLUGIN_TOGGLE' | 'PLUGIN_UPDATE' | 'PLUGIN_BULK_UPDATE' | 'PLUGIN_CONFIG_SAVE'
    | 'MAP_INSTALL' | 'MAP_VERIFY' | 'MAP_RENDER'
    | 'BACKUP_CREATE' | 'BACKUP_DELETE' | 'BACKUP_LOCK' | 'BACKUP_UNLOCK' | 'BACKUP_CLOUD_ADD' | 'BACKUP_CLOUD_REMOVE'
    | 'SCHEDULE_CREATE' | 'SCHEDULE_UPDATE' | 'SCHEDULE_DELETE'
    | 'PROXY_LINK' | 'PROXY_UNLINK' | 'DDNS_UPDATE' | 'PROXY_INSTALL'
    | 'PLAYER_KICK' | 'PLAYER_OP' | 'PLAYER_DEOP' | 'PLAYER_WHITELIST_ADD' | 'PLAYER_WHITELIST_REMOVE' | 'PLAYER_BAN' | 'PLAYER_PARDON'
    | 'FILE_UPLOAD' | 'FILE_EXTRACT' | 'FILE_MOVE' | 'FILE_COPY' | 'FILE_COMPRESS' | 'FILE_DELETE_BULK' | 'FOLDER_CREATE' | 'FILE_DOWNLOAD';

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
    motd: string;
    ram: number;
    javaVersion: 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21' | 'Java 25';
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
        type: 'UPDATE_CONFIG' | 'SWITCH_JAVA' | 'AGREE_EULA' | 'INSTALL_DEPENDENCY' | 'REPAIR_PROPERTIES' | 'CLEANUP_TELEMETRY' | 'OPTIMIZE_ARGUMENTS' | 'PURGE_GHOST' | 'RESOLVE_PORT_CONFLICT' | 'REMOVE_DUPLICATE_PLUGIN' | 'CREATE_PLUGIN_FOLDER' | 'TAKE_HEAP_SNAPSHOT' | 'RESTORE_DATA_BACKUP' | 'REINSTALL_BEDROCK' | 'RESYNC_VELOCITY_SECRET' | 'INSTALL_JAVA' | 'TRIGGER_DDNS_UPDATE' | 'REINSTALL_GEYSER' | 'REINSTALL_FLOODGATE' | 'RESYNC_CROSSPLAY_FORWARDING' | 'REASSIGN_BEDROCK_PORT' | 'CLEANUP_WORLD_LOCK' | 'FIX_JVM_ARGS' | 'ENABLE_ENTITY_PURGE' | 'RESTORE_LEVEL_DATA' | 'CLEANUP_LOGS' | 'REPAIR_PERMISSIONS' | 'FIX_IP_BINDING' | 'SMART_LOG_ROTATION' | 'ROTATE_LOGS' | 'SAFE_GC' | 'SYSTEM_MAINTENANCE' | 'REINSTALL_LOADER' | 'PERFORM_STORAGE_CLEANUP' | 'ADJUST_RAM' | 'REINSTALL_GEYSER' | 'REINSTALL_FLOODGATE' | 'RESYNC_CROSSPLAY_FORWARDING';
        payload: any;
        automaticRepair?: boolean; // If true, AutomaticRepairService can execute this automatically
    };
    connectedCrashReport?: {
        id: string;
        analysis: string;
    };
    
    // Intelligence Brain v2 Properties
    confidence?: number; // 0-100 (Optional: Brain will populate if missing)
    isRootCause?: boolean; // Primary issue
    isRepairable?: boolean; // Quick hint for UI
    suppressedBy?: string[]; // IDs of deeper issues that suppressed this
    
    // Intelligence Brain v4 (Causality)
    linkedIssueId?: string; // ID of the root cause issue this is linked to
    causalWeight?: number; // 0-1.0 probability that this is a symptom of another issue
    
    evidence?: string; // Captured log line or system metric that triggered the rule
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
    RECOVERING = 'RECOVERING',
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

// --- Ecosystem Types ---

export interface ServerProfile {
    name: string;
    description?: string;
    version: string; // Minecraft version
    software: 'Paper' | 'Spigot' | 'Forge' | 'Fabric' | 'Vanilla' | 'Purpur' | 'Bedrock' | 'Velocity' | 'Folia';
    javaVersion: 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21' | 'Java 25';
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

export interface UserSession {
    id: string; // JTI (JWT ID)
    userId: string;
    userAgent?: string;
    ipAddress?: string;
    createdAt: number;
    expiresAt: number;
    revokedAt?: number;
}
