import { DiagnosisRule, SystemStats, ServerConfig, DiagnosisResult } from './types';
import { ServerStatus } from '@shared/types';
import { CrashReport } from './CrashReportReader';
import { ConfigReader } from '../../utils/ConfigReader';
import { CrossPlayRules } from './CrossPlayDiagnosisRules';
import { NetUtils } from '../../utils/NetUtils';
import { serverConfigService } from '../servers/ServerConfigService';
import path from 'path';
import fs from 'fs-extra';
import { PluginRules } from './PluginDiagnosisRules';
import { NetworkRules } from './NetworkDiagnosisRules';
import { NodeRules } from './NodeDiagnosisRules';
import { JavaRules } from './JavaDiagnosisRules';
import { MapRules } from './MapDiagnosisRules';
import { BedrockRules } from './BedrockDiagnosisRules';
import { VelocityRules } from './VelocityDiagnosisRules';
import { PredictiveRules } from './PredictiveDiagnosisRules';
import { ResourceAdvisorRules } from './ResourceAdvisorRules';
import { ConnectivityRules } from './ConnectivityDiagnosisRules';
import { HostingOSRules } from './HostingOSDiagnosisRules';
import { UpdateRules } from './UpdateDiagnosisRules';
import { ModDiagnosisRules } from './ModDiagnosisRules';

