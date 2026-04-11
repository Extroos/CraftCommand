import React, { useState, useEffect, useMemo } from 'react';
import { useUser } from '@features/auth/context/UserContext';
import { API } from '@core/services/api';
import { STAGGER_CONTAINER, STAGGER_ITEM, MOTION_SPRINGS } from '../../styles/motion';
import ReactMarkdown from 'react-markdown';
import { 
    Package, Cpu, Zap, ChevronRight, HelpCircle, Rocket, 
    Shield, HardDrive, Network, AlertCircle, 
    RefreshCcw, Lock, Search, Copy, Check, Info, BookOpen,
    Activity, Layers, Monitor, Terminal, Globe, Calendar,
    UserCheck, Cog
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- FEATURE-BY-FEATURE TECHNICAL MANUAL ---
const GUIDES = {
    // CHAPTER: PLATFORM CORE
    core_updates: {
        chapter: "Platform Core",
        title: "Update Service",
        icon: <RefreshCcw size={18} />,
        description: "Ed25519 verification and atomic version swapping.",
        content: `
# UpdateService (Security & Integrity)

The Update Service manages the platform's self-update lifecycle using a multi-stage cryptographic verification chain.

### 1. The Security Chain (Ed25519 & SHA256)
Updating follows a strict "Trust Nothing" protocol:
- **Signature Verification**: Every \`manifest.json\` is paired with a \`manifest.sig\`. The panel validates this signature using a local **Ed25519 Public Key** (\`keys/update_public_key.pem\`).
- **Content Hashing**: Once the manifest is trusted, the panel computes a **SHA256 hash** of the downloaded update bundle. This must match the exact string signed in the manifest. If a single bit differs, the update is aborted.

### 2. Infrastructure Integrity Gate
In distributed environments, updating the Panel could orphan older Agents.
- **Compatibility Audit**: Before installation, the service scans the **Node Registry**. It compares each remote node's \`agentVersion\` against the \`minAgentVersion\` defined in the manifest.
- **Interlock**: If a node is identified as incompatible, the update is blocked to prevent breaking the cluster connection.

### 3. Launcher Execution & Atomic Swaps
- **The Update Plan**: The service writes a \`update-plan.json\` containing the source paths and a targeted backup directory (\`../backups/v[VERSION]\`).
- **Archive Protection**: To prevent "Zip Bombs," the extraction engine enforces a hard limit of **5,000 file entries** and a **1GB total uncompressed size**.
- **Atomic Restoration**: The update is performed by a parent service runner that handles the directory swap. If the new version fails to boot within 30 seconds, the runner automatically restores the backup folder.
`
    },
    core_safety: {
        chapter: "Platform Core",
        title: "Safety & Pre-flight",
        icon: <Shield size={18} />,
        description: "SafetyService blocking checks and hardware validation.",
        content: `
# SafetyService (The Priority 0 Gate)

The Safety Service acts as a deterministic gatekeeper that must grant permission before any server process can spawn.

### 1. Pre-Flight "Log Peeking"
Unlike generic managers, the Safety Service performs proactive diagnosis before startup. It peeks at the last 300 lines of the current world's \`latest.log\`. If it detects **CRITICAL** mod mismatches or world corruption symbols from the previous run, it triggers a UI "Hard Warning" to prevent fruitless startup attempts.

### 2. Executable & Environment Validation
- **Path Mapping**: Maps software types (Spigot vs Bedrock vs Velocity) to their OS-specific binary requirements.
- **EULA Hard-Stop**: Blocks startups if \`eula.txt\` is not set to true.
- **RAM Headroom Rule**: Proactively blocks startup if the requested \`allocatedRAM\` exceeds the system's **Total Physical RAM**, preventing OS-level kernel panics.

### 3. Permission Self-Healing
On Windows hosts, the service executes \`icacls\` permissions grants before start to resolve "Access Denied" errors caused by restrictive plugin folder permissions.
`
    },

    // CHAPTER: SERVER ENGINE
    engine_lifecycle: {
        chapter: "Server Engine",
        title: "Startup & Runners",
        icon: <Zap size={18} />,
        description: "StartupManager, Native execution, and Docker orchestration.",
        content: `
# Server Lifecycle Orchestration

The execution engine follows a deterministic phase-based startup sequence (Priority 0 -> 1 -> 2) to ensure hardware safety and software compatibility.

### 1. SmartMod Pre-Boot Phase
For Fabric and Forge servers, the Startup Manager (\`StartupManagerService\`) executes a "SmartMod" pass before the JAR loads:
- **ClientMod Purge**: Automatically identifies and moves client-only mods (e.g. Sodium, Iris) to a \`_client_mods/\` folder to prevent server crashes.
- **Dependency Resolution**: Scans mod metadata and downloads missing required libraries (e.g. Fabric API) into the \`mods/\` folder automatically.

### 2. Proxy-Aware Security Bridge
When a backend server is linked to a **Velocity Proxy**, the Panel enforces a secure authentication bridge:
- **Forced Auth Override**: Automatically overrides \`online-mode=false\` in \`server.properties\` to allow the Proxy to handle authentication.
- **Forwarding Sync**: Atomically configures \`velocity: true\` and the shared secret in \`paper-global.yml\` to ensure UUIDs are passed securely.

### 3. NativeRunner (Isolation & Heuristics)
The Native Runner manages game servers as host-level child processes:
- **Zombie Discovery**: Injects \`-Dcraftcommand.id=[ID]\` into the JVM arguments to re-adopt orphaned processes after a Panel crash.
- **Top-Down Resource Aggregation**: Recursively sums CPU/RAM across the entire process tree (helper threads + parent).

### 4. JVM Optimization Tiers
- **Aikar's Suite**: Injects the full High-Performance G1GC flag set.
- **Ultra-Thread Priority**: Enables \`-XX:ThreadPriorityPolicy=1\` for kernel-level game thread priority.
`
    },

    // CHAPTER: RESILIENCY
    resiliency_diagnosis: {
        chapter: "Resiliency",
        title: "Stethoscope Diagnosis",
        icon: <Activity size={18} />,
        description: "Regex-based log parsing and crash identification.",
        content: `
# DiagnosisService (Stethoscope)

The Diagnosis Service (Codename: **Stethoscope**) performs non-destructive, regex-based log triage to identify the root cause of server failures.

### 1. Throttled System Observation
To avoid CPU overhead during mass diagnostic scans, the system fetches OS metrics (CPU load, RAM usage, Disk I/O) at a throttled rate of **5 seconds**. If a scan is triggered within 5 seconds of the last poll, the service uses cached telemetry.

### 2. Log Triage Patterns (Regex)
The engine scans the last 1,000 log lines using a deterministic dictionary of rules:
- **EULA_CHECK**: Triggers on \`/eula.txt/i\` or \`/agree to the EULA/i\`. It performs a secondary filesystem check to verify if \`eula=true\` is actually missing.
- **PORT_BIND**: Triggers on \`FAILED TO BIND\`, \`Address already in use\`, or \`BindException\`.
- **JAVA_VERSION**: Scans for \`UnsupportedClassVersionError\`. It maps Class File versions to requirements:
  - **Class 65.0** -> Java 21+ Required.
  - **Class 61.0** -> Java 17+ Required.
  - **Class 52.0** -> Java 8 Required.
- **MOD_DEPENDENCY**: High-precision mapping of **100+ common mod packages**. If it detects a crash caused by \`software.bernie.geckolib\`, it identifies **Geckolib** as missing and attempts a Modrinth cross-reference.

### 3. False Positive Suppression
As of v1.12.8, the system tracks "Resolved Rules" per server. If a fix has been applied but the server hasn't been restarted yet, any remaining error strings in the log buffer are suppressed to prevent duplicate UI alerts.
`
    },
    resiliency_repair: {
        chapter: "Resiliency",
        title: "Automatic Repair",
        icon: <Cog size={18} />,
        description: "The 3-stage crash recovery cycle and Safe Mode.",
        content: `
# AutomaticRepairService (Self-Healing)

The Repair Service orchestrates a multi-stage recovery pipeline to keep servers online without administrator intervention.

### 1. The Recovery Pipeline Stages
- **STAGE: TRIAGE**: Calls the Stethoscope service to identify a fixable root cause.
- **STAGE: SNAPSHOT**: Before applying any fix, the system triggers an atomic **Sidecar Backup** labeled "Pre-fix Snapshot" to ensure zero data loss if the fix fails.
- **STAGE: REPAIR**: Executes the specific fix handler (e.g., swapping a Java version or purging a ghost PID).
- **STAGE: VERIFY**: Restarts the server and monitors health with **Exponential Backoff** (starting at 60s, doubling per failure) to ensure long-term stability.

### 2. Specialized Action Handlers
- **Ghost Purging**: If a port is blocked, the system identifies the PID. If the process name includes \`java\`, \`bedrock_server\`, or \`server.exe\`, it is identified as a "leaked process" and purged via system-level signals.
- **RAM Safety Guard**: Before upgrading a server's RAM allocation, the system verifies available host memory. It enforces a **2GB OS Headroom**; if an upgrade would leave the host unstable, the action is aborted and "Aikar Flags" optimizations are used instead.
- **World Shadow Recovery**: If a world load failure is detected, the system attempts to restore \`level.dat\` from its shadow copy (\`level.dat_old\`) automatically.

### 3. Safe Mode Protection
To prevent infinite crash-loops, the system permits a maximum of **3 recovery attempts** within 15 minutes. Upon the 4th failure, the server is locked in **Safe Mode**. Automatic repairs are disabled, and the server status code is changed to \`SAFE_MODE\` until manual intervention occurs.

### 4. Anti-Deletion Policy
**Honest Tech Note**: CraftCommand's diagnostic engine is strictly additive. It is hard-coded to **never delete user mods**, even if they are identified as the source of a crash. Problematic mods must be removed manually by the administrator.
`
    },

    // CHAPTER: NETWORKING
    network_crossplay: {
        chapter: "Networking",
        title: "Cross-Play Service",
        icon: <Globe size={18} />,
        description: "Geyser & Floodgate automation for Bedrock support.",
        content: `
# Cross-Play (Bedrock Bridge)

The Network Fabric enables Bedrock clients to connect to Java Edition servers through automated **Geyser** and **Floodgate** injection.

### 1. Topology Awareness
The system detects and configures the bridge based on your infrastructure:
- **Standalone Topology**: Geyser and Floodgate are installed directly on the backend server.
- **Velocity Topology**: Geyser (the gate) is installed on the **Velocity Proxy**, while Floodgate (the key) is installed on **BOTH** the Proxy and the Backend. This ensures Bedrock players maintain consistent UUIDs and skins across the entire network bridge.

### 2. UDP Guard Logic
Bedrock Edition uses **UDP Port 19132** by default. Unlike TCP, UDP port conflicts often fail silently. The system uses a dedicated \`NetUtils.checkUDPPortBind\` check to verify port availability before the server starts, preventing "Hidden Offline" status on Bedrock clients.

### 3. Automated Authentication (Floodgate)
The service automatically configures \`auth-type: floodgate\` in the Geyser config. This allows Bedrock players to bypass the Mojang "Online Mode" requirement for Java servers while maintaining account security via Floodgate's identity linkage.
`
    },
    network_tunnels: {
        chapter: "Networking",
        title: "Tunnels & DDNS",
        icon: <Network size={18} />,
        description: "DuckDNS automation and Playit.gg provider integration.",
        content: `
# DuckDNS & IP Management

The platform maintains domain-to-IP parity through proactive monitoring and redundant discovery sources.

### 1. Redundant IP Triangulation
To ensure a deterministic "Public IP" discovery, the system polls three redundant upstream sources:
1. \`api.ipify.org\`
2. \`icanhazip.com\`
3. \`ifconfig.me\`
The first successful response is used, and the system maintains a **10-entry rotating history** of IP changes with millisecond timestamps.

### 2. The resolve4 Strategy
Standard DNS lookups are often poisoned by ISP or OS caches. To verify if a DuckDNS update actually propagated, the system uses a **direct resolve4** strategy. This bypasses the \`getaddrinfo\` OS cache and queries authoritative nameservers directly to provide real-time status confirmation in the UI.

### 3. Automated Syncing
If the Panel detects a public IP change, it iterates through all servers with "Monitoring Enabled" and triggers a DuckDNS API update (\`/update?domains=[DOMAIN]&token=[TOKEN]\`) within 60 seconds of the change.
`
    },

    // CHAPTER: NODES & CLUSTERING
    nodes_clustering: {
        chapter: "Nodes & Clustering",
        title: "Node Handshake",
        icon: <Cpu size={18} />,
        description: "Secure agent communication and PID sync protocol.",
        content: `
# Agent Handshake & Sync Lifecycle

The communication between the Panel and remote hosts follows a deterministic state machine to ensure infrastructure consistency.

### 1. The Secure Handshake
Agents connect via a dedicated \`/agent\` WebSocket namespace.
- **Protocol Enforcement**: Handshakes are rejected if the agent does not meet the \`MIN_PROTOCOL_VERSION\` (currently v1).
- **Authentication Middleware**: The panel verifies the UUID and Secret before permitting the connection. Stale or duplicate connections from the same nodeId are forcefully purged to prevent "Split-Brain" state.

### 2. State Synchronization (The Recovery Gate)
Upon successful authentication, the node enters the **RECOVERING** state.
- **PID Reconciliation**: The agent sends an \`agent:sync\` payload containing all currently running Server IDs.
- **Admission**: The Panel reconciles this list against the database. Only after this sync is complete does the node transition to **ONLINE** and become eligible for new deployment tasks.

### 3. Telemetry Orchestration
To optimize network bandwidth for high-traffic servers (e.g. 50+ players), the system uses **Log Batching**. Instead of sending every stdout line as a separate packet, the agent coalesces lines into a single \`agent:log-batch\` event.

### 4. Global Panel IP Push
Every \`agent:heartbeat\` ACK payload contains the Panel's **Current Public IP**. This allows remote nodes to maintain the correct "Home" callback address even if the master panel is behind a dynamic DNS/Dynamic IP setup.
`
    },

    // CHAPTER: AUTOMATION
    automation_schedules: {
        chapter: "Automation",
        title: "Task Scheduling",
        icon: <Calendar size={18} />,
        description: "Cron-based tasks and sequence chaining.",
        content: `
# ScheduleService

Automate routine maintenance with precise, cron-based power control.

### Feature Mechanics:
- **Cron Engine**: Supports standard cron expressions (e.g., \`0 4 * * *\` for 4 AM).
- **Task Chaining**: You can chain multiple actions with deliberate delays.
  - *Example*: [COMMAND: save-all] -> [WAIT: 30s] -> [BACKUP] -> [POWER: RESTART].
- **Cluster Awareness**: Schedules can target specific servers or entire nodes (e.g., "Restart all servers on Node-B").
`
    },
    automation_backups: {
        chapter: "Automation",
        title: "Backup Engine",
        icon: <HardDrive size={18} />,
        description: "Incremental ZIPs and S3/Wasabi synchronization.",
        content: `
# BackupService (Redundancy)

The backup engine ensures world data is never lost, even in a host-failure scenario.

### 1. Incremental Logic
To save space, the panel can be configured to ignore \`logs/\` and \`cache/\` directories during the compression phase.
### 2. S3 Integration
Once a backup is created locally, the system can stream it to any S3-compatible provider (S3, Wasabi, Backblaze).
### 3. Verification
After upload, the system requests the file's **ETag** (MD5 hash) from the S3 provider and compares it against the local hash to ensure zero corruption during transit.
`
    },

    // CHAPTER: IDENTITY
    identity_security: {
        chapter: "Identity",
        title: "Auth & Roles",
        icon: <UserCheck size={18} />,
        description: "JWT logic, JTI Revocation, and Role ACLs.",
        content: `
# Authentication & Security Protocol

### 1. JWT & JTI
We use JSON Web Tokens with a unique **JTI (JWT ID)**.
- **Revocation**: Admins can "Kill All Sessions". This adds the JTIs to a global blacklist in \`data/blacklist.json\`, instantly logging out every device.

### 2. Role-Based Access (ACL)
- **Owner**: Full access, including global settings and clustering.
- **Manager**: Complete control over assigned servers (Backups, Files, Power).
- **Support**: Read-only access to console and hardware metrics.

### 3. TOTP 2FA
Native support for Google Authenticator. Once enabled, the API rejects all requests without a valid \`x-2fa-token\` header.
`
    }
};

const KnowledgeBase: React.FC = () => {
    const [selectedGuide, setSelectedGuide] = useState<keyof typeof GUIDES>('core_updates');
    const [searchQuery, setSearchQuery] = useState('');
    const [isCopying, setIsCopying] = useState(false);
    const { user } = useUser();
    const [globalSettings, setGlobalSettings] = useState<any>(null);

    useEffect(() => {
        API.getGlobalSettings().then(setGlobalSettings).catch(console.error);
    }, []);

    const filteredGuides = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return (Object.entries(GUIDES) as [keyof typeof GUIDES, typeof GUIDES[keyof typeof GUIDES]][]).filter(([key, guide]) => 
            guide.title.toLowerCase().includes(query) || 
            guide.description.toLowerCase().includes(query) ||
            guide.chapter.toLowerCase().includes(query)
        );
    }, [searchQuery]);

    const chapters = useMemo(() => {
        const groups: Record<string, typeof filteredGuides> = {};
        filteredGuides.forEach((item) => {
            const chapter = item[1].chapter;
            if (!groups[chapter]) groups[chapter] = [];
            groups[chapter].push(item);
        });
        return groups;
    }, [filteredGuides]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setIsCopying(true);
        setTimeout(() => setIsCopying(false), 2000);
    };

    return (
        <motion.div 
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="show"
            className="max-w-[1600px] mx-auto space-y-6 pb-12 relative"
        >
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                
                {/* Sidebar */}
                <motion.div variants={STAGGER_ITEM} className="lg:col-span-1 space-y-4">
                    <div className={`rounded-xl border border-border transition-all duration-300 ${globalSettings?.app?.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm' } overflow-hidden sticky top-6`}>
                        
                        <div className="p-4 border-b border-border bg-muted/30">
                            <h2 className="font-bold text-xs flex items-center gap-2 text-muted-foreground mb-4">
                                <BookOpen size={14} className="text-primary" />
                                Feature Reference
                            </h2>
                            <div className="relative group">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <input 
                                    type="text" 
                                    placeholder="Search features..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-muted/50 border border-border rounded-lg py-2 pl-9 pr-4 text-xs focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                                />
                            </div>
                        </div>

                        <div className="p-2 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {Object.entries(chapters).map(([chapter, items]) => (
                                <div key={chapter} className="space-y-1">
                                    <h3 className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-60">
                                        {chapter}
                                    </h3>
                                    {items.map(([key, guide]) => (
                                        <button
                                            key={key}
                                            onClick={() => setSelectedGuide(key as keyof typeof GUIDES)}
                                            className={`w-full flex items-start gap-3 p-3 rounded-lg text-sm transition-all text-left group ${
                                                selectedGuide === key 
                                                ? 'bg-secondary text-foreground shadow-sm' 
                                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                            }`}
                                        >
                                            <div className={`mt-0.5 transition-colors ${selectedGuide === key ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                                {guide.icon}
                                            </div>
                                            <div>
                                                <span className={`font-bold block text-[11px] tracking-tight ${selectedGuide === key ? 'text-foreground' : 'text-muted-foreground'}`}>{guide.title}</span>
                                                <span className="text-[9px] text-muted-foreground line-clamp-1 opacity-70 leading-snug mt-0.5 font-medium tracking-tight">{guide.description}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Content Area */}
                <motion.div variants={STAGGER_ITEM} className="lg:col-span-3 min-h-[700px] flex flex-col">
                    <AnimatePresence mode="wait">
                        <motion.div 
                            key={selectedGuide}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={MOTION_SPRINGS}
                            className={`rounded-xl border border-border transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card text-card-foreground shadow-sm'} flex flex-col overflow-hidden h-full`}
                        >
                            <div className="border-b border-border px-8 py-6 bg-muted/10 relative overflow-hidden">
                                <div className="absolute right-[-20px] top-[-20px] opacity-[0.03] text-foreground transform rotate-12 scale-[4]">
                                    {GUIDES[selectedGuide].icon}
                                </div>

                                <div className="flex items-center gap-2 text-muted-foreground text-[9px] mb-2 font-bold uppercase tracking-widest opacity-60 z-10">
                                    <span>{GUIDES[selectedGuide].chapter}</span>
                                    <ChevronRight size={10} />
                                    <span className="text-primary">{GUIDES[selectedGuide].title}</span>
                                </div>
                                <h2 className="text-2xl font-bold tracking-tighter text-foreground z-10">{GUIDES[selectedGuide].title}</h2>
                                <p className="text-muted-foreground mt-2 text-sm font-medium opacity-80 leading-relaxed max-w-2xl z-10">{GUIDES[selectedGuide].description}</p>
                            </div>
                            
                            <div className="flex-1 p-8 md:p-10 overflow-y-auto bg-card/10">
                                <div className="markdown-body max-w-3xl custom-markdown stabilized-markdown mx-auto">
                                    <ReactMarkdown
                                        components={{
                                            code({node, className, children, ...props}) {
                                                const match = /language-(\w+)/.exec(className || '');
                                                return match ? (
                                                    <div className="relative group/code my-6">
                                                        <div className="absolute right-3 top-3 z-20">
                                                            <button 
                                                                onClick={() => copyToClipboard(String(children))}
                                                                className="p-1 rounded-md bg-muted/80 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all opacity-0 group-hover/code:opacity-100"
                                                                title="Copy Code"
                                                            >
                                                                {isCopying ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                                            </button>
                                                        </div>
                                                        <div className="absolute -top-3 left-4 px-2 py-0.5 bg-muted border border-border text-[8px] font-bold uppercase tracking-widest text-muted-foreground rounded transition-opacity">
                                                            {match[1]}
                                                        </div>
                                                        <pre className="p-4 pt-6 rounded-lg bg-muted/30 border border-border font-mono text-[11px] leading-normal overflow-x-auto">
                                                            {children}
                                                        </pre>
                                                    </div>
                                                ) : (
                                                    <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary text-[11px]">
                                                        {children}
                                                    </code>
                                                )
                                            }
                                        }}
                                    >
                                        {GUIDES[selectedGuide].content}
                                    </ReactMarkdown>
                                </div>
                            </div>

                            <div className="p-4 border-t border-border bg-muted/5 flex items-center justify-between">
                                <div className="flex items-center gap-3 text-muted-foreground/60 text-[9px] font-bold uppercase tracking-widest">
                                    <Info size={12} className="text-primary/70" />
                                    <span>Branch ID: 8fe59810-769e-4290-ada8...</span>
                                </div>
                                <div className="text-[9px] font-bold text-muted-foreground opacity-40">
                                    Module Reference: v1.13.0 (Technical)
                                </div>
                            </div>

                        </motion.div>
                    </AnimatePresence>
                </motion.div>
            </div>
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--primary), 0.1); border-radius: 10px; }
                
                .stabilized-markdown h1 { font-size: 1.5rem; font-weight: 800; color: hsl(var(--foreground)); margin-bottom: 1.5rem; letter-spacing: -0.0125em; border-bottom: 1px solid hsl(var(--border)/0.5); padding-bottom: 0.5rem; }
                .stabilized-markdown h2 { font-size: 1.15rem; font-weight: 700; color: hsl(var(--foreground)); margin-top: 2rem; margin-bottom: 0.75rem; }
                .stabilized-markdown h3 { font-size: 1rem; font-weight: 700; color: hsl(var(--primary)); margin-top: 1.75rem; margin-bottom: 0.5rem; }
                .stabilized-markdown p { font-size: 13px; line-height: 1.6; margin-bottom: 1rem; color: hsl(var(--muted-foreground)); font-weight: 500; }
                .stabilized-markdown ul, .stabilized-markdown ol { margin-bottom: 1rem; padding-left: 1.25rem; color: hsl(var(--muted-foreground)); }
                .stabilized-markdown li { margin-bottom: 0.5rem; line-height: 1.6; font-weight: 500; font-size: 13px; }
                .stabilized-markdown li strong { color: hsl(var(--foreground)); font-weight: 700; }
                .stabilized-markdown blockquote { border-left: 3px solid hsl(var(--primary)); padding: 1rem; background: hsla(var(--primary), 0.03); color: hsl(var(--foreground)); border-radius: 0 0.5rem 0.5rem 0; margin: 1.5rem 0; font-weight: 600; font-style: normal; font-size: 13px; }
                .stabilized-markdown table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 12px; border: 1px solid hsl(var(--border)); border-radius: 0.5rem; overflow: hidden; }
                .stabilized-markdown th { background: hsl(var(--muted)/0.3); padding: 0.75rem; text-align: left; font-weight: 700; border-bottom: 2px solid hsl(var(--border)); }
                .stabilized-markdown td { padding: 0.75rem; border-bottom: 1px solid hsl(var(--border)); color: hsl(var(--muted-foreground)); font-weight: 500; }
            `}</style>
        </motion.div>
    );
};

export default KnowledgeBase;
