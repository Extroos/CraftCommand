import { logger } from '../../utils/logger';
import path from 'path';
import fs from 'fs-extra';
import { processManager } from '../processes/ProcessManager';
import { javaManager } from '../processes/JavaManager';
import net from 'net';
import si from 'systeminformation';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

import { safetyService, SafetyError } from '../system/SafetyService';
import { systemSettingsService } from '../system/SystemSettingsService';
import { NetUtils } from '../../utils/NetUtils';
import { WEB_ROOT } from '../../constants';
import { proxyService } from '../network/ProxyService';
import { serverConfigService } from './ServerConfigService';
import { SafeFileOperation } from '../../utils/fs';
import { AppError } from '../../utils/AppError';

export class StartupManager {

    /**
     * Orchestrates the entire startup process
     */
    async startServer(server: any, saveServerCallback: (s: any) => void, force: boolean = false): Promise<void> {
        const id = server.id;

        try {
            // 0.1 Safety Checks (Skip if forced)
            if (!force) {
                await safetyService.validateServer(server);
            }

            // 1. Double-Start Check
            const isPortInUse = await NetUtils.checkPort(Number(server.port));
            if (isPortInUse) {
                if (force) {
                    logger.warn(`[StartupManager:${id}] Port ${server.port} is busy. Force mode: purging...`);
                    const killed = await NetUtils.killProcessOnPort(Number(server.port));
                    if (killed) await new Promise(r => setTimeout(r, 1000));
                } else {
                    throw new AppError(409, 'PORT_CONFLICT', `Port ${server.port} is already in use.`);
                }
            }

            // 2. Prepare Environment
            await this.prepareEnvironment(server);

            // 3. Resolve Java (Skip for Bedrock)
            let javaPath = '';
            if (server.software !== 'Bedrock') {
                javaPath = await javaManager.ensureJava(server.javaVersion || 'Java 17');
            }

            // 4. Build Command
            // Enforce Properties for Backend Servers (Trust No One)
            await this.enforceBackendProperties(server);

            // GLOBAL DOCKER ENFORCEMENT
            const settings = systemSettingsService.getSettings();
            let engine = server.executionEngine || 'native';
            if (engine === 'docker' && !settings.app.dockerEnabled) {
                console.warn(`[StartupManager:${id}] Docker is disabled globally. Overriding execution engine to 'native' for safety.`);
                engine = 'native';
            }

            const { cmd, cwd, env } = await this.buildStartCommand(server, javaPath, engine);
            
            // 5. Launch
            let dockerImage = server.dockerImage;
            const autoImage = javaManager.getDockerImageForJava(server.javaVersion);

            // Smart Override: If no image set, OR if it's common default/stale, use auto-mapped
            if (!dockerImage || dockerImage.includes('eclipse-temurin')) {
                if (!dockerImage) dockerImage = autoImage;
            }

            console.log(`[StartupManager:${id}] Selected Docker image: ${dockerImage}`);
            
            processManager.startServer(id, cmd, cwd, { 
                ...env, 
                executionEngine: engine,
                dockerImage,
                SERVER_PORT: Number(server.port)
            }).catch(e => {
                logger.error(`[StartupManager:${id}] Background process startup failed unconditionally: ${e.message}`);
            });

            // 6. Clear Restart Flag (Hardening)
            saveServerCallback({ ...server, needsRestart: false });

        } catch (error: any) {
            logger.error(`[StartupManager:${id}] Startup failed: ${error.message}`);
            throw error;
        }
    }



