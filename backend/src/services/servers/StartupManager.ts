
import path from 'path';
import fs from 'fs-extra';
import { processManager } from './ProcessManager';
import { javaManager } from './JavaManager';
import net from 'net';
import si from 'systeminformation';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

import { safetyService } from '../system/SafetyService';

export class StartupManager {

    /**
     * Orchestrates the entire startup process
     */
    async startServer(server: any, saveServerCallback: (s: any) => void, force: boolean = false): Promise<void> {
        const id = server.id;

        // 0. Smart Auto-Correction (Velocity) - Run BEFORE Safety Checks


        // 0.1 Safety Checks (Skip if forced)
        if (!force) {
            await safetyService.validateServer(server);
        }

        // 1. Double-Start Check: Is the port already in use?
        // Note: SafetyService checks port availability strictly. 
        // If we get here, SafetyService passed (or was skipped).
        // However, SafetyService throws if port is validly used by another process.
        // We might validly want to "adopt" the process if it's THIS server running as a ghost?
        // Let's keep existing logic for "Double-Start Check" as it handles adoption.
        const isPortInUse = await this.checkPort(server.port);
        if (isPortInUse) {
            console.log(`[StartupManager:${id}] Port ${server.port} already bound. Adopting existing process...`);
            server.status = 'ONLINE';
            saveServerCallback(server);
            processManager.updateCachedStatus(id, { online: true });
            return;
        }

        // 2. Validate Environment
        await this.validateEnvironment(server);

        // 3. Resolve Java
        const javaPath = await javaManager.ensureJava(server.javaVersion || 'Java 17');

        // 4. Build Command
        // Enforce Properties for Backend Servers (Trust No One)
        await this.enforceBackendProperties(server);

        const { cmd, cwd, env } = await this.buildStartCommand(server, javaPath);





        // 5. Launch
        processManager.startServer(id, cmd, cwd, env);
    }

    private async checkPort(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(200);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('error', () => { socket.destroy(); resolve(false); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
            socket.connect(port, '127.0.0.1');
        });
    }

    private async validateEnvironment(server: any) {
        const cwd = server.workingDirectory;
        const id = server.id;
        
        // 1. Check Directory
        if (!(await fs.pathExists(cwd))) {
            throw new Error(`Server directory missing: ${cwd}`);
        }

        // 2. Check System RAM
        const mem = await si.mem();
        const availableRAM = mem.available / 1024 / 1024 / 1024; // GB
        const allocatedRAM = server.ram || 2;
        
        // Allow a small buffer (e.g., if system has 16GB and we allocate 16GB, it might fail)
        // Let's warn if allocated > available, error if allocated > total installed.
        const totalRAM = mem.total / 1024 / 1024 / 1024;
        
        if (allocatedRAM > totalRAM) {
             throw new Error(`CRITICAL: Cannot allocate ${allocatedRAM}GB RAM. System only has ${totalRAM.toFixed(1)}GB installed.`);
        }
        
        if (allocatedRAM > availableRAM) {
            console.warn(`[StartupManager:${id}] WARNING: Allocating ${allocatedRAM}GB but only ${availableRAM.toFixed(1)}GB is free. Swapping may occur.`);
        }

        // 3. Loader/Folder Checks
        const software = server.software?.toLowerCase() || '';
        if (software.includes('forge') || software.includes('fabric') || software.includes('neoforge')) {
            const modsDir = path.join(cwd, 'mods');
            if (!(await fs.pathExists(modsDir))) {
                 console.warn(`[StartupManager:${id}] Modded server (${server.software}) detected but 'mods' folder is missing.`);
                 // Determine if we should create it to be helpful
                 await fs.ensureDir(modsDir);
                 console.log(`[StartupManager:${id}] Created empty 'mods' directory.`);
            }
        } else if (software.includes('paper') || software.includes('spigot') || software.includes('purpur')) {
             const pluginsDir = path.join(cwd, 'plugins');
             if (!(await fs.pathExists(pluginsDir))) {
                 await fs.ensureDir(pluginsDir);
             }
        }

        // 4. Check Executable
        const exe = server.executable || 'server.jar';
        const exePath = path.join(cwd, exe);
        
        if (!(await fs.pathExists(exePath))) {
            throw new Error(`Startup file missing: ${exe}`);
        }

        // 5. Forge Specific Checks
        if (exe.endsWith('.bat') || server.software === 'Forge') {
             const argsFile = path.join(cwd, 'user_jvm_args.txt');
             if (await fs.pathExists(argsFile)) {
                 // Good, it exists.
             } else {
                 console.warn(`[StartupManager] user_jvm_args.txt missing for Forge/Bat server. This might cause startup failure.`);
                 // We don't block it, but we warn.
             }
        }
    }