export const EulaRule: DiagnosisRule = {
    id: 'eula_check',
    name: 'EULA Agreement Check',
    description: 'Checks if the user has agreed to the Minecraft EULA',
    triggers: [
        /You need to agree to the EULA/i,
        /eula.txt/i
    ],
    tier: 1,
    defaultConfidence: 100,
    isHealable: true,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        // EULA only applies to Java Edition servers — Bedrock and Velocity don't have eula.txt
        if (server.software === 'Bedrock' || server.software === 'Velocity') return null;
        if (server.status === ServerStatus.ONLINE) return null;

        const hasLog = logs.some(l => l.includes('agree to the EULA'));
        
        // Universal Check: Logs OR Direct Filesystem check
        const eulaPath = path.join(server.workingDirectory, 'eula.txt');
        const exists = await fs.pathExists(eulaPath);
        let isAgreed = false;
        
        if (exists) {
            const content = await fs.readFile(eulaPath, 'utf8');
            isAgreed = content.includes('eula=true');
        }
        
        if (hasLog || !isAgreed) {
            return {
                id: `eula-${server.id}-${Date.now()}`,
                ruleId: 'eula_check',
                severity: 'CRITICAL',
                title: 'EULA Not Accepted',
                explanation: 'The server cannot start because the End User License Agreement (EULA) has not been accepted.',
                recommendation: 'You must agree to the Minecraft EULA to run this server.',
                action: {
                    type: 'AGREE_EULA',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const MissingDirectoryRule: DiagnosisRule = {
    id: 'missing_directory',
    name: 'Missing Server Directory',
    description: 'Checks if the server working directory exists',
    tier: 1,
    defaultConfidence: 100,
    triggers: [], // Run periodically/pre-flight
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        // Skip if still installing
        if (server.status === 'INSTALLING') return null;

        if (!await fs.pathExists(server.workingDirectory)) {
            return {
                id: `missing-dir-${server.id}-${Date.now()}`,
                ruleId: 'missing_directory',
                severity: 'CRITICAL',
                title: 'Server Directory Missing',
                explanation: `The server directory ${server.workingDirectory} does not exist.`,
                recommendation: 'The server may have been moved or deleted. Check the file system.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const InsufficientRamRule: DiagnosisRule = {
    id: 'insufficient_ram',
    name: 'System RAM Check',
    description: 'Checks if the system has enough RAM to allocate to the server',
    tier: 1,
    defaultConfidence: 100,
    triggers: [], // Run periodically/pre-flight
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const si = require('systeminformation');
        try {
            const mem = await si.mem();
            const totalGb = mem.total / 1024 / 1024 / 1024;
            const freeGb = (mem.total - mem.active) / 1024 / 1024 / 1024;
            const allocatedGb = server.ram || 2;
            
            // Smarter RAM thresholds:
            // 1. CRITICAL: Allocated RAM >= Total System RAM
            // 2. WARNING: Allocated RAM > 85% of System RAM OR < 1GB remains for OS
            
            if (allocatedGb >= totalGb) {
                return {
                    id: `low-ram-crit-${server.id}-${Date.now()}`,
                    ruleId: 'insufficient_ram',
                    severity: 'CRITICAL',
                    title: 'System Memory Over-Allocated',
                    explanation: `This server is allocated ${allocatedGb}GB RAM, but the system only has ${totalGb.toFixed(1)}GB total. This will cause an immediate crash or system lockup.`,
                    recommendation: `Lower the RAM allocation in Server Settings to ${Math.floor(totalGb * 0.7)}GB or less.`,
                    timestamp: Date.now()
                };
            }

            if (allocatedGb > totalGb * 0.90 || freeGb < 0.8) {
                return {
                    id: `low-ram-warn-${server.id}-${Date.now()}`,
                    ruleId: 'insufficient_ram',
                    severity: 'WARNING',
                    title: 'Narrow Memory Headroom',
                    explanation: `Allocation (${allocatedGb}GB) is very close to system limits (${totalGb.toFixed(1)}GB total, ${freeGb.toFixed(1)}GB free). The OS may become unstable or kill the server under load.`,
                    recommendation: `Ensure no other heavy applications are running, or reduce allocation slightly for better stability.`,
                    timestamp: Date.now()
                };
            }
        } catch (e) {
            // SI failed, skip check
        }
        return null;
    }
};

export const PortConflictRule: DiagnosisRule = {
    id: 'port_binding',
    name: 'Port Binding Check',
    description: 'Checks if the server port is already in use',
    triggers: [
        /FAILED TO BIND TO PORT/i,
        /Address already in use/i,
        /BindException/i
    ],
    tier: 1,
    defaultConfidence: 95,
    isHealable: true,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        // Universal Check: Logs OR Direct Network check
        const hasError = logs.some(l => /FAILED TO BIND|Address already in use|BindException/i.test(l));
        
        let isPortBusy = false;
        let blockingProcessName: string | null = null;

        if (logs.length === 0 || hasError) {
            // Pre-flight check or verification
            isPortBusy = await NetUtils.checkPort(server.port);
            if (isPortBusy) {
                blockingProcessName = await NetUtils.identifyProcess(server.port);
            }
        }

        if (hasError || isPortBusy) {
            // Context Awareness: Is another MANAGED server using this port?
            const { getServers } = require('../servers/ServerService');
            const otherOnline = getServers().find((s: ServerConfig) => s.id !== server.id && s.port === server.port && (s.status === ServerStatus.ONLINE || s.status === ServerStatus.STARTING));

            // Smart Identification
            const isManagedConflict = !!otherOnline;
            const isKillableGhost = !isManagedConflict && blockingProcessName && 
                ['java', 'javaw', 'bedrock_server', 'server'].some(safe => blockingProcessName!.toLowerCase().includes(safe));
            
            const isExternalApp = !isManagedConflict && !isKillableGhost;

            if (isExternalApp) {
                 let nextPort = server.port + 1;
                 try {
                     const { NetUtils } = require('../../utils/NetUtils');
                     while (await NetUtils.checkPort(nextPort) && nextPort < server.port + 10) {
                         nextPort++;
                     }
                 } catch (e) {}

                 return {
                    id: `port-ext-${server.id}-${Date.now()}`,
                    ruleId: 'port_binding',
                    severity: 'CRITICAL',
                    title: 'Port Conflict (External App)',
                    explanation: `Port ${server.port} is blocked by an external application (${blockingProcessName || 'Unknown'}). We will not kill it to avoid data loss.`,
                    recommendation: `Change the server port in Settings to an available port (e.g., ${nextPort}).`,
                    action: {
                        type: 'UPDATE_CONFIG',
                        payload: { port: nextPort },
                        autoHeal: true
                    },
                    timestamp: Date.now()
                };
            }

            let nextPort = server.port + 1;
            try {
                const { NetUtils } = require('../../utils/NetUtils');
                while (await NetUtils.checkPort(nextPort) && nextPort < server.port + 10) {
                    nextPort++;
                }
            } catch (e) {}

            return {
                id: `port-${server.id}-${Date.now()}`,
                ruleId: 'port_binding',
                severity: 'CRITICAL',
                title: isManagedConflict ? 'Port Conflict Detected' : 'Ghost Process Detected',
                explanation: isManagedConflict 
                    ? `Port ${server.port} is already being used by ${otherOnline?.name || 'another process'}.`
                    : `Port ${server.port} is blocked by a stray background Java process.`,
                recommendation: isManagedConflict
                    ? `Change the server port in Settings to resolve the conflict (we recommend port ${nextPort}).`
                    : 'We can safely purge this ghost process to start your server.',
                action: isManagedConflict ? {
                    type: 'UPDATE_CONFIG',
                    payload: { port: nextPort },
                    autoHeal: true
                } : {
                    type: 'PURGE_GHOST', // Only offer purge if it's safe!
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const JavaVersionRule: DiagnosisRule = {
    id: 'java_version',
    name: 'Java Version Mismatch',
    description: 'Checks if the Java version matches the mod loader requirements',
    triggers: [
        /UnsupportedClassVersionError/i,
        /unsupported.*java/i,
        /compiled by a more recent version/i,
        /java \d+ is required/i
    ],
    tier: 1,
    defaultConfidence: 95,
    isHealable: true,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        if (server.software === 'Bedrock') return null;
        if (server.status === ServerStatus.ONLINE) return null;
        const logContent = logs.join('\n').toLowerCase();
        const hasError = /unsupportedclassversionerror|compiled by a more recent version|unsupported java version|java \d+ is required/i.test(logContent);
        
        const currentJavaNum = parseInt(server.javaVersion?.match(/\d+/)?.[0] || '8');
        let requiredJava = 'Java 17'; 
        let minVersion = 17;

        // Proactive Intelligence: Determine requirements based on software version
        if (server.software?.toLowerCase() === 'paper' || server.software?.toLowerCase() === 'purpur' || server.software?.toLowerCase() === 'spigot') {
            const versionMatch = server.version?.match(/1\.(\d+)\.?(\d+)?/);
            if (versionMatch) {
                const minor = parseInt(versionMatch[1]);
                const patch = parseInt(versionMatch[2] || '0');
                if (minor >= 21 || (minor === 20 && patch >= 5)) {
                    requiredJava = 'Java 21';
                    minVersion = 21;
                } else if (minor >= 18) {
                    requiredJava = 'Java 17';
                    minVersion = 17;
                } else if (minor >= 17) {
                    requiredJava = 'Java 16';
                    minVersion = 16;
                } else {
                    requiredJava = 'Java 8';
                    minVersion = 8;
                }
            }
        }

        const isProactiveMatch = currentJavaNum < minVersion;

        if (!hasError && !isProactiveMatch) return null;

        // Reactive: Refine requirements from logs if present
        const javaLogContent = logs.join('\n').toLowerCase();
        if (javaLogContent.includes('class file version 61.0')) requiredJava = 'Java 17';
        if (javaLogContent.includes('class file version 65.0')) requiredJava = 'Java 21';
        if (javaLogContent.includes('class file version 66.0')) requiredJava = 'Java 22';
        if (javaLogContent.includes('class file version 60.0')) requiredJava = 'Java 16';
        
        const isWarningOnly = javaLogContent.includes('unsupported java version') && !javaLogContent.includes('unsupportedclassversionerror');

        return {
            id: `java-${server.id}-${Date.now()}`,
            ruleId: 'java_version',
            severity: isWarningOnly ? 'WARNING' : 'CRITICAL',
            title: isWarningOnly ? 'Unsupported Java Version' : 'Incompatible Java Version',
            explanation: hasError 
                ? `Your server requires ${requiredJava} or newer, but it tried to start with ${server.javaVersion}. Error Log: "${javaLogContent.split('\n')[0].trim()}"`
                : `Your server (${server.software} ${server.version}) requires at least ${requiredJava}, but is currently configured with ${server.javaVersion}. This will prevent the server from starting.`,
            recommendation: `Switch the server's Java Version in the settings tab to ${requiredJava}.`,
            action: {
                type: 'SWITCH_JAVA',
                payload: { serverId: server.id, version: requiredJava },
                autoHeal: !isWarningOnly 
            },
            confidence: hasError ? 100 : 90,
            timestamp: Date.now()
        };
    }
};


export const MemoryRule: DiagnosisRule = {
    id: 'memory_oom',
    name: 'Out of Memory',
    description: 'Checks for OutOfMemoryErrors and severe memory pressure',
    triggers: [
        /OutOfMemoryError/i,
        /java heap space/i,
        /GC overhead limit exceeded/i
    ],
    tier: 1,
    defaultConfidence: 95,
    isHealable: true,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
         const memoryLogContent = logs.join('\n').toLowerCase();
         const hasError = /outofmemoryerror|java heap space|gc overhead limit exceeded/i.test(memoryLogContent);
         
         // 1. Critical OOM Error
         if (hasError) {
             const currentRam = server.ram;
             return {
                id: `oom-${server.id}-${Date.now()}`,
                ruleId: 'memory_oom',
                severity: 'CRITICAL',
                title: 'Out Of Memory (OOM)',
                explanation: `The server ran out of memory (RAM) allocated to it (${currentRam}GB).`,
                recommendation: currentRam < 8 ? `Increase RAM from ${currentRam}GB to ${currentRam + 1}GB.` : `Optimize your server with Spark or reduce the number of mods.`,
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { serverId: server.id, ram: currentRam + 1 },
                    autoHeal: true
                },
                timestamp: Date.now()
             };
         }

         // 2. Resource Exhaustion (Pressure) - Only if online
         if (env.memoryUsed && env.memoryTotal) {
             const memPercent = (env.memoryUsed / env.memoryTotal) * 100;
             if (memPercent > 95) {
                 return {
                    id: `mem-pressure-${server.id}-${Date.now()}`,
                    ruleId: 'memory_oom',
                    severity: 'CRITICAL',
                    title: 'Critical Memory Pressure',
                    explanation: `System RAM usage is at ${Math.round(memPercent)}%. The server is likely swapping or experiencing GC thrashing.`,
                    recommendation: 'Allocate more RAM if possible, or close other background applications.',
                    timestamp: Date.now()
                 };
             }
         }

         return null;
    }
};

export const MissingJarRule: DiagnosisRule = {
    id: 'missing_jar',
    name: 'Missing Server Jar',
    description: 'Checks if the server JAR file exists and is accessible',
    triggers: [
        /Error: Unable to access jarfile/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        if (server.software === 'Bedrock') return null;
        // Skip if still installing
        if (server.status === 'INSTALLING') return null;

        // Universal Check: Logs OR Direct Filesystem check
        const logMatch = logs.some(l => /Unable to access jarfile/i.test(l));
        
        const execFile = server.executable || 'server.jar';
        const jarPath = path.isAbsolute(execFile) ? execFile : path.join(server.workingDirectory, execFile);
        const exists = await fs.pathExists(jarPath);
 
        if (logMatch || !exists) {
            return {
                id: `missing-jar-${server.id}-${Date.now()}`,
                ruleId: 'missing_jar',
                severity: 'CRITICAL',
                title: 'Server Executable Missing',
                explanation: `The server file '${execFile}' could not be found. Expected path: "${jarPath}"`,
                recommendation: `Ensure the file "${execFile}" exists in your server folder, or update the "Executable" setting in the dashboard to match your actual filename.`,
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { serverId: server.id } 
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const BadConfigRule: DiagnosisRule = {
    id: 'bad_config',
    name: 'Corrupted Server Config',
    description: 'Checks for invalid server.properties',
    triggers: [
        /Failed to load properties/i,
        /Exception handling console input/i // Sometimes happens when properties fail
    ],
    tier: 2,
    defaultConfidence: 90,
    isHealable: true,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const configPath = path.join(server.workingDirectory, 'server.properties');
        
        // 1. Check for the trigger
        const hasBadConfigLog = logs.some(l => /Failed to load properties/i.test(l));
        
        if (hasBadConfigLog) {
            // 2. FALSE POSITIVE GUARD: Check if the server successfully started anyway
            // We use universal patterns to support Vanilla, Forge, Bedrock, and Proxies.
            const sLog = logs.join('\n');
            const successfulStartup = 
                /Done \(\d+\.\d+s\)!/i.test(sLog) ||               // Vanilla/Fabric (Standard)
                /Done/i.test(sLog) && /type "help"/i.test(sLog) || // Forge (Inclusive)
                /Server started/i.test(sLog) ||                    // Bedrock
                /Listening on/i.test(sLog) ||                      // Proxies (Velocity/Bungee)
                /Starting Minecraft server on/i.test(sLog) ||
                /Loading properties/i.test(sLog);

            // 3. NO-SUCH-FILE GUARD: Is it just a missing file that will be auto-generated?
            const isMissingFileOnly = logs.some(l => 
                /java\.nio\.file\.NoSuchFileException: server\.properties/i.test(l) ||
                /Failed to load server\.properties/i.test(l) && server.software === 'Bedrock' // Bedrock missing check
            );

            // If it started successfully OR it's just a missing file (which is handled by server init), suppress the rule.
            if (successfulStartup || isMissingFileOnly) {
                return null;
            }

             return {
                id: `bad-config-${server.id}-${Date.now()}`,
                ruleId: 'bad_config',
                severity: 'CRITICAL',
                title: 'Corrupted Server Properties',
                explanation: `The configuration file at "${configPath}" is malformed or corrupted and cannot be loaded by the server.`,
                recommendation: 'Delete server.properties to let the server regenerate it with default values, or fix the syntax errors manually.',
                action: {
                    type: 'REPAIR_PROPERTIES',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const PermissionRule: DiagnosisRule = {
    id: 'permission_denied',
    name: 'FileSystem Permission Error',
    description: 'Checks for Access Denied / Permission Denied errors',
    triggers: [
        /Permission denied/i,
        /Access is denied/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const match = logs.find(l => /Permission denied|Access is denied/i.test(l));
        if (match) {
             return {
                id: `perm-${server.id}-${Date.now()}`,
                ruleId: 'permission_denied',
                severity: 'CRITICAL',
                title: 'Permission Denied',
                explanation: `The server failed to access a file due to permissions: "${match.trim()}"`,
                recommendation: 'Run the application as Administrator (Windows) or check chown/chmod (Linux).',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const InvalidIpRule: DiagnosisRule = {
    id: 'invalid_ip',
    name: 'Invalid Server IP Binding',
    description: 'Checks if server-ip is set to an address this machine usually does not own',
    triggers: [
        /Cannot assign requested address/i,
        /start on .* failed/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        if (logs.some(l => /Cannot assign requested address/i.test(l))) {
             return {
                id: `inv-ip-${server.id}-${Date.now()}`,
                ruleId: 'invalid_ip',
                severity: 'CRITICAL',
                title: 'Invalid IP Binding',
                explanation: 'The "server-ip" setting in server.properties is set to an IP address that does not belong to this machine.',
                recommendation: 'Open server.properties and set "server-ip" to empty (blank) to allow binding to all addresses.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const DependencyMissingRule: DiagnosisRule = {
    id: 'mod_dependency',
    name: 'Missing Mod Dependency',
    description: 'Checks for missing mod or plugin dependencies',
    triggers: [
        /requires .* but none is available/i,
        /Missing dependencies/i,
        /Unknown dependency/i,
        /Caused by: .*ClassNotFoundException/i, // Crash report pattern
        /Caused by: .*NoClassDefFoundError/i
    ],
    tier: 3,
    defaultConfidence: 85,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        // 1. Crash Report Analysis (High Precision)
        const commonMappings: Record<string, string> = {
            'net.fabricmc.api': 'Fabric API',
            'net.fabricmc.loader': 'Fabric Loader',
            'dev.architectury': 'Architectury API',
            'me.shedaniel': 'Cloth Config',
            'com.electronwill.nightconfig': 'NightConfig',
            'org.spongepowered.asm': 'Mixin bootstrap',
            'com.github.steveice10': 'MCProtocolLib',
            'org.quiltmc': 'Quilt Standard Libraries',
            'com.mojang.brigadier': 'Brigadier (Mojang Library)',
            'com.pixelmonmod': 'Pixelmon',
            'me.lucko.luckperms': 'LuckPerms',
            'com.sk89q.worldedit': 'WorldEdit',
            'com.sk89q.worldguard': 'WorldGuard',
            'org.dynmap': 'Dynmap',
            'com.zaxxer.hikari': 'HikariCP (Database Connection Pool)',
            'org.sqlite': 'SQLite JDBC',
            'com.mysql.cj': 'MySQL Connector',
            'com.comphenix.protocol': 'ProtocolLib',
            'de.tr7zw.nbtapi': 'NBTAPI',
            'co.aikar.commands': 'ACF (Aikar Command Framework)',
            'org.bstats': 'bStats (Metrics Library)',
            'it.unimi.dsi.fastutil': 'FastUtil (standard Minecraft library)',
            'io.netty': 'Netty (networking library)',
            'org.apache.logging.log4j': 'Log4J (logging library)',
            'fr.minuskube.inv': 'SmartInvs',
            'com.github.cryptomorin.xseries': 'XSeries',
            'net.citizensnpcs': 'Citizens',
            'com.viaversion': 'ViaVersion',
            'org.antlr': 'ANTLR (parsing library)',
            'kotlin': 'Kotlin Standard Library (Mod is likely missing Kotlin loader)',
            'scala': 'Scala Standard Library',
            'com.google.gson': 'GSON',
            // --- NEW INJECTION (100+ Common Mods/Libs) ---
            'software.bernie.geckolib': 'Geckolib',
            'vazkii.patchouli': 'Patchouli',
            'vazkii.mortal': 'Mortal',
            'vazkii.psi': 'Psi',
            'vazkii.quark': 'Quark',
            'vazkii.botania': 'Botania',
            'com.github.almasb': 'FXGL',
            'com.github.benmanes.caffeine': 'Caffeine (core library)',
            'com.github.terminatortm': 'Lazurite',
            'info.journeymap': 'JourneyMap',
            'xaero.common': 'Xaero WorldMap/MiniMap',
            'com.feed_the_beast.ftblib': 'FTB Library',
            'com.feed_the_beast.ftbquests': 'FTB Quests',
            'com.feed_the_beast.ftbteams': 'FTB Teams',
            'com.feed_the_beast.ftbchunks': 'FTB Chunks',
            'com.blamejared.crafttweaker': 'CraftTweaker',
            'com.github.glitchfiend.biomesoplenty': 'Biomes O Plenty',
            'com.github.glitchfiend.terraforged': 'TerraForged',
            'com.github.shiruka': 'Shiruka',
            'net.minecraftforge.fml': 'Forge Mod Loader (Core)',
            'net.minecraftforge.common': 'Forge Common Library',
            'com.terraformersmc.modmenu': 'Mod Menu',
            'com.terraformersmc.canvas': 'Canvas Renderer',
            'com.terraformersmc.sodium': 'Sodium',
            'me.jellysquid.mods.lithium': 'Lithium',
            'me.jellysquid.mods.phosphor': 'Phosphor',
            'me.jellysquid.mods.starlight': 'Starlight',
            'com.github.mcjty.rftools': 'RFTools',
            'com.github.mcjty.mcjtylib': 'McJtyLib',
            'com.github.mcjty.xnet': 'XNet',
            'com.github.mcjty.lostcities': 'Lost Cities',
            'org.anti_ad.mc.common': 'Malilib',
            'org.anti_ad.mc.litematica': 'Litematica',
            'net.p3pp3rf1sh.slab_machines': 'Slab Machines',
            'com.github.paulevsGitch.betternether': 'BetterNether',
            'com.github.paulevsGitch.betterend': 'BetterEnd',
            'mod.azure.azurelib': 'AzureLib',
            'com.github.Crimson_Shadow': 'Create (Core)',
            'com.simibubi.create': 'Create',
            'com.jozufozu.flywheel': 'Flywheel',
            'com.tterrag.registrate': 'Registrate',
            'net.darkhax.bookshelf': 'Bookshelf',
            'net.darkhax.gamestages': 'Game Stages',
            'net.darkhax.runelic': 'Runelic',
            'com.github.klikli_dev.occultism': 'Occultism',
            'com.github.klikli_dev.modonomicon': 'Modonomicon',
            'com.github.klikli_dev.theurgy': 'Theurgy'
        };

        if (crashReport) {
             const missingClassMatch = crashReport.content.match(/Caused by: .*NoClassDefFoundError: ([\w\/\.]+)/);
             if (missingClassMatch) {
                 const missingClass = missingClassMatch[1].replace(/\//g, '.');
                 let specificLib = '';
                 for (const [pkg, name] of Object.entries(commonMappings)) {
                     if (missingClass.startsWith(pkg)) {
                         specificLib = name;
                         break;
                     }
                 }

                 return {
                    id: `dep-crash-${server.id}-${Date.now()}`,
                    ruleId: 'mod_dependency',
                    severity: 'CRITICAL',
                    title: specificLib ? `Missing ${specificLib}` : 'Missing Library or Dependency',
                    explanation: specificLib 
                        ? `The server crashed because ${specificLib} is required but not found (missing class: '${missingClass}').`
                        : `The server crashed because a required class was not found: '${missingClass}'. This usually means a library mod is missing.`,
                    recommendation: specificLib 
                        ? `Download and install the latest ${specificLib} for Minecraft ${server.version}.`
                        : 'Install the missing library mod matching your game version.',
                    connectedCrashReport: {
                        id: crashReport.filename,
                        analysis: `Missing Dependency: ${specificLib || missingClass}`
                    },
                    timestamp: Date.now()
                };
             }
        }

        // 2. Standard Log Analysis (Supports multi-line messages)
        const logContent = logs.join('\n');
        const hasRequires = /requires/i.test(logContent);
        const hasMissing = /but (?:none is available|it is not installed)/i.test(logContent) || /Missing dependencies/i.test(logContent);
        
        if (hasRequires && hasMissing) {
             let specificLib = '';
             
             // Try to extract specific mod name
             const nameMatch = logContent.match(/requires (['"\w\-\s\.]+?) but/is);
             if (nameMatch) {
                 specificLib = nameMatch[1].replace(/['"]/g, '').trim();
             }

             if (!specificLib) {
                 if (logContent.includes('fabric')) specificLib = 'Fabric API';
                 if (logContent.includes('architectury')) specificLib = 'Architectury API';
                 if (logContent.includes('quilt')) specificLib = 'Quilt Standard Libraries';
             }

             return {
                id: `dep-${server.id}-${Date.now()}`,
                ruleId: 'mod_dependency',
                severity: 'CRITICAL',
                title: specificLib ? `Missing ${specificLib}` : 'Missing Mod Dependency',
                explanation: specificLib 
                    ? `The server failed to load because ${specificLib} is required by your mods but is not installed.`
                    : `The server failed to load because a mod dependency is missing. Details: "${logContent.substring(0, 150)}..."`,
                recommendation: specificLib 
                    ? `Download and install the latest version of ${specificLib} for Minecraft ${server.version}.`
                    : 'Check the logs for the specific missing mod name and install it.',
                timestamp: Date.now()
             };
        }
        return null;
    }
};

export const DiskSpaceRule: DiagnosisRule = {
    id: 'disk_space_full',
    name: 'Disk Space Exhausted',
    description: 'Checks for "No space left on device" errors',
    triggers: [
        /No space left on device/i,
        /java.io.IOException: (?!.*closed).*/i // Catch generic IO exceptions that might be space related
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const checkSpace = async () => {
            try {
                const disk = require('diskusage');
                const info = await disk.check(server.workingDirectory || process.cwd());
                const freeMb = info.free / (1024 * 1024);
                
                if (freeMb < 200) return 'CRITICAL';
                if (freeMb < 1024) return 'WARNING';
            } catch (e) {}
            return null;
        };

        const hasLogMatch = logs.some(l => /No space left on device/i.test(l));
        const spaceSeverity = await checkSpace();

        if (hasLogMatch || spaceSeverity) {
            const severity = hasLogMatch ? 'CRITICAL' : spaceSeverity!;
            return {
                id: `disk-${server.id}-${Date.now()}`,
                ruleId: 'disk_space_full',
                severity: severity,
                title: severity === 'CRITICAL' ? 'Disk Space Full' : 'Disk Space Running Low',
                explanation: severity === 'CRITICAL' 
                    ? 'The server cannot write any more data because the disk is full. This prevents logs, world saves, and player data from being saved.'
                    : 'The server disk has less than 1GB of free space remaining. This can cause performance degradation or sudden crashes if a backup starts.',
                recommendation: 'Check your server drive for large files, old backups, or massive log files and delete them to free up space.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const ForgeLibraryMissingRule: DiagnosisRule = {
    id: 'forge_libraries_missing',
    name: 'Missing Forge/Fabric Libraries',
    description: 'Checks if the libraries folder exists for modded servers',
    triggers: [
        /Error: Could not find or load main class/i,
        /NoClassDefFoundError: net\/minecraft/i
    ],
    tier: 2,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        const isModded = ['Forge', 'Fabric', 'NeoForge', 'Quilt'].includes(server.software);
        if (!isModded || !server.workingDirectory) return null;

        const libsDir = path.join(server.workingDirectory, 'libraries');
        if (!(await fs.pathExists(libsDir))) {
            return {
                id: `mod-libs-${server.id}-${Date.now()}`,
                ruleId: 'forge_libraries_missing',
                severity: 'CRITICAL',
                title: 'Missing Loader Libraries',
                explanation: `The "libraries" directory is missing. modded servers require this folder to load Minecraft and the modloader.`,
                recommendation: 'Re-run the server installer (Forge/Fabric) to regenerate the libraries folder.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const DuplicateModRule: DiagnosisRule = {
    id: 'duplicate_mod',
    name: 'Duplicate Mods Detected',
    description: 'Checks for duplicate mod entries which crash the loader',
    triggers: [
        /Duplicate mods found/i,
        /Found a duplicate mod/i
    ],
    tier: 2,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const logLine = logs.find(l => /Duplicate mods found/i.test(l) || /Found a duplicate mod/i.test(l));
        if (logLine) {
             const modMatch = logLine.match(/Found a duplicate mod: (\S+)/i) || logLine.match(/Duplicate mods found: ([\w, ]+)/i);
             const modName = modMatch ? modMatch[1] : 'Unknown Mod';

             return {
                id: `dup-mod-${server.id}-${Date.now()}`,
                ruleId: 'duplicate_mod',
                severity: 'CRITICAL',
                title: `Duplicate Mod: ${modName}`,
                explanation: `Multiple versions of the mod '${modName}' are installed, which the mod loader cannot handle.`,
                recommendation: `Check your 'mods' folder and delete older/duplicate versions of ${modName}.`,
                timestamp: Date.now()
            };
        }
        return null;
    }
};

// IncompatibleModsRule moved to ModDiagnosisRules.ts

export const MixinConflictRule: DiagnosisRule = {
    id: 'mixin_conflict',
    name: 'Mixin Conflict',
    description: 'Checks for Sponge/Mixin injection failures',
    triggers: [
        /Mixin apply failed/i,
        /org.spongepowered.asm.mixin.transformer.throwables.MixinTransformerError/i,
        /Critical injection failure/i
    ],
    tier: 3,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const triggerLine = logs.find(l => /Mixin apply failed/i.test(l) || /transformer.throwables.MixinTransformerError/i.test(l) || /Critical injection failure/i.test(l));
        if (triggerLine) {
             const extractionLine = logs.find(l => /in mixin/i.test(l) || /from (?:mod )/i.test(l)) || triggerLine;
             const targetMatch = extractionLine.match(/in mixin ([\w\.]+)/i) || extractionLine.match(/from (?:mod )?([\w\.]+)/i);
             const target = targetMatch ? targetMatch[1] : 'an unknown mod';

             return {
                id: `mixin-${server.id}-${Date.now()}`,
                ruleId: 'mixin_conflict',
                severity: 'CRITICAL',
                title: 'Mod Incompatibility (Mixin)',
                explanation: `A mod (${target}) failed to inject code into Minecraft via Mixin. This usually means two mods are trying to modify the same part of the game.`,
                recommendation: `Try removing '${target}' or checking for an updated version compatible with your other mods.`,
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const TickingEntityRule: DiagnosisRule = {
    id: 'ticking_entity',
    name: 'Ticking Entity Crash',
    description: 'Checks for crashes caused by a specific entity',
    triggers: [
        /Ticking entity/i,
        /Entity being ticked/i
    ],
    tier: 3,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const triggerLine = logs.find(l => /Ticking entity/i.test(l) || /Entity being ticked/i.test(l) || /Description: Ticking entity/i.test(l));
        if (triggerLine) {
             const entityLine = logs.find(l => /Entity Type: ([\w:]+)/i.test(l) || /Entity being ticked: ([\w:]+)/i.test(l)) || triggerLine;
             const posLine = logs.find(l => /at (-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/i.test(l)) || triggerLine;

             const entityMatch = entityLine.match(/Entity Type: ([\w:]+)/i) || entityLine.match(/Entity being ticked: ([\w:]+)/i);
             const posMatch = posLine.match(/at (-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/i);
             
             const entityType = entityMatch ? entityMatch[1] : 'Unknown Entity';
             const position = posMatch ? ` at X:${posMatch[1]}, Y:${posMatch[2]}, Z:${posMatch[3]}` : '';

             return {
                id: `ticking-ent-${server.id}-${Date.now()}`,
                ruleId: 'ticking_entity',
                severity: 'CRITICAL',
                title: `Ticking Entity Crash: ${entityType}`,
                explanation: `A specific entity (${entityType})${position} caused the server to crash. This is often a corrupted entity or a mod bug.`,
                recommendation: `You can try deleting the entity using NBTExplorer or world-edit, or use the automated 'Entity Purge' to have Forge remove it on startup.`,
                action: {
                    type: 'ENABLE_ENTITY_PURGE',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};


// ... DependencyMissing, DuplicateMod, MixinConflict, TickingEntity ...

export const WatchdogRule: DiagnosisRule = {
    id: 'watchdog_crash',
    name: 'Server Watchdog Crash',
    description: 'Checks if the server was killed by the Watchdog due to lag',
    triggers: [
        /The server has stopped responding!/i,
        /Paper Watchdog Thread/i
    ],
    tier: 3,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        if (logs.some(l => /The server has stopped responding!/i.test(l))) {
             return {
                id: `watchdog-${server.id}-${Date.now()}`,
                ruleId: 'watchdog_crash',
                severity: 'CRITICAL',
                title: 'Watchdog Timeout (Lag Crash)',
                explanation: 'The server froze for too long (60s+) and was forcefully stopped by the Watchdog to prevent data loss.',
                recommendation: 'This is usually caused by heavy plugins, too many entities, or insufficient CPU/RAM. Try reducing view-distance in server.properties.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const WorldCorruptionRule: DiagnosisRule = {
    id: 'world_corruption',
    name: 'World Corruption Detected',
    description: 'Checks for level.dat or region file corruption',
    triggers: [
        /Exception reading .*level.dat/i,
        /Chunk file at .* is in the wrong location/i,
        /Corrupted chunk mismatch/i,
        /RegionFile/i,
        /FAILED TO LOAD LEVEL/i,
        /Region file .* is too small/i
    ],
    tier: 3,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        // 1. Crash Report Analysis
        if (crashReport) {
            if (crashReport.content.includes('RegionFile') || crashReport.content.includes('Chunk file at') || crashReport.content.includes('Corrupted chunk')) {
                return {
                    id: `world-crash-${server.id}-${Date.now()}`,
                    ruleId: 'world_corruption',
                    severity: 'CRITICAL',
                    title: 'World Data Corruption (Deep Scan)',
                    explanation: 'The crash report indicates severe corruption in the world save files (Region/Chunk corruption).',
                    recommendation: 'Restore the world from a backup immediately. Do not keep running the server.',
                    connectedCrashReport: {
                        id: crashReport.filename,
                        analysis: 'World Corruption Detected'
                    },
                    timestamp: Date.now()
                };
            }
        }

        // 2. Log Analysis
        const corruptionLine = logs.find(l => 
            /Failed to read level.dat/i.test(l) || 
            /Corrupted chunk/i.test(l) || 
            /Chunk file at .* is in the wrong location/i.test(l) ||
            /Region file .* is too small/i.test(l)
        );

        if (corruptionLine) {
             let chunkInfo = '';
             const coordsMatch = corruptionLine.match(/at (?:chunk )?(-?\d+), (-?\d+)/i);
             if (coordsMatch) {
                 chunkInfo = ` near coordinates X:${parseInt(coordsMatch[1]) * 16}, Z:${parseInt(coordsMatch[2]) * 16} (Chunk ${coordsMatch[1]}, ${coordsMatch[2]})`;
             }

             const isLockIssue = corruptionLine.toLowerCase().includes('session.lock');

             return {
                id: `world-corrupt-${server.id}-${Date.now()}`,
                ruleId: 'world_corruption',
                severity: 'CRITICAL',
                title: 'World Data Corruption Detected',
                explanation: `The server detected corrupted world files${chunkInfo}. This often happens after a power outage, crash, or downgrading Minecraft versions.`,
                recommendation: isLockIssue ? 
                    'A leftover lock file is preventing the server from starting. Auto-Healing can remove it for you.' : 
                    'Restore the world from a backup immediately. If no backup exists, you may need a region repair tool like Chunky.',
                action: isLockIssue ? {
                    type: 'CLEANUP_WORLD_LOCK',
                    payload: { serverId: server.id },
                    autoHeal: true
                } : (corruptionLine.toLowerCase().includes('level.dat') ? {
                    type: 'RESTORE_LEVEL_DATA',
                    payload: { serverId: server.id },
                    autoHeal: true
                } : undefined),
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const InvalidJvmArgsRule: DiagnosisRule = {
    id: 'invalid_jvm_args',
    name: 'Invalid Java Arguments',
    description: 'Detects malformed startup flags that prevent Java from starting',
    triggers: [
        /Initial heap size set to a larger value than the maximum heap size/i,
        /Could not create the Java Virtual Machine/i,
        /Unrecognized VM option/i,
        /Invalid initial heap size/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const errorLine = logs.find(l => /heap size|VM option|Could not create/i.test(l));
        if (errorLine) {
            return {
                id: `jvm-args-${server.id}-${Date.now()}`,
                ruleId: 'invalid_jvm_args',
                severity: 'CRITICAL',
                title: 'Invalid startup arguments',
                explanation: `The Java Virtual Machine failed to start because of an invalid setting: "${errorLine.trim()}"`,
                recommendation: 'The system can reset your RAM settings and flags to safe defaults to fix this.',
                action: {
                    type: 'FIX_JVM_ARGS',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const NativeCrashRule: DiagnosisRule = {
    id: 'native_jvm_crash',
    name: 'JVM/Native Crash',
    description: 'Detects Java Virtual Machine crashes (hs_err_pid)',
    triggers: [
        /hs_err_pid/i,
        /EXCEPTION_ACCESS_VIOLATION/i,
        /SIGSEGV/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        if (crashReport && crashReport.filename.startsWith('hs_err_pid')) {
             return {
                id: `jvm-crash-${server.id}-${Date.now()}`,
                ruleId: 'native_jvm_crash',
                severity: 'CRITICAL',
                title: 'Java Virtual Machine Crash',
                explanation: 'The Java process crashed completely. This is usually caused by outdated Graphics Drivers, incompatible Java versions, or bad hardware (RAM).',
                recommendation: 'Update your Graphics Drivers (NVIDIA/AMD) and ensure you are using the correct Java version for your server software.',
                connectedCrashReport: {
                    id: crashReport.filename,
                    analysis: 'Native JVM Crash'
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const AikarsFlagsRule: DiagnosisRule = {
    id: 'aikars_flags',
    name: 'Missing Performance Flags',
    description: 'Recommends Aikars Flags for servers with sufficient RAM',
    triggers: [], // Run always (or conditionally on startup)
    tier: 3,
    defaultConfidence: 100,
    isHealable: true,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        // Only applies to Java servers (Paper/Forge/Spigot)
        const isGameServer = ['Paper', 'Spigot', 'Purpur', 'Forge', 'NeoForge', 'Fabric', 'Quilt'].includes(server.software);
        if (!isGameServer) return null;

        if (server.ram >= 4 && !server.advancedFlags?.aikarFlags) {
            return {
                id: `aikar-tip-${server.id}-${Date.now()}`,
                ruleId: 'aikars_flags',
                severity: 'INFO',
                title: 'Optimization Recommendation',
                explanation: `Your server has ${server.ram}GB RAM but isn't using Aikar's Flags. These start-up flags can significantly reduce lag spikes.`,
                recommendation: 'Go to Settings > Advanced and enable "Aikar\'s Flags".',
                action: {
                    type: 'OPTIMIZE_ARGUMENTS',
                    payload: { serverId: server.id, optimized: true },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const TelemetryRule: DiagnosisRule = {
    id: 'telemetry_cleanup',
    name: 'Massive Telemetry Logs',
    description: 'Detects if log files are becoming too large or accumulating excessively',
    triggers: [
        /Stopping!/i,
        /Saving chunks/i
    ],
    tier: 3,
    defaultConfidence: 85,
    isHealable: true,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const logPath = path.join(server.workingDirectory, 'logs', 'latest.log');
        const logsDir = path.join(server.workingDirectory, 'logs');
        
        let fileSizeMb = 0;
        let fileCount = 0;

        try {
            if (await fs.pathExists(logPath)) {
                const stats = await fs.stat(logPath);
                fileSizeMb = stats.size / (1024 * 1024);
            }
            if (await fs.pathExists(logsDir)) {
                const files = await fs.readdir(logsDir);
                fileCount = files.length;
            }
        } catch (e) {}

        const bufferFull = logs.length >= 2000;
        
        // Smarter Logic:
        // 1. WARNING: Actual massive disk usage (latest.log > 100MB or > 500 files)
        // 2. INFO: High session activity (Buffer full + moderate size/count)
        
        const isWarning = fileSizeMb > 100 || fileCount > 500;
        const isInfo = (bufferFull && fileSizeMb > 20) || fileCount > 200;

        if (isWarning || isInfo) {
            return {
                id: `telemetry-${server.id}-${Date.now()}`,
                ruleId: 'telemetry_cleanup',
                severity: isWarning ? 'WARNING' : 'INFO',
                title: isWarning ? 'Critical Log Bloat' : 'Log Management Advised',
                explanation: isWarning 
                    ? `The server logs have grown extremely large (${Math.round(fileSizeMb)}MB, ${fileCount} files). This can cause disk exhaustion and slow down the panel.`
                    : `The server has generated a high volume of telemetry data in this session (${logs.length} lines buffered).`,
                recommendation: 'Cleanup log files and temporary locks to ensure smooth performance.',
                action: {
                    type: 'CLEANUP_TELEMETRY',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const NetworkProtocolRule: DiagnosisRule = {
    id: 'network_protocol',
    name: 'Protocol/Mod Mismatch',
    description: 'Checks for connection failures due to version or mod variations',
    triggers: [
        /DecoderException/i,
        /Bad Packet/i,
        /Outdated server/i,
        /Outdated client/i,
        /Incompatible FML modded server/i
    ],
    tier: 3,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const mismatch = logs.find(l => /Outdated/i.test(l) || /Incompatible/i.test(l));
        if (mismatch) {
            return {
                id: `proto-${server.id}-${Date.now()}`,
                ruleId: 'network_protocol',
                severity: 'WARNING',
                title: 'Client/Server Version Mismatch',
                explanation: 'A player tried to join with an incompatible Minecraft version or Mod Client.',
                recommendation: 'Ensure all players are using the exact same Minecraft version and Modpack version as the server.',
                timestamp: Date.now()
            };
        }

        if (logs.some(l => /DecoderException/i.test(l) || /Bad Packet/i.test(l))) {
             return {
                id: `proto-bad-${server.id}-${Date.now()}`,
                ruleId: 'network_protocol',
                severity: 'WARNING',
                title: 'Mod Packet Error (DecoderException)',
                explanation: 'The server received a packet it could not understand. This usually happens when a player has a different version of a mod than the server.',
                recommendation: 'Check that the client has the EXACT same mods and config as the server. Re-install the modpack on the client.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const PacketTooBigRule: DiagnosisRule = {
    id: 'packet_overflow',
    name: 'Packet Too Big (NBT Overflow)',
    description: 'Checks for PacketTooBigException',
    triggers: [
        /PacketTooBigException/i,
        /Packet was larger than/i
    ],
    tier: 3,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        if (logs.some(l => /PacketTooBig/i.test(l))) {
             return {
                id: `packet-big-${server.id}-${Date.now()}`,
                ruleId: 'packet_overflow',
                severity: 'CRITICAL',
                title: 'NBT Data Overflow (Bad Item)',
                explanation: 'A player tried to send too much data (usually a "Book and Quill" exploit or a massive backpack item). The server kicked them to protect itself.',
                recommendation: 'If this persists, set "max-chained-neighbor-updates" higher in server.properties or delete the player\'s data file.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const NetworkOfflineRule: DiagnosisRule = {
    id: 'network_offline',
    name: 'Authentication/Network Failure',
    description: 'Checks for offline mode or Mojang connection failures',
    triggers: [
        /UnknownHostException: .*mojang\.com/i,
        /Failed to connect.*mojang/i,
        /SocketException.*mojang/i,
        /The server cannot connect to Mojang/i
    ],
    tier: 1,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const fullLog = crashReport ? crashReport.content : logs.join('\n');
        
        if (/(?:UnknownHostException|SocketException|Failed to connect).*(?:mojang\.com)/i.test(fullLog) || /The server cannot connect to Mojang/i.test(fullLog)) {
             return {
                id: `net-off-${server.id}-${Date.now()}`,
                ruleId: 'network_offline',
                severity: 'WARNING',
                title: 'Network Connectivity Issue',
                explanation: 'The server cannot connect to Mojang authentication servers. This prevents online-mode players from joining.',
                recommendation: 'Check your internet connection or firewall. If you want to play offline, set online-mode=false in settings (INSECURE).',
                timestamp: Date.now(),
                isHealable: true,
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { 'online-mode': false }
                }
            };
        }
        return null;
    }
};

export const ConfigSyncRule: DiagnosisRule = {
    id: 'config_sync',
    name: 'Configuration Out of Sync',
    description: 'Checks if server.properties matches the configured settings in the dashboard',
    triggers: [], // Run periodically/manually
    tier: 2,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const sync = await serverConfigService.verifyConfig(server);
        if (!sync.synchronized && sync.mismatches.length > 0) {
            const mismatchList = sync.mismatches.map(m => `${m.setting} (${m.diskValue} vs ${m.dbValue})`).join(', ');
            return {
                id: `sync-${server.id}-${Date.now()}`,
                ruleId: 'config_sync',
                severity: sync.mismatches.some(m => m.severity === 'high') ? 'CRITICAL' : 'WARNING',
                title: 'Configuration Mismatch',
                explanation: `The following settings in server.properties do not match the dashboard: ${mismatchList}`,
                recommendation: 'Synchronize your configuration to ensure the server starts with the correct settings.',
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { serverId: server.id, sync: true } // Trigger enforcement
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const MemoryMonitorRule: DiagnosisRule = {
    id: 'memory_leak',
    name: 'Memory Leak Detection',
    description: 'Monitors the process heap usage for potential leaks',
    tier: 3,
    defaultConfidence: 70,
    triggers: [], // Run periodically
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const mem = process.memoryUsage();
        const heapUsedGb = mem.heapUsed / 1024 / 1024 / 1024;
        const heapTotalGb = mem.heapTotal / 1024 / 1024 / 1024;
        
        // Threshold: 85% of total heap used
        if (heapUsedGb / heapTotalGb > 0.85 && heapTotalGb > 0.5) {
            return {
                id: `mem-leak-${Date.now()}`,
                ruleId: 'memory_leak',
                severity: 'WARNING',
                title: 'High Memory Usage (Potential Leak)',
                explanation: `The panel process is using ${Math.round(heapUsedGb * 1024)}MB of heap memory (${Math.round((heapUsedGb/heapTotalGb)*100)}%). This may indicate a memory leak.`,
                recommendation: 'Take a heap snapshot to analyze the leak. We can automate this for you.',
                action: {
                    type: 'TAKE_HEAP_SNAPSHOT',
                    payload: { reason: 'high_memory' },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const DataIntegrityRule: DiagnosisRule = {
    id: 'data_integrity',
    name: 'Database Integrity Check',
    description: 'Verifies the integrity of core JSON storage files',
    tier: 1,
    defaultConfidence: 100,
    triggers: [], // Run periodically
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const { DATA_DIR } = require('../../constants');
        const filesToTask = ['servers.json', 'users.json', 'audit.json'];
        
        for (const filename of filesToTask) {
            const filePath = path.join(DATA_DIR, filename);
            if (await fs.pathExists(filePath)) {
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    JSON.parse(content);
                } catch (e) {
                    return {
                        id: `corrupt-${filename}-${Date.now()}`,
                        ruleId: 'data_integrity',
                        severity: 'CRITICAL',
                        title: `Database Corruption: ${filename}`,
                        explanation: `The file '${filename}' is corrupted or contains invalid JSON and cannot be read.`,
                        recommendation: 'Restore the file from its last successful backup (.bak).',
                        action: {
                            type: 'RESTORE_DATA_BACKUP',
                            payload: { filename },
                            autoHeal: true
                        },
                        timestamp: Date.now()
                    };
                }
            }
        }
        return null;
    }
};

export const TpsLagRule: DiagnosisRule = {
    id: 'tps_lag',
    name: 'Server TPS Performance',
    description: 'Monitors Ticks Per Second and "Can\'t keep up" warnings',
    tier: 3,
    defaultConfidence: 85,
    triggers: [], // Metrics and logs
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const lagLines = logs.filter(l => l.includes("Can't keep up!"));
        
        // Smarter lagging:
        // Use INFO for minor occurrences, WARNING for persistent lag.
        // Sensitivity increased: > 5 for INFO, > 20 for WARNING.
        if (lagLines.length > 5) {
            const isPersistent = lagLines.length > 20;
            return {
                id: `lag-logs-${server.id}-${Date.now()}`,
                ruleId: 'tps_lag',
                severity: isPersistent ? 'WARNING' : 'INFO',
                title: isPersistent ? 'Persistent Server Lag' : 'Minor Lag Detected',
                explanation: isPersistent 
                    ? `The server is frequently reporting "Can't keep up!". This means the CPU is consistently unable to process game ticks fast enough.`
                    : 'The server reported "Can\'t keep up!" several times recently. This often happens during heavy world generation or when many chunks are loading.',
                recommendation: 'If this persists, evaluate your plugin/mod usage or reduce simulation-distance.',
                timestamp: Date.now()
            };
        }

        if (env.tps !== undefined && env.tps < 10 && env.tps > 0) {
            return {
                id: `lag-tps-${server.id}-${Date.now()}`,
                ruleId: 'tps_lag',
                severity: 'CRITICAL',
                title: 'Severe Checkpoint Lag',
                explanation: `Current TPS is ${env.tps.toFixed(2)}, which is critically low (Standard is 20.0). Players will experience significant delay.`,
                recommendation: 'Perform a /spark profiler run to identify the cause of the lag.',
                timestamp: Date.now()
            };
        }

        return null;
    }
};

export const ResourceExhaustionRule: DiagnosisRule = {
    id: 'cpu_exhaustion',
    name: 'Resource Exhaustion',
    description: 'Detects CPU starvation and thread locking',
    tier: 1,
    defaultConfidence: 90,
    triggers: [], // Metrics and logs
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (env.cpu !== undefined && env.cpu > 90 && (env.tps || 20) < 18) {
            return {
                id: `cpu-exhaust-${server.id}-${Date.now()}`,
                ruleId: 'cpu_exhaustion',
                severity: 'CRITICAL',
                title: 'CPU Overload (Thread Starvation)',
                explanation: `System CPU usage is at ${Math.round(env.cpu)}% and TPS has dropped. The server is starving for processing time.`,
                recommendation: 'Check for other processes using CPU or upgrade the host CPU.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

const NodeHealthRule: DiagnosisRule = {
    id: 'node_health',
    name: 'Node Health Check',
    description: 'Checks if the server\'s assigned node is offline',
    triggers: [], // Metrics-based trigger
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (env.nodeStatus === 'OFFLINE') {
            return {
                id: `node-offline-${server.id}-${Date.now()}`,
                ruleId: 'node_health',
                severity: 'CRITICAL',
                title: 'Node Connection Lost',
                explanation: `The node hosting this server ("${server.nodeId}") has not sent a heartbeat recently. The server may still be running but is unreachable for management.`,
                recommendation: 'Check if the node agent is running and has internet access.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Detects log spamming which can cause disk exhaustion and lag
 */
export const LogSpamRule: DiagnosisRule = {
    id: 'log_spam_detected',
    name: 'Critical Log Spam',
    description: 'Detects excessive repetitive logging typically caused by broken plugins or entity errors.',
    triggers: [
        /\[STDOUT\]/i,
        /Skipping Entity with id/i,
        /Keeping entity .* that already exists with UUID/i,
        /can't keep up!/i
    ],
    tier: 3,
    defaultConfidence: 75,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        // Count repetitive lines
        const lineCounts: Record<string, number> = {};
        let heavySpam = false;
        let spamPattern = '';

        for (const line of logs.slice(-200)) {
            // Remove timestamps and levels for better matching
            const content = line.replace(/^\d{2}:\d{2}:\d{2} \[(INFO|WARN|ERROR)\]:? /i, '').trim();
            if (content.length < 10) continue;
            
            lineCounts[content] = (lineCounts[content] || 0) + 1;
            if (lineCounts[content] > 30) {
                heavySpam = true;
                spamPattern = content;
                break;
            }
        }

        if (heavySpam) {
            return {
                id: `spam-${server.id}-${Date.now()}`,
                ruleId: 'log_spam_detected',
                severity: 'WARNING',
                title: 'Aggressive Log Spam Detected',
                explanation: `The server is spamming identical log messages repeatedly: "${spamPattern.substring(0, 50)}...". This can lead to massive log files and server lag.`,
                recommendation: 'Check the mentioned plugin or entity. You may need to kill the ticking entity or update the offending plugin.',
                timestamp: Date.now(),
                confidence: 85
            };
        }
        return null;
    }
};

export const PlayerDataCorruptionRule: DiagnosisRule = {
    id: 'player_data_corruption',
    name: 'Player Data Corruption',
    description: 'Detects when a specific player\'s data file (.dat) is corrupted, preventing them from joining.',
    tier: 3,
    defaultConfidence: 90,
    triggers: [
        /Cannot read player data/i,
        /Failed to load player data/i
    ],
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const fullLog = logs.join('\n');
        const match = fullLog.match(/(?:Cannot read player data|Failed to load player data for) (.*)/i);
        
        if (match) {
            const playerContext = match[1].substring(0, 30).trim(); // Might contain UUID or name
            return {
                id: `player-data-${server.id}-${Date.now()}`,
                ruleId: 'player_data_corruption',
                severity: 'WARNING',
                title: 'Corrupted Player Data',
                explanation: `The server failed to read the player data file for ${playerContext}. This usually happens if the server crashed while saving their inventory or position.`,
                recommendation: `Navigate to the \`world/playerdata\` folder and delete or rename the \`.dat\` file associated with this player to reset their data so they can join again.`,
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const BrokenDatapackRule: DiagnosisRule = {
    id: 'broken_datapack',
    name: 'Broken Datapack',
    description: 'Detects when a world\'s datapack is broken and preventing the world from loading.',
    tier: 3,
    defaultConfidence: 100,
    triggers: [
        /Failed to validate datapack/i,
        /Errors in datapack/i,
        /Couldn't load datapack/i
    ],
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const fullLog = logs.join('\n');
        
        const packMatch = fullLog.match(/(?:Failed to validate datapack|Couldn't load datapack) (.*)/i);
        if (packMatch || /Errors in datapack/i.test(fullLog)) {
             const packName = packMatch ? packMatch[1] : 'an installed datapack';
             
             return {
                id: `datapack-err-${server.id}-${Date.now()}`,
                ruleId: 'broken_datapack',
                severity: 'CRITICAL',
                title: 'Datapack Load Failure',
                explanation: `The server failed to load ${packName} because it contains syntax errors or is incompatible with this version of Minecraft. This is preventing the world from starting.`,
                recommendation: `Boot the server in safe mode (which skips datapacks), run \`/datapack disable <name>\`, then stop the server and restart normally. Or manually delete it from \`world/datapacks\`.`,
                 timestamp: Date.now()
             };
        }
        return null;
    }
};

export const CoreRules: DiagnosisRule[] = [
    ...UpdateRules,
    ResourceExhaustionRule, // Moved to top for debug
    EulaRule,
    MissingDirectoryRule,
    InsufficientRamRule,
    PortConflictRule,
    JavaVersionRule,
    MemoryRule,
    MissingJarRule,
    BadConfigRule,
    PermissionRule,
    InvalidIpRule,
    DependencyMissingRule,
    DuplicateModRule,
    InvalidJvmArgsRule,
    MixinConflictRule,
    TickingEntityRule,
    WatchdogRule,
    WorldCorruptionRule,
    NativeCrashRule,
    AikarsFlagsRule,
    TelemetryRule,
    NetworkProtocolRule,
    PacketTooBigRule,
    NetworkOfflineRule,
    ConfigSyncRule,
    MemoryMonitorRule,
    DataIntegrityRule,
    TpsLagRule,
    NodeHealthRule,
    DiskSpaceRule,
    ForgeLibraryMissingRule,
    LogSpamRule,
    PlayerDataCorruptionRule,
    BrokenDatapackRule,
    ...PluginRules,
    ...BedrockRules,
    ...VelocityRules,
    ...NetworkRules,
    ...NodeRules,
    ...JavaRules,
    ...ModDiagnosisRules,
    ...CrossPlayRules,
    ...MapRules,
    ...PredictiveRules,
    ...ResourceAdvisorRules,
    ...ConnectivityRules,
    ...HostingOSRules
];