    private async prepareEnvironment(server: any) {
        const cwd = server.workingDirectory;
        const id = server.id;

        // 0. Permission Guard
        await SafeFileOperation.checkWritePermissions(cwd);
        
        // 1. Loader/Folder Checks (Auto-Creation)
        const software = server.software?.toLowerCase() || '';
        if (software.includes('forge') || software.includes('fabric') || software.includes('neoforge')) {
            const modsDir = path.join(cwd, 'mods');
            if (!(await fs.pathExists(modsDir))) {
                 console.warn(`[StartupManager:${id}] Modded server (${server.software}) detected but 'mods' folder is missing.`);
                 await SafeFileOperation.ensureDir(modsDir);
                 console.log(`[StartupManager:${id}] Created empty 'mods' directory.`);
            }
        } else if (software.includes('paper') || software.includes('spigot') || software.includes('purpur') || software.includes('velocity')) {
             const pluginsDir = path.join(cwd, 'plugins');
             if (!(await fs.pathExists(pluginsDir))) {
                 await SafeFileOperation.ensureDir(pluginsDir);
             }
        } else if (software === 'bedrock') {
             const worldsDir = path.join(cwd, 'worlds');
             if (!(await fs.pathExists(worldsDir))) {
                 await SafeFileOperation.ensureDir(worldsDir);
             }
        }

        // 2. Forge Specific Checks (Warning only)
        const exe = server.executable || 'server.jar';
        if (exe.endsWith('.bat') || server.software === 'Forge') {
             const argsFile = path.join(cwd, 'user_jvm_args.txt');
             if (await fs.pathExists(argsFile)) {
                 // Good, it exists.
             } else {
                 console.warn(`[StartupManager] user_jvm_args.txt missing for Forge/Bat server. This might cause startup failure.`);
             }
        }

        // 3. Automated Icon Deployment (Branding Stabilization)
        try {
            const iconName = server.software === 'Bedrock' ? 'world_icon.png' : 'server-icon.png';
            const serverIconPath = path.join(cwd, iconName);
            const defaultIconPath = path.join(WEB_ROOT, 'server-icon.png');

            if (!(await fs.pathExists(serverIconPath))) {
                if (await fs.pathExists(defaultIconPath)) {
                    logger.info(`[StartupManager:${id}] Deploying default branding icon...`);
                    await fs.copy(defaultIconPath, serverIconPath);
                } else {
                    logger.warn(`[StartupManager:${id}] Default icon not found at ${defaultIconPath}. Skipping deployment.`);
                }
            }
        } catch (err) {
            logger.error(`[StartupManager:${id}] Failed to deploy server icon: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private async buildStartCommand(server: any, javaPath: string, engine: 'native' | 'docker' = 'native'): Promise<{ cmd: string, cwd: string, env: NodeJS.ProcessEnv }> {
        const cwd = server.workingDirectory;
        const isWin = process.platform === 'win32';
        
        // 0. Bedrock Support (Direct Binary Execution)
        if (server.software === 'Bedrock') {
            const exe = isWin ? 'bedrock_server.exe' : './bedrock_server';
            const cmd = isWin ? exe : `LD_LIBRARY_PATH=. ${exe}`;
            return { cmd, cwd, env: {} };
        }

        const jarFile = server.executable || 'server.jar';
        
        // Use generic java for Docker, absolute for Native
        const actualJava = engine === 'docker' ? 'java' : `"${javaPath}"`;

        // Prepend Java Bin to PATH (Keep this as backup)
        const javaBin = path.dirname(javaPath);
        const env: NodeJS.ProcessEnv = {};
        const currentPath = process.env.PATH || process.env.Path || '';
        const separator = isWin ? ';' : ':';
        env['PATH'] = `${javaBin}${separator}${currentPath}`;
        env['Path'] = `${javaBin}${separator}${currentPath}`;

        // Construct JVM Arguments
        const AIKAR_FLAGS = "-XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=true -Daikars.new.flags=true";
        
        let jvmArgs = `-Xmx${server.ram}G`;

        // 1. GC Engine Selection
        const gcEngine = server.advancedFlags?.gcEngine || 'G1GC';
        if (gcEngine === 'ZGC') {
            jvmArgs += " -XX:+UseZGC -XX:+ZGenerational";
        } else if (gcEngine === 'Shenandoah') {
            jvmArgs += " -XX:+UseShenandoahGC -XX:+UnlockExperimentalVMOptions";
        } else if (gcEngine === 'Parallel') {
            jvmArgs += " -XX:+UseParallelGC";
        } else {
            // Default: G1GC
            jvmArgs += " -XX:+UseG1GC";
            if (server.advancedFlags?.aikarFlags) {
                console.log(`[StartupManager] Injecting Aikar's Optimization Suite for ${server.name}`);
                jvmArgs += ` ${AIKAR_FLAGS}`;
            }
        }

        // 2. Network Fabric Tuning
        if (server.advancedFlags?.socketBuffer) {
            const bufferSize = server.advancedFlags.socketBuffer;
            jvmArgs += ` -Dnetwork.socket.sendBuffer=${bufferSize} -Dnetwork.socket.receiveBuffer=${bufferSize} -Dsun.net.maxDatagramSockets=${bufferSize / 1024}`;
        }

        // 3. GraalVM Native JIT Optimization
        if (server.advancedFlags?.useGraalVM) {
            jvmArgs += " -XX:+UnlockExperimentalVMOptions -XX:+EnableJVMCI -XX:+UseJVMCICompiler";
        }

        // 4. Thread Priority Policy
        if (server.advancedFlags?.threadPriority === 'ultra') {
            jvmArgs += " -XX:+UseCriticalJavaThreadPriority -XX:ThreadPriorityPolicy=1";
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
                    
                    cmd = `${runPrefix}${actualJava} ${jvmArgs} ${forgeArgs} nogui`;
                    
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
            cmd = `${runPrefix}${actualJava} ${jvmArgs} -jar "${jarFile}" nogui`;
        }

        return { cmd, cwd, env };
    }

