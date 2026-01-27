
import path from 'path';
import fs from 'fs-extra';
import { processManager } from './ProcessManager';
import { javaManager } from './JavaManager';
import net from 'net';

export class StartupManager {
    
    /**
     * Orchestrates the entire startup process
     */
    async startServer(server: any, saveServerCallback: (s: any) => void): Promise<void> {
        const id = server.id;

        // 1. Double-Start Check: Is the port already in use?
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
        
        // Check Directory
        if (!(await fs.pathExists(cwd))) {
            throw new Error(`Server directory missing: ${cwd}`);
        }

        // Check Executable
        const exe = server.executable || 'server.jar';
        const exePath = path.join(cwd, exe);
        
        if (!(await fs.pathExists(exePath))) {
            throw new Error(`Startup file missing: ${exe}`);
        }

        // Forge Specific Checks
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
                    
                    // Construct direct command:
                    // AbsoluteJavaPath + JVM Args (RAM/Aikars) + Forge Args + 'nogui'
                    // Note: Forge args already include @user_jvm_args.txt which might have RAM settings. 
                    // We should likely PREPEND our RAM settings or let user_jvm_args take precedence? 
                    // Usually command line args override file args in Java? Verify.
                    // Actually, let's keep it simple: JavaPath + RAM/Aikar + ForgeArgs + nogui
                    cmd = `"${javaPath}" ${jvmArgs} ${forgeArgs} nogui`;
                    
                } else {
                    console.log('[StartupManager] Could not parse run.bat args, falling back to execution via cmd.');
                    // Fallback to executing bat
                    if (isWin) {
                        cmd = `cmd /c "cd /d "${cwd}" && "${jarFile}" ${jvmArgs} nogui"`;
                    } else {
                        cmd = `"${path.join(cwd, jarFile)}"`; 
                    }
                }
            } catch (e) {
                console.error('[StartupManager] Error reading run.bat:', e);
                 // Fallback
                 if (isWin) {
                    cmd = `cmd /c "cd /d "${cwd}" && "${jarFile}" ${jvmArgs} nogui"`;
                } else {
                    cmd = `"${path.join(cwd, jarFile)}"`; 
                }
            }
        } else if (jarFile.endsWith('.sh')) {
             // Linux Shell Script
             cmd = `sh "${path.join(cwd, jarFile)}" ${jvmArgs} nogui`;
        } else {
            // Standard JAR
            cmd = `"${javaPath}" ${jvmArgs} -jar "${jarFile}" nogui`;
        }

        return { cmd, cwd, env };
    }
}

export const startupManager = new StartupManager();
