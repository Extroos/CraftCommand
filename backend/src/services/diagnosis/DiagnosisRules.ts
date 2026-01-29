
import { DiagnosisRule, DiagnosisResult, SystemStats } from './DiagnosisService';
import { ServerConfig } from '../../../../shared/types';
import { ConfigReader } from '../../utils/ConfigReader';
import { EnvironmentProbe } from '../../utils/EnvironmentProbe';
import path from 'path';

export const EulaRule: DiagnosisRule = {
    id: 'eula_check',
    name: 'EULA Agreement Check',
    description: 'Checks if the user has agreed to the Minecraft EULA',
    triggers: [
        /You need to agree to the EULA/i,
        /eula.txt/i
    ],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const hasLog = logs.some(l => l.includes('agree to the EULA'));
        if (!hasLog) return null;

        const isAgreed = await ConfigReader.checkEula(server.workingDirectory);
        if (!isAgreed) {
            return {
                id: `eula-${server.id}-${Date.now()}`,
                ruleId: 'eula_check',
                severity: 'CRITICAL',
                title: 'EULA Not Accepted',
                explanation: 'The server cannot start because the End User License Agreement (EULA) has not been accepted.',
                recommendation: 'You must agree to the Minecraft EULA to run this server.',
                action: {
                    type: 'AGREE_EULA',
                    payload: { serverId: server.id }
                },
                timestamp: Date.now()
            };
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
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        // Double check log presence to be sure
        const hasError = logs.some(l => /FAILED TO BIND|Address already in use|BindException/i.test(l));
        if (!hasError) return null;

        return {
            id: `port-${server.id}-${Date.now()}`,
            ruleId: 'port_binding',
            severity: 'CRITICAL',
            title: 'Port Conflict Detected',
            explanation: `The server failed to start because port ${server.port} is already being used by another program (or another instance of this server).`,
            recommendation: 'Change the server port in Settings or stop the other application using this port.',
            action: {
                type: 'UPDATE_CONFIG',
                payload: { serverId: server.id, key: 'port-auto-fix' } // Placeholder for frontend auto-fix
            },
            timestamp: Date.now()
        };
    }
};

export const JavaVersionRule: DiagnosisRule = {
    id: 'java_version',
    name: 'Java Version Mismatch',
    description: 'Checks if the Java version matches the mod loader requirements',
    triggers: [
        /UnsupportedClassVersionError/i,
        /has been compiled by a more recent version of the Java Runtime/i,
        /Java 17 is required/i,
        /Java 21 is required/i
    ],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const hasError = logs.some(l => /UnsupportedClassVersionError/i.test(l) || /compiled by a more recent version/i.test(l));
        if (!hasError) return null;

        const currentJava = server.javaVersion;
        let requiredJava = 'Java 17'; // Guess default

        // Try to parse what was needed from logs
        const logContent = logs.join(' ');
        if (logContent.includes('class file version 61.0')) requiredJava = 'Java 17';
        if (logContent.includes('class file version 65.0')) requiredJava = 'Java 21';
        if (logContent.includes('class file version 60.0')) requiredJava = 'Java 16';

        // Check against actual installed Java
        // (env.javaVersion is passed in but might be from system default, we want server specific)
        // Ideally we check what the server is configured to use.
        
        return {
            id: `java-${server.id}-${Date.now()}`,
            ruleId: 'java_version',
            severity: 'CRITICAL',
            title: 'Incompatible Java Version',
            explanation: `Your server requires ${requiredJava} or newer, but it tried to start with ${currentJava} (or an older system default).`,
            recommendation: `Switch the server's Java Version to ${requiredJava} in the settings tab.`,
            action: {
                type: 'SWITCH_JAVA',
                payload: { serverId: server.id, version: requiredJava }
            },
            timestamp: Date.now()
        };
    }
};

export const MemoryRule: DiagnosisRule = {
    id: 'memory_oom',
    name: 'Out of Memory',
    description: 'Checks for OutOfMemoryErrors',
    triggers: [
        /OutOfMemoryError/i,
        /Java heap space/i
    ],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
         const hasError = logs.some(l => /OutOfMemoryError/i.test(l) || /Java heap space/i.test(l));
         if (!hasError) return null;

         const currentRam = server.ram;
         const recommendation = currentRam < 8 ? `Increase RAM from ${currentRam}GB to ${currentRam + 2}GB.` : `Optimize your server with Spark or reduce the number of mods.`;

         return {
            id: `oom-${server.id}-${Date.now()}`,
            ruleId: 'memory_oom',
            severity: 'CRITICAL',
            title: 'Out Of Memory (OOM)',
            explanation: `The server ran out of specific memory (RAM) allocated to it (${currentRam}GB).`,
            recommendation: recommendation,
            action: {
                type: 'UPDATE_CONFIG',
                payload: { serverId: server.id, ram: currentRam + 1 }
            },
            timestamp: Date.now()
         };
    }
};

import fs from 'fs-extra'; // Added import