    // Removed autoCorrectVelocity


    public async enforceBackendProperties(server: any) {
        try {
            const software = server.software?.toLowerCase() || '';

            // --- VELOCITY CONFIG ENFORCEMENT ---
            if (software === 'velocity') {
                const configPath = path.join(server.workingDirectory, 'velocity.toml');
                if (await fs.pathExists(configPath)) {
                    const originalContent = await fs.readFile(configPath, 'utf8');
                    let content = originalContent;
                    
                    // 1. Strip out all existing managed blocks and inline declarations
                    // This prevents root settings from being swallowed if a block is poorly positioned
                    content = content.replace(/\[servers\][\s\S]*?(?=\n\[|$)/g, '');
                    content = content.replace(/\[forced-hosts\][\s\S]*?(?=\n\[|$)/g, '');
                    content = content.replace(/^servers\s*=\s*\{.*\}$/gm, '');
                    content = content.replace(/^forced-hosts\s*=\s*\{.*\}$/gm, '');
                    
                    // 2. Sync Base Settings (Top Level)
                    if (server.port) {
                        if (content.match(/^bind\s*=\s*/m)) {
                            content = content.replace(/^bind\s*=\s*".*"/m, `bind = "0.0.0.0:${server.port}"`);
                        } else {
                            content = `bind = "0.0.0.0:${server.port}"\n${content}`;
                        }
                    }
                    
                    if (server.onlineMode !== undefined) {
                        if (content.match(/^online-mode\s*=\s*/m)) {
                            content = content.replace(/^online-mode\s*=\s*.*$/m, `online-mode = ${server.onlineMode}`);
                        } else {
                            content = `online-mode = ${server.onlineMode}\n${content}`;
                        }
                    }

                    // Correct key: player-info-forwarding-mode
                    const forwardingMode = server.network?.proxyConfig?.forwardingMode || 'modern';
                    if (content.match(/^player-info-forwarding-mode\s*=\s*/m)) {
                        content = content.replace(/^player-info-forwarding-mode\s*=\s*".*"/m, `player-info-forwarding-mode = "${forwardingMode}"`);
                    } else if (content.match(/^forwarding-mode\s*=\s*/m)) {
                        content = content.replace(/^forwarding-mode\s*=\s*".*"/m, `player-info-forwarding-mode = "${forwardingMode}"`);
                    } else {
                        // Inject if totally missing
                        content = `player-info-forwarding-mode = "${forwardingMode}"\n${content}`;
                    }

                    // 3. Purge dangerous/deprecated keys that cause startup crashes or warnings
                    content = content.replace(/^forwarding-secret\s*=\s*".*"$/gm, '');
                    
                    // 4. Force block headers to start on new lines and be independent
                    content = content.trim();

                    // 5. Append Managed Blocks at the end
                    const serversBlock = proxyService.generateVelocityServersConfig(server.id);
                    if (serversBlock) {
                        content += `\n\n${serversBlock}`;
                    }

                    let forcedHostsBlock = '[forced-hosts]\n';
                    if (server.network?.proxyConfig?.forcedHosts && Object.keys(server.network.proxyConfig.forcedHosts).length > 0) {
                        for (const [host, targets] of Object.entries(server.network.proxyConfig.forcedHosts)) {
                            forcedHostsBlock += `  "${host}" = ${JSON.stringify(targets)}\n`;
                        }
                    } else {
                        // Clean defaults
                        forcedHostsBlock += `  # No forced hosts configured\n`;
                    }
                    content += `\n\n${forcedHostsBlock}`;

                    if (content.trim() !== originalContent.trim()) {
                        await fs.writeFile(configPath, content.trim() + '\n');
                        logger.info(`[StartupManager] Robustly synced Velocity Network Model for ${server.name}`);
                    }

                    // 6. Ensure forwarding secret files etc. are synced
                    await proxyService.syncForwarding(server.id);

                    // 7. SMART SYNC: Automatically enforce configuration for all linked backend servers
                    const links = server.network?.proxyConfig?.links || [];
                    if (links.length > 0) {
                        logger.info(`[StartupManager:${server.id}] Proxy starting. Auto-syncing ${links.length} linked backend servers...`);
                        
                        // We avoid deep recursion by only passing the target backend servers
                        const { serverRepository } = await import('../../storage/ServerRepository');
                        const allServers = serverRepository.findAll();
                        
                        for (const link of links) {
                            const backend = allServers.find(s => s.id === link.serverId);
                            if (backend && backend.id !== server.id) {
                                logger.info(`[StartupManager:${server.id}] -> Triggering sync for ${backend.name} (${backend.software})`);
                                // Recursive call to fix online-mode and paper-global.yml for each backend
                                await this.enforceBackendProperties(backend);
                            }
                        }
                    }
                }
                return;
            }

            // --- STANDALONE / BACKEND LOGIC (Java/Bedrock) ---
            
            // 1. General Property Sync (Phase 54.2)
            // This handles port, online-mode, motd, max-players, and difficulty
            await serverConfigService.enforceConfig(server);

            const propsPath = path.join(server.workingDirectory, 'server.properties');
            if (await fs.pathExists(propsPath)) {
                 let content = await fs.readFile(propsPath, 'utf8');

                // 2. NETWORK COMPRESSION THRESHOLD SYNC
                if (server.advancedFlags?.compressionThreshold !== undefined) {
                    const threshold = server.advancedFlags.compressionThreshold;
                    const thresholdStr = `network-compression-threshold=${threshold}`;
                    if (content.match(/^network-compression-threshold\s*=/m)) {
                        content = content.replace(/^network-compression-threshold\s*=.*$/m, thresholdStr);
                    } else {
                        content += `\n${thresholdStr}`;
                    }
                }

                // 3. PROXY-AWARE AUTHENTICATION ENFORCEMENT
                // Backend servers (Paper/Forge/etc.) MUST be in online-mode=false to accept Velocity connections
                const { serverRepository } = await import('../../storage/ServerRepository');
                const allServers = serverRepository.findAll();
                const isLinkedToProxy = allServers.some(s => 
                    s.software === 'Velocity' && 
                    s.network?.proxyConfig?.links?.some((l: any) => l.serverId === server.id)
                );

                if (isLinkedToProxy && software !== 'velocity') {
                    if (content.match(/^online-mode\s*=/m)) {
                        content = content.replace(/^online-mode\s*=.*$/m, 'online-mode=false');
                    } else {
                        content += '\nonline-mode=false';
                    }
                    logger.info(`[StartupManager:${server.id}] Enforced online-mode=false for proxy compliance.`);
                }
                
                await fs.writeFile(propsPath, content);

                // 4. FORWARDING REVERT (Spigot/Paper)
                if (software.includes('spigot')) {
                    const spigotPath = path.join(server.workingDirectory, 'spigot.yml');
                    if (await fs.pathExists(spigotPath)) {
                        let spigotContent = await fs.readFile(spigotPath, 'utf8');
                        if (isLinkedToProxy) {
                            spigotContent = spigotContent.replace(/bungeecord:\s*false/g, 'bungeecord: true');
                        } else {
                            spigotContent = spigotContent.replace(/bungeecord:\s*true/g, 'bungeecord: false');
                        }
                        await fs.writeFile(spigotPath, spigotContent);
                    }
                }

                if (software.includes('paper') || software.includes('purpur')) {
                    await this.enforcePaperForwarding(server, isLinkedToProxy);
                }
            }

        } catch (err) {
             console.error(`[StartupManager] Failed to enforce properties:`, err);
        }
    }

    private async enforcePaperForwarding(server: any, isLinked: boolean) {
        const paths = [
            path.join(server.workingDirectory, 'config', 'paper-global.yml'),
            path.join(server.workingDirectory, 'paper.yml') // Legacy 1.18 and below
        ];

        for (const configPath of paths) {
            if (!(await fs.pathExists(configPath))) continue;

            try {
                let content = await fs.readFile(configPath, 'utf8');
                const { serverRepository } = await import('../../storage/ServerRepository');
                const allServers = serverRepository.findAll();
                
                // Find the proxy this server is linked to
                const proxy = allServers.find(s => 
                    s.software === 'Velocity' && 
                    s.network?.proxyConfig?.links?.some((l: any) => l.serverId === server.id)
                );

                if (isLinked && proxy && proxy.network?.proxyConfig) {
                    const config = proxy.network.proxyConfig;
                    const mode = config.forwardingMode || 'modern';
                    const secret = config.secret || '';

                    if (mode === 'modern') {
                        // 1. Enable Velocity
                        if (content.match(/velocity:\s*\n\s*enabled:\s*false/)) {
                            content = content.replace(/(velocity:\s*\n\s*enabled:\s*)false/, '$1true');
                        } else if (!content.includes('velocity:')) {
                            // This shouldn't happen with standard Paper but just in case
                            content += '\nproxies:\n  velocity:\n    enabled: true\n    online-mode: false\n    secret: ""';
                        } else {
                             content = content.replace(/(velocity:\s*\n\s*enabled:\s*)\w+/, '$1true');
                        }

                        // 2. Set Secret
                        if (content.match(/secret:\s*['"]?.*['"]?/)) {
                            content = content.replace(/(secret:\s*)['"]?.*?['"]?(\n|$)/, `$1'${secret}'$2`);
                        }
                        
                        await fs.writeFile(configPath, content);
                        logger.info(`[StartupManager:${server.id}] Synced Velocity forwarding to ${path.basename(configPath)}`);
                    }
                } else {
                    // REVERT: Disable Velocity forwarding if not linked
                    if (content.match(/velocity:\s*\n\s*enabled:\s*true/)) {
                        content = content.replace(/(velocity:\s*\n\s*enabled:\s*)true/, '$1false');
                        await fs.writeFile(configPath, content);
                        logger.info(`[StartupManager:${server.id}] Disabled Velocity forwarding in ${path.basename(configPath)}`);
                    }
                }
            } catch (e) {
                logger.error(`[StartupManager] Error enforcing Paper forwarding in ${configPath}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
}

export const startupManager = new StartupManager();