    private async buildStartCommand(server: any, javaPath: string): Promise<{ cmd: string, cwd: string, env: NodeJS.ProcessEnv }> {
        const cwd = server.workingDirectory;
        const jarFile = server.executable || 'server.jar';
        const isWin = process.platform === 'win32';

        // Prepend Java Bin to PATH (Keep this as backup)
        const javaBin = path.dirname(javaPath);
        const env: NodeJS.ProcessEnv = {};
        const currentPath = process.env.PATH || process.env.Path || '';
        const separator = isWin ? ';' : ':';
        env['PATH'] = `${javaBin}${separator}${currentPath}`;
        env['Path'] = `${javaBin}${separator}${currentPath}`;

        // Construct JVM Arguments
        const AIKAR_FLAGS = "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=true -Daikars.new.flags=true";
        
        let jvmArgs = `-Xmx${server.ram}G`;
        
        if (server.advancedFlags?.aikarFlags) {
            console.log(`[StartupManager] Injecting Aikar's Flags for ${server.name}`);
            jvmArgs += ` ${AIKAR_FLAGS}`;
        }
        
        
        // Suppress "Advanced terminal features not available" warning (JLine 2 & 3 / Paper)
        // JLine 2
        jvmArgs += ' -DTerminal.jline=false -Dorg.bukkit.craftbukkit.libs.jline.Terminal=jline.UnsupportedTerminal';
        // JLine 3 (Modern Paper / 1.19+)
        jvmArgs += ' -Dorg.jline.terminal.dumb=true -Dorg.jline.terminal.backend=jline.terminal.impl.DumbTerminalProvider';
        
        // Suppress Paper "You've not updated in a while" warning
        jvmArgs += ' -Dpaper.disableUpdateCheck=true';

        let cmd = '';
        // Removed duplicate isWin

        let runPrefix = '';
        if (isWin) {
            let priorityFlag = '/NORMAL';
            if (server.cpuPriority === 'high') priorityFlag = '/HIGH';
            if (server.cpuPriority === 'realtime') priorityFlag = '/REALTIME';
            
            if (priorityFlag !== '/NORMAL') {
                 runPrefix = `start /B ${priorityFlag} "MinecraftServer" `;
            }
        } else {
             // Linux Logic
             if (server.cpuPriority === 'high') runPrefix = 'nice -n -5 '; 
             if (server.cpuPriority === 'realtime') runPrefix = 'nice -n -10 ';
        }

        if (jarFile.endsWith('.bat')) {
            // Smart Forge Handler: Parse the bat to bypass PATH issues
            try {
                const batPath = path.join(cwd, jarFile);
                const batContent = await fs.readFile(batPath, 'utf8');
                
                // Look for the standard Forge line: "java @user_jvm_args.txt ..."
                const match = batContent.match(/^java\s+(@user_jvm_args\.txt.*)$/m);
                if (match) {
                    const forgeArgs = match[1].replace('%*', '').trim(); // Remove %* placeholder
                    console.log(`[StartupManager] Parsed Forge run.bat args: ${forgeArgs}`);
                    
                    cmd = `${runPrefix}"${javaPath}" ${jvmArgs} ${forgeArgs} nogui`;
                    
                } else {
                    console.log('[StartupManager] Could not parse run.bat args, falling back to execution via cmd.');
                    // Fallback to executing bat
                    if (isWin) {
                        cmd = `${runPrefix}cmd /c "cd /d "${cwd}" && "${jarFile}" ${jvmArgs} nogui"`;
                    } else {
                        cmd = `${runPrefix}"${path.join(cwd, jarFile)}"`; 
                    }
                }
            } catch (e) {
                console.error('[StartupManager] Error reading run.bat:', e);
                 // Fallback
                 if (isWin) {
                    cmd = `${runPrefix}cmd /c "cd /d "${cwd}" && "${jarFile}" ${jvmArgs} nogui"`;
                } else {
                    cmd = `${runPrefix}"${path.join(cwd, jarFile)}"`; 
                }
            }
        } else if (jarFile.endsWith('.sh')) {
             // Linux Shell Script
             cmd = `${runPrefix}sh "${path.join(cwd, jarFile)}" ${jvmArgs} nogui`;
        } else {
            // Standard JAR
            cmd = `${runPrefix}"${javaPath}" ${jvmArgs} -jar "${jarFile}" nogui`;
        }

        return { cmd, cwd, env };
    }

    // Removed autoCorrectVelocity


    public async enforceBackendProperties(server: any) {
        try {
            // --- STANDALONE / BACKEND LOGIC ---
            const propsPath = path.join(server.workingDirectory, 'server.properties');
            if (await fs.pathExists(propsPath)) {
                 let content = await fs.readFile(propsPath, 'utf8');

                // 1. STRICT PORT SYNC
                if (server.port) {
                    const portStr = `server-port=${server.port}`;
                    if (content.match(/^server-port\s*=/m)) {
                        content = content.replace(/^server-port\s*=.*$/m, portStr);
                    } else {
                        content += `\n${portStr}`;
                    }
                    await fs.writeFile(propsPath, content);
                }
            }

        } catch (err) {
             console.error(`[StartupManager] Failed to enforce properties:`, err);
        }
    }
}

export const startupManager = new StartupManager();
