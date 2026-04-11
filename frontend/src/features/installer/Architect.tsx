
import React, { useState, useEffect } from 'react';
import { ServerTemplate, GlobalSettings } from '@shared/types';
import { useUser } from '@features/auth/context/UserContext';
import { API } from '@core/services/api';
import { STAGGER_CONTAINER, STAGGER_ITEM, MOTION_SPRINGS } from '../../styles/motion';
import ReactMarkdown from 'react-markdown';
import { Package, Cpu, LayoutDashboard, Zap, ChevronRight, Info, HelpCircle, Rocket, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const GUIDES = {
    deployment: {
        title: "Running for Real",
        icon: <Rocket size={18} />,
        description: "What do I need to actually host servers? (Docker, Backend, etc)",
        content: `
# Running This For Real: What's Next?

You are currently viewing the **CraftCommand Web Interface**. To turn this into a fully functional server manager that runs actual Minecraft instances on your machine or a VPS, specific infrastructure is required.

## 1. The "Backend" Problem
Browsers cannot directly launch \`java -jar server.jar\` on your computer due to security sandboxing.
*   **For Local Use:** This website needs to be wrapped in **Electron** or **Tauri**. These technologies allow the web code (React) to execute system commands (like starting Java) on your computer.
*   **For Remote Hosting:** You need a dedicated backend service (written in Node.js, Go, or Rust) running on the server that listens for commands from this dashboard.

## 2. Do I need Docker?
Professional hosting panels (like Pterodactyl) use **Docker**, and it is highly recommended for CraftCommand too.
*   **Why?** Docker isolates the server. If a malicious plugin tries to delete files, it can only see inside its container, not your entire Windows/Linux PC.
*   **Requirement:** To run the full backend version of this app, you would need **Docker Desktop** installed.

## 3. Networking & Port Forwarding
If you host on your home PC, your friends cannot join unless you "open the door."
*   **Port Forwarding:** You must log into your router (usually \`192.168.1.1\`) and forward port \`25565\` (TCP & UDP) to your PC's local IP address.
*   **Tunneling:** Alternatively, use tools like **Playit.gg** or **ngrok** to generate a public link without touching router settings.

## 4. Java Runtime Environment
Minecraft requires specific Java versions to run.
*   **Minecraft 1.18+:** Requires **Java 17** or **Java 21**.
*   **Minecraft 1.16 & older:** Requires **Java 8** or **Java 11**.
*   *Automation:* A proper backend would automatically download and select the correct Java version for you.

## Summary Checklist
To take this from a "Simulation" to a "Product":
1.  [ ] **Backend API** (Node.js/Go) to handle file writes and process spawning.
2.  [ ] **Docker** for security and environment isolation.
3.  [ ] **Public IP** or **Tunnel** for external connections.
`
    },
    modpacks: {
        title: "Installing Modpacks",
        icon: <Package size={18} />,
        description: "How to install custom modpacks from CurseForge or Modrinth.",
        content: `
# How to Install a Modpack

Installing a modpack allows you to play with hundreds of mods at once. Follow these steps to set it up on your server.

## Step 1: Get the Server Files
1.  Go to **CurseForge** or **Modrinth**.
2.  Find your desired modpack (e.g., *Better MC*, *All The Mods 9*).
3.  Click **Files** and look for "Server Files" or "Server Pack".
4.  Download and extract the \`.zip\` file on your computer.

## Step 2: Prepare the Server
1.  Go to the **Files** tab in this dashboard.
2.  **Delete** existing files (like \`world\`, \`mods\`, \`config\`) if you are switching from a different version. *Make a backup first!*
3.  Keep \`server.properties\` if you want to keep your settings, otherwise delete it too.

## Step 3: Upload Files
1.  Go to **Settings** and get your **SFTP Credentials**.
2.  Use a program like **FileZilla** or **WinSCP** to connect to your server.
3.  Drag and drop all the extracted modpack files (the \`mods\`, \`config\`, \`scripts\` folders) into the server folder.

## Step 4: Configure Startup
1.  Go to the **Settings** tab.
2.  Change the **Server Jar File** name to match the jar inside your modpack (usually named \`forge-1.20.1.jar\` or \`fabric-server-launch.jar\`).
3.  Click **Save**.

## Step 5: Start & Play
1.  Go to the **Console** and click **Start**.
2.  The first start will take a while as it downloads libraries.
3.  If it stops, check the console—you might need to accept the EULA in \`eula.txt\`.
`
    },
    hardware: {
        title: "Can I Run It?",
        icon: <Cpu size={18} />,
        description: "Hardware requirements guide based on your PC specs.",
        content: `
# Hardware Sizing Guide

Running a Minecraft server requires specific resources. Use this guide to determine what your PC or hosting plan can handle.

## RAM Requirements
The amount of RAM you allocate in **Settings** determines what kind of server you can run.

| Server Type | Recommended RAM | Player Count | Notes |
| :--- | :--- | :--- | :--- |
| **Vanilla / Paper** | 2GB - 4GB | 1-10 Players | Great for basic survival with friends. |
| **Plugin Heavy** | 4GB - 8GB | 10-30 Players | For servers with 30+ plugins (Essentials, McMMO). |
| **Light Modpack** | 4GB - 6GB | 1-5 Players | Packs with <50 mods (Vanilla+). |
| **Heavy Modpack** | 8GB - 12GB+ | 1-10 Players | Large packs like *All The Mods* or *RLCraft*. |

## CPU Importance
Minecraft is "single-threaded," meaning a CPU with **high speed (GHz)** is better than a CPU with many cores.
*   **Good:** Intel Core i5/i7/i9 (9th gen+) or AMD Ryzen 5/7/9 (3000 series+).
*   **Bad:** Old office CPUs (Pentium, Celeron) or weak laptop CPUs.

## Storage
*   Always use an **SSD**. Running a server on an old HDD will cause lag when loading chunks.
`
    },
    dashboard: {
        title: "Dashboard 101",
        icon: <LayoutDashboard size={18} />,
        description: "How to use features like Backups, Schedules, and SFTP.",
        content: `
# Dashboard Features Guide

Learn how to manage your server like a pro using the built-in tools.

## 📦 Backups
**Never lose your progress.**
1.  Go to the **Backups** tab.
2.  Click **Create Backup**.
3.  You can lock backups to prevent accidental deletion.
4.  *Tip:* Create a backup before installing new plugins or mods!

## 📅 Automation (Schedules)
**Make the server run itself.**
1.  Go to **Schedules**.
2.  Create a new task (e.g., "Daily Restart").
3.  Set the time (Cron syntax). Example: \`0 0 * * *\` runs every day at midnight.
4.  Add a command: \`restart\`.

## 📁 File Management (SFTP)
**For moving large files.**
The web file manager is great for quick edits, but for large uploads (like worlds or modpacks), use SFTP.
1.  Download **FileZilla**.
2.  Go to **Settings** in the dashboard to copy your \`sftp://\` address and username.
3.  Use your login password to connect.
`
    },
    optimization: {
        title: "Lag Busters",
        icon: <Zap size={18} />,
        description: "Simple tricks to make your server run smoother.",
        content: `
# Optimization Tips

Is your server lagging? Try these quick fixes before upgrading your hardware.

## 1. Use Paper (Not Spigot/Vanilla)
If you aren't running mods, always use **Paper** software. It is 2x faster than Vanilla Minecraft.
*   *How to switch:* Create a new server and select **Paper** as the software.

## 2. Pre-Generate Your World
Generating new terrain lags the server the most. Use a plugin like **Chunky** to generate the world while you sleep.
1.  Install the **Chunky** plugin.
2.  Run command: \`chunky radius 5000\`
3.  Run command: \`chunky start\`
4.  Wait for it to finish before letting players join.

## 3. Lower View Distance
In **Settings** or \`server.properties\`:
*   Change \`view-distance\` from \`10\` to \`7\`.
*   Change \`simulation-distance\` from \`10\` to \`5\`.
*   This drastically reduces the workload on your CPU.

## 4. Aikar's Flags
In the **Settings** tab, ensure **"Enable Aikar's Flags"** is checked. These are special Java startup codes designed specifically to make Minecraft run smoother.
`
    },
    discord: {
        title: "Discord Integration",
        icon: <Bot size={18} />,
        description: "How to set up your Discord Bot and make it go online.",
        content: `
# Discord Bot: Full Integration Guide

Enable control of your server directly from your Discord server. Follow these steps to set up the connection.

## Step 1: Create a Discord Application
To begin, you need an application profile on the Discord Developer Portal.
1.  Access the [Discord Developer Portal](https://discord.com/developers/applications).
2.  Select **"New Application"** and define a name (e.g., "CraftCommand Bot").
3.  On the left navigation sidebar, select the **"Bot"** section.
4.  *Note:* You can change the bot's name/icon at any time in the portal under "General Information".

## Step 2: Enable Gateway Intents (CRITICAL)
For the bot to read messages, process commands, and see server members, you **must** authorize these privileged intents. Without these, the bot will fail to initialize.
1.  Within the **Bot** tab, scroll to the **"Privileged Gateway Intents"** section.
2.  Toggle **ON** "Presence Intent", "Server Members Intent", and most importantly, **"Message Content Intent"**.
3.  Click **"Save Changes"** to commit the authorization.

## Step 3: Secure Your Credentials
Copy the unique identifiers needed for CraftCommand to impersonate your bot.
1.  **Bot Token:** In the **Bot** tab, click **"Reset Token"** (or "Copy") to generate your access key. **Keep this secret!**
2.  **Client ID:** Navigate to the **"OAuth2"** tab and copy the unique **"Client ID"**.

## Step 4: Connecting the Bot
Many users ask: *Do I need to keep the Discord app open?* 
*   **The Answer:** No. The bot goes online when **CraftCommand** connects to Discord using your token.
*   **Action:** Open the **Integrations** tab in your Craft Commands dashboard. 
*   **Paste:** Enter your **Token** and **Client ID** into the Bot Authentication card.
*   **Update:** Click **"Update Bot Instance"**. The Craft Commands backend will now handle the lifecycle and connection automatically.

## Step 5: Authorization & Invitation
Generate a secure link to invite the bot to your primary guild.
1.  Go to **OAuth2** -> **URL Generator**.
2.  Scopes: Select the \`bot\` and \`applications.commands\` scopes.
3.  Permissions: Select \`Administrator\` (or specific permissions: *Manage Channels*, *Send Messages*, *Embed Links*).
4.  Paste the generated URL into your browser to authorize the bot for your server.

## Step 6: Slash Command Synchronization
Before commands appear in your server, you must register them with the Discord API.
1.  In the **Integrations** dashboard, ensure the bot shows as **Online**.
2.  Click the **"Sync Cmds"** button. 
3.  **Global vs. Guild:** If you don't provide a **Guild ID**, command propagation is "Global" and can take up to an hour to appear. Providing your Server ID as the **Guild ID** triggers instant synchronization.

## Step 7: Reliability & Performance
To prevent spam, CraftCommand uses efficient message handling:
*   **Connection Stability:** Every time the bot reconnects, it refreshes its listeners. This ensures you never receive duplicate "Server Started" messages.
*   **Debounced Player Events:** During mass joins (e.g., after a restart), the bot debounces notifications for 5 seconds to keep your channel clean.
*   **Smart Triggers:** The bot is internally wired to the **Automatic Repair Service**, notifying you instantly if a recovery effort is started.

## FAQ
*   **Q: Does it cost money?** No, creating and hosting a Discord bot via Craft Commands is completely free.
*   **Q: Why doesn't it reply?** Ensure "Message Content Intent" is enabled in the portal and you have clicked **"Sync Cmds"**.
`
    },
    automaticRepair: {
        title: "Automatic Repair",
        icon: <Zap size={18} />,
        description: "How the automatic repair engine works.",
        content: `
# Automatic Repair: Keeping Servers Online

CraftCommand features a recovery layer designed to handle crashes, hangs, and "zombie" processes automatically.

## 1. Monitoring Logs
The system constantly monitors the terminal output of your Minecraft servers. It looks for specific failure patterns:
*   **Out of Memory (OOM):** "java.lang.OutOfMemoryError"
*   **Port Binding Issues:** "FAILED TO BIND TO PORT"
*   **EULA Violations:** "Stopping server (Accept EULA)"
*   **Corrupt JARs:** "Error: Unable to access jarfile"

## 2. Health Checks (Socket Tests)
Beyond just checking if the process is "running," the system performs **detailed health checks**:
*   Every 60 seconds (configurable), the system attempts a low-level socket handshake with the server's port.
*   If the process is running but the socket times out, the system marks the instance as **HUNG**.

## 3. Automated Recovery Process
When a failure or "Hung" state is confirmed, the system triggers the following sequence:
1.  **Diagnosis:** The system analyzes the last 1000 lines of logs to identify the "Rule ID" that triggered the failure.
2.  **Stabilization:** If a known fix exists (e.g., auto-accepting EULA or clearing a ghost port), it is applied automatically.
3.  **Restart:** The process is force-stopped and re-initialized using the original startup flags.
4.  **Notification:** If enabled, a "Recovery Started" alert is sent to your Discord.

## 4. Loop Prevention
To prevent "Restart Loops" (e.g., if a server is crashing due to a fatal bug in a mod), the system allows only **3 attempts per 10 minutes**. If stability is not reached, it halts and flags the server for manual intervention.
`
    },
    backups: {
        title: "Reliable Backups",
        icon: <Package size={18} />,
        description: "Failsafe snapshots and restoration.",
        content: `
# Reliable Backups: Data Safety First

The backup system in CraftCommand is designed for safety. We use a failsafe approach to ensure that a failed backup or restore never corrupts your server files.

## 1. Safety Snapshots
When you click **"Create Backup"**, the system:
*   Generates a unique timestamped manifest.
*   Archives the server directory into a professional ZIP format.
*   **Smart Inclusion:** Automatically skips unnecessary temporary files like \`session.lock\`, \`.lck\` files, and the \`logs/latest.log\` to save space.

## 2. Failsafe Restoration
Restoring a backup is the most critical operation. CraftCommand handles it using a reliable pattern:
1.  **Preparation:** A temporary folder is created.
2.  **Safety Buffer:** Your *current* live files are moved into this temporary buffer instead of being deleted.
3.  **Extraction:** The backup is extracted into the now-empty server directory.
4.  **Verification:** The system checks if the critical files (like \`server.properties\`) exist.
5.  **Finalize:** If successful, the temporary buffer is deleted.
6.  **Rollback:** If extraction fails, the system automatically moves your live files back from the buffer. **Your server stays exactly as it was.**

## 3. World-Only Backups
Save storage space by backing up only the terrain data.
*   The system analyzes your \`server.properties\` to find the specific \`level-name\` folder.
*   It also automatically grabs \`world_nether\` and \`world_the_end\` for Vanilla/Paper servers.
*   This mode typically reduces backup size by **70-90%** if you have many mods.

## 4. Automatic Discovery
All backups are indexed automatically. If you move files manually via SFTP, the system detects them on the next scan, updating metadata like creation dates and file sizes.
`
    },
    networking: {
        title: "Network & Port Management",
        icon: <Cpu size={18} />,
        description: "Managing port availability and routing.",
        content: `
# Networking & Port Management

Managing multiple Minecraft servers requires control over ports. CraftCommand includes a built-in **Port Management Engine**.

## 1. Ghost Process Purging
One of the most common server errors is \`FAILED TO BIND TO PORT\`. This happens when a previous instance didn't close properly and is still "holding" the port.
*   **Startup Verification:** Before launching any server, the system checks if the port is busy.
*   **Heuristic Killing:** If a "Ghost" process is found, the system forcefully terminates it to clear the path for your new server instance.

## 2. Port Conflict Prevention
*   The system tracks the port allocation for every server in your infrastructure.
*   If you attempt to start two servers on port \`25565\`, the system will intercept the command and warn you before the process even attempts to boot.

## 3. Background Sync
Every 15 seconds, a sync loop runs to detect "unmanaged" processes. 
*   If you start a server manually via a command line outside of CraftCommand, the panel will detect the port is bound and show a special **UNMANAGED** status on the dashboard.
*   This allows you to see what's happening on your machine even if it wasn't started through the web interface.

## 4. Execution Engines (Native vs Docker)
*   **Native Engine:** Runs Java directly on your OS. It is fast and has zero overhead but shares the host network space.
*   **Docker Engine:** Runs the server inside a virtualized network. This provides much higher security, as the container has its own private "Internal" IP, and only the specific Minecraft port is exposed to the host.
`
    },
    schedules: {
        title: "Automation",
        icon: <Bot size={18} />,
        description: "Set up automated tasks and restarts.",
        content: `
# Automation (Schedules)

Automation is key to professional server management. Our system uses a robust implementation to handle tasks with precision.

## 1. Precision Timing (Cron Syntax)
We use standard Linux Cron syntax for maximum flexibility. 
*   \`0 0 * * *\`: Runs at exactly midnight every day.
*   \`*/30 * * * *\`: Runs every 30 minutes.
*   \`0 4 * * 0\`: Runs every Sunday at 4:00 AM.

## 2. Command Pipeline
When a schedule triggers, it doesn't just "reset" the server. It enters a dedicated command pipeline:
1.  **Broadcast:** If configured, the system sends a \`say\` command to Minecraft to warn users about the upcoming event.
2.  **Grace Period:** The system waits for players to finish their activities.
3.  **Execution:** The primary action (Restart, Backup, or Stop) is executed.

## 3. Persistence & Survivability
*   Schedules are stored in \`data/settings.json\`.
*   If the panel is restarted, the Scheduling Engine scans all pending tasks and re-aligns them with the current system clock immediately upon boot.
*   **Task Locking:** Scheduled tasks are locked during execution to prevent "Double-Triggers" if a long-running task (like a massive backup) takes longer than the interval.

## 4. Multi-Server Coordination
You can create "Master Schedules" that target multiple servers at once, ensuring that your entire network stays synchronized without manual intervention.
`
    },
    importing: {
        title: "Server Importer",
        icon: <Rocket size={18} />,
        description: "Easily import your existing servers.",
        content: `
# Server Importer

Bringing an existing server into CraftCommand is designed to be a "Zero-Config" experience. Our **ImportService** performs a deep heuristic analysis of your files.

## 1. Quick ZIP Analysis
When you upload a ZIP, we analyze the structure.
*   **Archiver Stream:** We use \`adm-zip\` to peek inside the archive before extraction.
*   **Nested Detection:** If your ZIP contains a folder which *itself* contains the server (e.g., \`my-server/server.jar\`), the system detects this "Improper Nesting" and automatically flattens it for you.

## 2. Heuristic Analysis
The service scans your files to determine your configuration:
*   **Software Detection:** We look for unique JAR signatures (e.g., \`paper-1.20.jar\`, \`forge-installer.jar\`, or \`fabric-server-launch.jar\`).
*   **Version Scraping:** File names are parsed using regex to identify the exact Minecraft version (e.g., \`1.20.4\`).
*   **Port Extraction:** We parse your \`server.properties\` to find your custom \`server-port\`.
*   **Java Optimization:** Based on the Minecraft version, we automatically assign the correct Java Runtime (e.g., Java 21 for 1.20.5+).

## 3. Integrity Checks
*   **No Overlaps:** The system prevents you from importing a folder that is already being managed by another server instance.
*   **Path Normalization:** All paths are converted to absolute, cross-platform literals to ensure the backend can always find your files, even after a reboot.
`
    },
    security: {
        title: "Logs & Audit",
        icon: <Info size={18} />,
        description: "Detailed logs of all system events.",
        content: `
# Event Logging & Audits

CraftCommand is built for transparency. Every action taken on the dashboard is logged and verifiable.

## 1. The Audit Trail
The **AuditService** records a persistent log of every management event:
*   **Who:** The User ID and Email of the person performing the action.
*   **What:** The specific action (e.g., \`START_SERVER\`, \`DELETE_BACKUP\`, \`UPDATE_SETTINGS\`).
*   **Where:** The source IP address and the specific Server ID targeted.
*   **When:** High-resolution millisecond timestamps.

## 2. Metadata Context
Beyond a simple text log, we store "JSON Snapshots" of the event metadata. For example, if you change a server's RAM, the audit log stores both the old and new values, allowing you to trace infrastructure changes over time.

## 3. Sandboxing (Docker)
For maximum security, we recommend the **Docker Execution Engine**:
*   **File Isolation:** The Minecraft process cannot "see" outside its assigned folder.
*   **Resource Caps:** You can strictly limit the CPU and RAM usage at the OS level, preventing one server from crashing your entire host machine.
*   **Network Barriers:** Containers can be isolated on a private virtual bridge, with only the Minecraft port exposed.

## 4. Multi-User Hierarchy
*   **Administrator:** Full access to global settings and all server instances.
*   **Operator:** Access to specific server consoles and file management.
*   **Viewer:** View-only access to status.
`
    },
    java: {
        title: "Java Management",
        icon: <Package size={18} />,
        description: "How we manage Runtimes and Versions.",
        content: `
# Java Version Management

Minecraft needs different Java versions to run. CraftCommand manages these dependencies automatically.

## 1. Automated Java Installation
If you don't have the correct Java version, the system can handle it:
*   **Adoptium Handshake:** We interface with the Adoptium Temurin API to fetch official, high-performance OpenJDK builds.
*   **Portable Isolation:** Java is downloaded and extracted into the \`runtimes/\` directory. This means you can run Minecraft 1.8 (Java 8) and Minecraft 1.21 (Java 21) on the same machine without any global environment conflicts.

## 2. Version Mapping
Selecting the wrong Java version causes errors. CraftCommand handles the mapping:
*   **Legacy (1.8 - 1.12):** Automatically maps to **Java 8**.
*   **Transition (1.16):** Maps to **Java 11**.
*   **Modern (1.17 - 1.20.4):** Maps to **Java 17**.
*   **Cutting Edge (1.20.5+):** Maps to **Java 21**.

## 3. Docker Image Translation
When using the Docker engine, the system translates your Java choice into a specific container tag (e.g., \`eclipse-temurin:21-jre\`). This ensures that your containerized environment is perfectly tuned for your server's flight path.

## 4. Integrity Checks
During the download phase, the system performs **Size Verification**. If a download is interrupted or the file is too small (<50MB), the system flags a corruption error and rolls back to prevent a broken installation.
`
    }
};

const Architect: React.FC = () => {
    const [selectedGuide, setSelectedGuide] = useState<keyof typeof GUIDES>('deployment');
    const { user } = useUser();
    const [globalSettings, setGlobalSettings] = useState<any>(null);

    useEffect(() => {
        API.getGlobalSettings().then(setGlobalSettings).catch(console.error);
    }, []);

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
                    <div className={`rounded-xl border border-border transition-all duration-300 ${globalSettings?.app?.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card shadow-sm' } overflow-hidden`}>
                        <div className="p-4 border-b border-border bg-muted/30">
                            <h2 className="font-bold text-xs flex items-center gap-2 text-muted-foreground">
                                <HelpCircle size={14} className="text-primary" />
                                Knowledge Base
                            </h2>
                        </div>
                        <nav className="p-2 space-y-1">
                            {(Object.entries(GUIDES) as [keyof typeof GUIDES, typeof GUIDES[keyof typeof GUIDES]][]).map(([key, guide]) => (
                                <button
                                    key={key}
                                    onClick={() => setSelectedGuide(key)}
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
                                        <span className={`font-bold block text-xs tracking-tight ${selectedGuide === key ? 'text-foreground' : 'text-muted-foreground'}`}>{guide.title}</span>
                                        <span className="text-[10px] text-muted-foreground line-clamp-1 opacity-70 leading-snug mt-0.5 font-medium tracking-tight">{guide.description}</span>
                                    </div>
                                </button>
                            ))}
                        </nav>
                    </div>
                    
                    <div className={`border border-border rounded-xl p-5 transition-all duration-300 ${globalSettings?.app?.visualQuality ? 'glass-morphism quality-shadow shadow-primary/5' : 'bg-card shadow-sm'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                                <Zap size={14} className="text-primary/70" />
                                <span className="text-[11px] font-bold text-primary/80">Architect Pro Tip</span>
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                            High-performance servers benefit from <strong>NVMe storage</strong> and <strong>Aikar's Flags</strong> for better performance. 
                        </p>
                        <div className="mt-4 pt-4 border-t border-border/50">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-muted-foreground opacity-60">Heuristic Check</span>
                                <span className="text-[10px] font-bold text-emerald-600">PASS</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Content Area */}
                <motion.div variants={STAGGER_ITEM} className="lg:col-span-3 min-h-[600px] flex flex-col">
                    <AnimatePresence mode="wait">
                        <motion.div 
                            key={selectedGuide}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={MOTION_SPRINGS}
                            className={`rounded-xl border border-border transition-all duration-300 ${user?.preferences.visualQuality ? 'glass-morphism quality-shadow' : 'bg-card text-card-foreground shadow-sm'} flex flex-col overflow-hidden h-full`}
                        >
                            <div className="border-b border-border px-8 py-8 bg-muted/20">
                                <div className="flex items-center gap-2 text-muted-foreground text-[10px] mb-4 font-bold uppercase tracking-widest opacity-60">
                                    <span>Library</span>
                                    <ChevronRight size={10} />
                                    <span>Guides</span>
                                    <ChevronRight size={10} />
                                    <span className="text-primary">{GUIDES[selectedGuide].title}</span>
                                </div>
                                <h2 className="text-3xl font-bold tracking-tight text-foreground">{GUIDES[selectedGuide].title}</h2>
                                <p className="text-muted-foreground mt-2 text-base font-medium opacity-80">{GUIDES[selectedGuide].description}</p>
                            </div>
                            
                            <div className="flex-1 p-8 overflow-y-auto">
                                <div className="markdown-body max-w-4xl custom-markdown">
                                    <ReactMarkdown>{GUIDES[selectedGuide].content}</ReactMarkdown>
                                </div>
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default Architect;