export const MissingJarRule: DiagnosisRule = {
    id: 'missing_jar',
    name: 'Missing Server Jar',
    description: 'Checks if the server JAR file exists and is accessible',
    triggers: [
        /Error: Unable to access jarfile/i
    ],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        // Check logs first
        const logMatch = logs.some(l => /Unable to access jarfile/i.test(l));
        
        // Also check file system directly
        const exec = server.executable || 'server.jar';
        const jarPath = path.isAbsolute(exec) ? exec : path.join(server.workingDirectory, exec);
        const exists = await fs.pathExists(jarPath);

        if (logMatch || !exists) {
            return {
                id: `missing-jar-${server.id}-${Date.now()}`,
                ruleId: 'missing_jar',
                severity: 'CRITICAL',
                title: 'Server Executable Missing',
                explanation: `The server file '${exec}' could not be found or accessed.`,
                recommendation: 'Ensure the server JAR file exists in the server directory or update your settings to point to the correct file.',
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
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (logs.some(l => /Failed to load properties/i.test(l))) {
             return {
                id: `bad-config-${server.id}-${Date.now()}`,
                ruleId: 'bad_config',
                severity: 'CRITICAL',
                title: 'Corrupted Configuration',
                explanation: 'The server.properties file is malformed or corrupted.',
                recommendation: 'Delete server.properties to let the server regenerate it, or fix the syntax errors.',
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
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
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
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
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
        /Unknown dependency/i
    ],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const errorLine = logs.find(l => /requires \S+ but none is available/i.test(l) || /Missing dependencies/i.test(l));
        if (errorLine) {
             return {
                id: `dep-${server.id}-${Date.now()}`,
                ruleId: 'mod_dependency',
                severity: 'CRITICAL',
                title: 'Missing Mod Dependency',
                explanation: `The server failed to load because a mod dependency is missing. Error trace: "${errorLine.substring(0, 100)}..."`,
                recommendation: 'Check the logs for the specific missing mod name and install it.',
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
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (logs.some(l => /Duplicate mods found/i.test(l) || /Found a duplicate mod/i.test(l))) {
             return {
                id: `dup-mod-${server.id}-${Date.now()}`,
                ruleId: 'duplicate_mod',
                severity: 'CRITICAL',
                title: 'Duplicate Mods Detected',
                explanation: 'Multiple versions of the same mod are installed, causing a conflict.',
                recommendation: 'Check your mods folder and delete older/duplicate execution of the same mod.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const MixinConflictRule: DiagnosisRule = {
    id: 'mixin_conflict',
    name: 'Mixin Conflict',
    description: 'Checks for Sponge/Mixin injection failures',
    triggers: [
        /Mixin apply failed/i,
        /org.spongepowered.asm.mixin.transformer.throwables.MixinTransformerError/i
    ],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
         if (logs.some(l => /Mixin apply failed/i.test(l) || /MixinTransformerError/i.test(l))) {
             return {
                id: `mixin-${server.id}-${Date.now()}`,
                ruleId: 'mixin_conflict',
                severity: 'CRITICAL',
                title: 'Mod Incompatibility (Mixin)',
                explanation: 'A mod is failing to inject code into the game (Mixin Error). This usually means two mods are incompatible.',
                recommendation: 'Try removing recently added mods or check mod compatibility lists.',
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
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        const errorLine = logs.find(l => /Ticking entity/i.test(l));
        if (errorLine) {
             return {
                id: `tick-ent-${server.id}-${Date.now()}`,
                ruleId: 'ticking_entity',
                severity: 'CRITICAL',
                title: 'Ticking Entity Crash',
                explanation: 'The server crashed while processing a specific entity (mob/item).',
                recommendation: 'You may need to use a tool like NBTExplorer to remove the entity, or set remove-erroring-entities=true in config (Forge).',
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
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
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
        /Corrupted chunk mismatch/i
    ],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (logs.some(l => /Exception reading .*level.dat/i.test(l) || /Corrupted chunk/i.test(l))) {
             return {
                id: `world-corrupt-${server.id}-${Date.now()}`,
                ruleId: 'world_corruption',
                severity: 'CRITICAL',
                title: 'World Data Corruption',
                explanation: 'The server detected corrupted world files (level.dat or chunks). This often happens after a power outage or crash.',
                recommendation: 'Restore the world from a backup immediately. Do not keep running the server as it may cause further damage.',
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
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        // Only valid if server is ONLINE or logs indicate recent start? 
        // Actually diagnosis is usually run when things go wrong OR manually.
        // It's a TIP.
        
        if (server.ram >= 4 && !server.advancedFlags?.aikarFlags) {
            return {
                id: `aikar-tip-${server.id}-${Date.now()}`,
                ruleId: 'aikars_flags',
                severity: 'INFO',
                title: 'Optimization Recommendation',
                explanation: `Your server has ${server.ram}GB RAM but isn't using Aikar's Flags. These start-up flags can significantly reduce lag spikes.`,
                recommendation: 'Go to Settings > Advanced and enable "Aikar\'s Flags".',
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { serverId: server.id, key: 'enable_aikars_flags' } // Placeholder
                },
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
        /UnknownHostException/i,
        /authserver.mojang.com/i,
        /sessionserver.mojang.com/i
    ],
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
        if (logs.some(l => /UnknownHostException/i.test(l) || /authserver\.mojang\.com/i.test(l))) {
             return {
                id: `net-off-${server.id}-${Date.now()}`,
                ruleId: 'network_offline',
                severity: 'WARNING',
                title: 'Network Connectivity Issue',
                explanation: 'The server cannot connect to Mojang authentication servers. This prevents online-mode players from joining.',
                recommendation: 'Check your internet connection or firewall. If you want to play offline, set online-mode=false in settings (INSECURE).',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const CoreRules = [
    EulaRule, PortConflictRule, JavaVersionRule, MemoryRule, 
    MissingJarRule, BadConfigRule, PermissionRule, InvalidIpRule,
    DependencyMissingRule, DuplicateModRule, MixinConflictRule, TickingEntityRule,
    WatchdogRule, WorldCorruptionRule, AikarsFlagsRule, NetworkOfflineRule
];
