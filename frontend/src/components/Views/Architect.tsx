
import React, { useState } from 'react';
import { ServerTemplate } from '@shared/types';
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

You are currently viewing the **Craft Commands Web Interface**. To turn this into a fully functional server manager that runs actual Minecraft instances on your machine or a VPS, specific infrastructure is required.

## 1. The "Backend" Problem
Browsers cannot directly launch \`java -jar server.jar\` on your computer due to security sandboxing.
*   **For Local Use:** This website needs to be wrapped in **Electron** or **Tauri**. These technologies allow the web code (React) to execute system commands (like starting Java) on your computer.
*   **For Remote Hosting:** You need a dedicated backend service (written in Node.js, Go, or Rust) running on the server that listens for commands from this dashboard.

## 2. Do I need Docker?
Professional hosting panels (like Pterodactyl) use **Docker**, and it is highly recommended for Craft Commands too.
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

Enable high-fidelity control of your infrastructure directly from your Discord server. Follow these steps to establish a professional persistent connection.

## Step 1: Create a Discord Application
To begin the handshake, you need an application profile on the Discord network.
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

## Step 4: The Handshake (Making the Bot Online)
Many users ask: *Do I need to keep the Discord app open?* 
*   **The Answer:** No. The bot goes online when **CraftCommand** establishes a bridge to Discord using your secret token.
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

## Step 7: Premium Command Interface
Your bot now supports advanced infrastructure commands with multi-stage feedback:
*   **Status Indicators:** Online (🟢), Starting (🟡), and Offline (🔴).
*   **Intelligent Response:** When using \`/start\`, the bot acknowledges "Initialization" then sends a second "System Ready" follow-up once the process is fully healthy.
*   **Embedded Telemetry:** Commands like \`/status\` and \`/list\` now return high-fidelity embeds with real-time RAM, TPS, and player metadata.

## FAQ
*   **Q: Does it cost money?** No, creating and hosting a Discord bot via Craft Commands is completely free.
*   **Q: Why doesn't it reply?** Ensure "Message Content Intent" is enabled in the portal and you have clicked **"Sync Cmds"**.
`
    }
};

const Architect: React.FC = () => {
    const [selectedGuide, setSelectedGuide] = useState<keyof typeof GUIDES>('deployment');

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-[1600px] mx-auto space-y-6 pb-12 relative"
        >
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-border bg-muted/30">
                            <h2 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
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
                                        <span className="text-[10px] text-muted-foreground line-clamp-1 opacity-70 leading-snug mt-0.5 font-medium uppercase tracking-tight">{guide.description}</span>
                                    </div>
                                </button>
                            ))}
                        </nav>
                    </div>
                    
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm shadow-primary/5">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Zap size={14} className="text-primary" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Architect Pro Tip</span>
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                            High-performance instances require <strong>NVMe storage</strong> and <strong>Aikar's Flags</strong> for optimal Garbage Collection cycles. 
                        </p>
                        <div className="mt-4 pt-4 border-t border-border/50">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Heuristic Check</span>
                                <span className="text-[9px] font-bold text-emerald-600 uppercase">PASS</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="lg:col-span-3 min-h-[600px] flex flex-col">
                    <AnimatePresence mode="wait">
                        <motion.div 
                            key={selectedGuide}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="rounded-xl border border-border bg-card text-card-foreground shadow-sm flex flex-col overflow-hidden h-full"
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
                </div>
            </div>
        </motion.div>
    );
};

export default Architect;
