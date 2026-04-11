import { DiagnosisRule, ServerConfig, DiagnosisResult, SystemStats } from './types';
import { CrashReport } from './CrashReportReader';
import fs from 'fs-extra';
import path from 'path';

export const ModDependencyMappings: Record<string, string> = {
    'net.fabricmc.api': 'Fabric API',
    'net.fabricmc.loader': 'Fabric Loader',
    'dev.architectury': 'Architectury API',
    'me.shedaniel': 'Cloth Config',
    'com.electronwill.nightconfig': 'NightConfig',
    'org.spongepowered.asm': 'Mixin bootstrap',
    'org.quiltmc': 'Quilt Standard Libraries',
    'software.bernie.geckolib': 'Geckolib',
    'vazkii.patchouli': 'Patchouli',
    'vazkii.quark': 'Quark',
    'vazkii.botania': 'Botania',
    'com.feed_the_beast.ftblib': 'FTB Library',
    'com.feed_the_beast.ftbquests': 'FTB Quests',
    'com.feed_the_beast.ftbteams': 'FTB Teams',
    'com.feed_the_beast.ftbchunks': 'FTB Chunks',
    'com.blamejared.crafttweaker': 'CraftTweaker',
    'com.github.glitchfiend.biomesoplenty': 'Biomes O Plenty',
    'com.terraformersmc.modmenu': 'Mod Menu',
    'me.jellysquid.mods.sodium': 'Sodium',
    'me.jellysquid.mods.lithium': 'Lithium',
    'me.jellysquid.mods.phosphor': 'Phosphor',
    'com.github.mcjty.rftools': 'RFTools',
    'com.github.mcjty.mcjtylib': 'McJtyLib',
    'org.anti_ad.mc.common': 'Malilib',
    'org.anti_ad.mc.litematica': 'Litematica',
    'mod.azure.azurelib': 'AzureLib',
    'com.simibubi.create': 'Create',
    'com.jozufozu.flywheel': 'Flywheel',
    'net.darkhax.bookshelf': 'Bookshelf',
    'top.theillusivec4.curios': 'Curios API',
    'com.github.almasb': 'FXGL',
    'com.github.benmanes.caffeine': 'Caffeine (core library)',
    'net.minecraftforge.fml': 'Forge Mod Loader',
    'com.pixelmonmod': 'Pixelmon',
    'me.lucko.luckperms': 'LuckPerms',
    'com.viaversion': 'ViaVersion',
    'com.comphenix.protocol': 'ProtocolLib',
    'de.tr7zw.nbtapi': 'NBTAPI',
    'kotlin': 'Kotlin Standard Library',
    'scala': 'Scala Standard Library',
    'com.google.gson': 'GSON',
    'vazkii.psi': 'Psi',
    'com.github.mcjty.xnet': 'XNet',
    'com.github.mcjty.lostcities': 'Lost Cities',
    'com.github.klikli_dev.occultism': 'Occultism',
    'com.github.klikli_dev.modonomicon': 'Modonomicon',
    'com.github.klikli_dev.theurgy': 'Theurgy'
};

export const ModrinthProjectMappings: Record<string, string> = {
    'Fabric API': 'P7dR8mSH',
    'Architectury API': 'lh8MmvaS',
    'Cloth Config': '9S6H3qIA',
    'Geckolib': '8BmcpfNu',
    'Patchouli': 'vazkii-patchouli', // Some use slugs
    'Quark': 'quark',
    'Botania': 'botania',
    'AzureLib': '8D3m9VAn',
    'Curios API': 'lu6m9BnW',
    'Bookshelf': 'nU07969L',
    'Resourceful Lib': '8798956' // Example
};

export const IncompatibleModsRule: DiagnosisRule = {
    id: 'incompatible_mods',
    name: 'Incompatible Mods',
    description: 'Detects mod loader conflicts and suggestions',
    triggers: [
        /Some of your mods are incompatible/i,
        /FormattedException/i,
        /Incompatible mods found/i,
        /fundamentally incompatible mods/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const fullLog = logs.join('\n');
        
        // --- SMART HANDLING (v4.5) ---
        // If we previously had incompatible mods, but the user deleted everything 
        // in the mods folder (or used a fix), we ignore the log.
        const modsDir = path.join(server.workingDirectory, 'mods');
        if (await fs.pathExists(modsDir)) {
            const files = await fs.readdir(modsDir);
            if (files.filter(f => f.endsWith('.jar')).length === 0) return null;
        }

        if (/Some of your mods are incompatible!|Incompatible mods found!|fundamentally incompatible mods/i.test(fullLog)) {
            // ... rest of logic remains but is now protected by the state check above ...
            const solutionBlockMatch = fullLog.match(/A potential solution has been determined(?:.*?)\n((?:\s*-\s*.*\n?)+)/i);
            const rawSolutions = solutionBlockMatch ? solutionBlockMatch[1] : '';
            
            const solutions = rawSolutions
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.startsWith('-'))
                .map(l => l.replace(/^- /, '• '))
                .join('\n');
                
            let action: any = undefined;
            const suggestMcUpgrade = rawSolutions.includes('replace [[minecraft') || rawSolutions.includes('add:minecraft');
            
            let customExplanation = suggestMcUpgrade 
                ? `Installed mod requires a newer Minecraft version.`
                : `Mod loader detected incompatible mods.`;
            
            let customRecommendation = solutions ? `Suggested solutions:\n${solutions}` : `Ensure mods are compatible with Minecraft ${server.version}.`;

            if (suggestMcUpgrade) {
                customRecommendation = `Mod loader suggests upgrading Minecraft. Match mod version to Minecraft ${server.version} instead.`;
            }

            const installMatches = [...rawSolutions.matchAll(/- Install ([^,\n]+?)(?:,\s*version\s+([^\s]+)\s+or later)?\.?\s*$/gim)];
            const missingDeps: string[] = [];
            for (const m of installMatches) {
                const depSlug = m[1].trim().toLowerCase();
                if (!['java', 'minecraft', 'fabricloader', 'forge'].includes(depSlug)) {
                    missingDeps.push(depSlug);
                }
            }

            const detailsBlockMatch = fullLog.match(/More details:[\s\S]+/i);
            const requirerNames: string[] = [];
            if (detailsBlockMatch) {
                const extractRegex = /- Mod '([^']+)'/ig;
                let m;
                while ((m = extractRegex.exec(detailsBlockMatch[0])) !== null) {
                    if (!requirerNames.includes(m[1])) requirerNames.push(m[1]);
                }
            }

            if (missingDeps.length > 0) {
                const uniqueDeps = [...new Set(missingDeps)];
                action = {
                    type: 'INSTALL_DEPENDENCY',
                    payload: { name: uniqueDeps.join(','), serverId: server.id },
                    automaticRepair: false
                };
                customExplanation = `${requirerNames.length > 0 ? requirerNames.join(', ') : 'One or more mods'} requires missing dependencies: ${uniqueDeps.join(', ')}.`;
                customRecommendation = `Auto-install missing dependencies: ${uniqueDeps.join(', ')}.`;
            } else if (requirerNames.length > 0 && !suggestMcUpgrade) {
                customExplanation = `Mod(s) '${requirerNames.join(', ')}' have conflicts with Minecraft ${server.version}.`;
                customRecommendation = `Use mod versions compatible with Minecraft ${server.version}.`;
            }

            return {
                id: `incompatible-${server.id}-${Date.now()}`,
                ruleId: 'incompatible_mods',
                severity: 'CRITICAL',
                title: 'Incompatible Mods',
                explanation: customExplanation,
                recommendation: customRecommendation,
                action: action,
                evidence: logs.find(l => /incompatible|solution|details/i.test(l))?.trim() || fullLog.split('\n')[0],
                timestamp: Date.now(),
                isRepairable: !!action
            };
        }
        return null;
    }
};

export const ModDependencyRule: DiagnosisRule = {
    id: 'mod_dependency',
    name: 'Missing Mod Library',
    description: 'Checks for missing dependencies or library mods',
    triggers: [
        /requires .* but none is available/i,
        /Missing dependencies/i,
        /Caused by: .*ClassNotFoundException/i,
        /Caused by: .*NoClassDefFoundError/i
    ],
    tier: 3,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const content = crashReport?.content || logs.join('\n');
        
        const missingClassMatch = content.match(/NoClassDefFoundError: ([\w\/\.]+)/);
        if (missingClassMatch) {
            const missingClass = missingClassMatch[1].replace(/\//g, '.');
            let specificLib = '';
            for (const [pkg, name] of Object.entries(ModDependencyMappings)) {
                if (missingClass.startsWith(pkg)) {
                    specificLib = name;
                    break;
                }
            }

            if (specificLib) {
                return {
                    id: `mod-dep-${server.id}-${Date.now()}`,
                    ruleId: 'mod_dependency',
                    severity: 'CRITICAL',
                    title: `Missing Library: ${specificLib}`,
                    explanation: `Mod requires '${specificLib}' to function, but the file is missing.`,
                    recommendation: `Add '${specificLib}' to your mods folder.`,
                    action: {
                        type: 'INSTALL_DEPENDENCY',
                        payload: { name: specificLib, serverId: server.id },
                        automaticRepair: true
                    },
                    evidence: (crashReport?.content || logs.join('\n')).match(/NoClassDefFoundError: [\w\/\.]+/)?.[0],
                    timestamp: Date.now()
                };
            }
        }

        const logMatch = content.match(/requires (['"\w\-\s\.]+?) but/is);
        if (logMatch) {
             const lib = logMatch[1].replace(/['"]/g, '').trim();
             return {
                id: `mod-dep-log-${server.id}-${Date.now()}`,
                ruleId: 'mod_dependency',
                severity: 'CRITICAL',
                title: `Missing Mod: ${lib}`,
                explanation: `Mod loader requested '${lib}', but it is not installed.`,
                recommendation: `Install '${lib}' matching your game version.`,
                evidence: logMatch[0].trim(),
                timestamp: Date.now()
             };
        }

        return null;
    }
};

export const DuplicateModRule: DiagnosisRule = {
    id: 'duplicate_mod',
    name: 'Duplicate Mods detected',
    description: 'Checks for duplicate mod entries',
    triggers: [
        /Duplicate mods found/i,
        /Found a duplicate mod/i
    ],
    tier: 2,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const logLine = logs.find(l => /Duplicate mods found/i.test(l) || /Found a duplicate mod/i.test(l));
        if (logLine) {
             const modMatch = logLine.match(/Found a duplicate mod: (\S+)/i) || logLine.match(/Duplicate mods found: ([\w, ]+)/i);
             const modName = modMatch ? modMatch[1] : 'Unknown mod';

             return {
                id: `dup-mod-${server.id}-${Date.now()}`,
                ruleId: 'duplicate_mod',
                severity: 'CRITICAL',
                title: 'Duplicate Mod Found',
                explanation: `Multiple versions of '${modName}' are installed.`,
                recommendation: `Delete duplicate/older versions of '${modName}' from the mods folder.`,
                evidence: logLine.trim(),
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
        /MixinTransformerError/i,
        /Critical injection failure/i
    ],
    tier: 3,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        // --- SMART HANDLING: FIX MARKER BLINDNESS ---
        // Mixin conflicts are hard to verify via FS. 
        // If a [FIX] marker exists after the last Mixin error, we assume it's resolved.
        const lastMixinIndex = logs.map(l => /Mixin apply failed|MixinTransformerError|Critical injection failure/i.test(l)).lastIndexOf(true);
        const lastFixIndex = logs.map(l => l.includes('[CraftCommand] [FIX]')).lastIndexOf(true);
        
        if (lastFixIndex !== -1 && lastFixIndex > lastMixinIndex) {
            return null; // A fix was applied AFTER the last mixin crash
        }

        const trigger = logs.find(l => /Mixin apply failed|MixinTransformerError|Critical injection failure/i.test(l));
        if (trigger) {
             const extraction = logs.find(l => /in mixin/i.test(l) || /from (?:mod )/i.test(l)) || trigger;
             const targetMatch = extraction.match(/in mixin ([\w\.]+)/i) || extraction.match(/from (?:mod )?([\w\.]+)/i);
             const target = targetMatch ? targetMatch[1] : 'an unknown mod';

             return {
                id: `mixin-${server.id}-${Date.now()}`,
                ruleId: 'mixin_conflict',
                severity: 'CRITICAL',
                title: 'Mod Incompatibility (Mixin)',
                explanation: `Mod '${target}' failed to inject code. Likely a conflict between two mods modifying the same game logic.`,
                recommendation: `Remove '${target}' or check for a newer version.`,
                evidence: trigger.trim(),
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
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const trigger = logs.find(l => /Ticking entity|Entity being ticked|Description: Ticking entity/i.test(l));
        if (trigger) {
             const entityLine = logs.find(l => /Entity Type: ([\w:]+)/i.test(l) || /Entity being ticked: ([\w:]+)/i.test(l)) || trigger;
             const posLine = logs.find(l => /at (-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/i.test(l)) || trigger;

             const entityMatch = entityLine.match(/Entity Type: ([\w:]+)/i) || entityLine.match(/Entity being ticked: ([\w:]+)/i);
             const posMatch = posLine.match(/at (-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/i);
             
             const entityType = entityMatch ? entityMatch[1] : 'Unknown';
             const position = posMatch ? ` at X:${posMatch[1]}, Y:${posMatch[2]}, Z:${posMatch[3]}` : '';

             return {
                id: `ticking-ent-${server.id}-${Date.now()}`,
                ruleId: 'ticking_entity',
                severity: 'CRITICAL',
                title: `Ticking Entity Crash: ${entityType}`,
                explanation: `Entity '${entityType}'${position} caused a server crash.`,
                recommendation: `Use the Automated Fix to enable Entity Purging in Forge, or remove the entity manually.`,
                action: {
                    type: 'ENABLE_ENTITY_PURGE',
                    payload: { serverId: server.id },
                    automaticRepair: true
                },
                evidence: trigger.trim(),
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const ForgeLibraryMissingRule: DiagnosisRule = {
    id: 'forge_libraries_missing',
    name: 'Missing Loader Libraries',
    description: 'Checks if the libraries folder exists',
    triggers: [
        /Error: Could not find or load main class/i,
        /NoClassDefFoundError: net\/minecraft/i
    ],
    tier: 2,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        const isModded = ['Forge', 'Fabric', 'NeoForge', 'Quilt'].includes(server.software);
        if (!isModded || !server.workingDirectory || !server.hasStarted) return null;

        const libsDir = path.join(server.workingDirectory, 'libraries');
        if (!(await fs.pathExists(libsDir))) {
            return {
                id: `mod-libs-${server.id}-${Date.now()}`,
                ruleId: 'forge_libraries_missing',
                severity: 'CRITICAL',
                title: 'Missing Loader Libraries',
                explanation: 'The "libraries" directory is missing. modded servers require this to load.',
                recommendation: 'Run the server installer (Forge/Fabric) again to regenerate the libraries.',
                action: {
                    type: 'REINSTALL_LOADER',
                    payload: { serverId: server.id },
                    automaticRepair: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const ClientOnlyModRule: DiagnosisRule = {
    id: 'client_only_mod',
    name: 'Client-Side Mod on Server',
    description: 'Detects when a client-side only mod is installed on the server, causing crashes.',
    triggers: [
        /java.lang.NoClassDefFoundError: net\/minecraft\/client/i,
        /java.lang.NoSuchMethodError: net.minecraft.client/i,
        /java.lang.NoSuchFieldError: net.minecraft.client/i,
        /java.lang.ClassNotFoundException: net.minecraft.client/i,
        /Cannot load class net.fabricmc.fabric.api.client/i,
        /Cannot load class .+ in environment type SERVER/i,
        /RuntimeException: Cannot load class .+ in environment type SERVER/i,
        /Could not execute entrypoint stage .+provided by '([^']+)'/i
    ],
    tier: 1,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const fullLog = crashReport ? crashReport.content : logs.join('\n');
        
        // --- SMART HANDLING: FIX MARKER BLINDNESS ---
        const lastClientErrorIndex = logs.map(l => /net\.minecraft\.client|environmental type SERVER/i.test(l)).lastIndexOf(true);
        const lastFixIndex = logs.map(l => l.includes('[CraftCommand] [FIX]')).lastIndexOf(true);
        if (lastFixIndex !== -1 && lastFixIndex > lastClientErrorIndex) {
            return null;
        }

        // Detect "Cannot load class X in environment type SERVER" (e.g. slyde, shader mods)
        const envTypeMatch = fullLog.match(/Cannot load class ([a-zA-Z0-9_.]+) in environment type SERVER/i);
        
        // Detect classic client class references
        const isClientInServer = envTypeMatch || (
            /net\.minecraft\.client|net\.fabricmc\.fabric\.api\.client/i.test(fullLog) && 
            (/NoClassDefFoundError/i.test(fullLog) || /NoSuchMethodError/i.test(fullLog) || /NoSuchFieldError/i.test(fullLog) || /ClassNotFoundException/i.test(fullLog) || /Cannot load class/i.test(fullLog))
        );

        if (isClientInServer) {
            let culprit = "unknown mod";

            if (envTypeMatch) {
                const parts = envTypeMatch[1].split('.');
                const providedByMatch = fullLog.match(/provided by '([^']+)'/);
                if (providedByMatch) {
                    culprit = providedByMatch[1];
                } else if (parts.length >= 3) {
                    culprit = parts[parts.length - 2];
                }
            }

            if (culprit === "unknown mod") {
                const entryMatch = fullLog.match(/provided by '([^']+)' at '([^']+)'/);
                if (entryMatch) {
                    culprit = entryMatch[1];
                } else {
                    const modMatch = fullLog.match(/at ([a-zA-Z0-9_]+\.[a-zA-Z0-9_\.]+)\./);
                    if (modMatch && !modMatch[1].startsWith('net.minecraft')) {
                         const parts = modMatch[1].split('.');
                         culprit = parts.length > 1 ? parts[1] : parts[0]; 
                    }
                }
            }

            const hasChainCrash = /MixinTargetAlreadyLoadedException.*was loaded too early/i.test(fullLog);
            const chainMod = hasChainCrash ? fullLog.match(/from mod (\w+) target/)?.[1] : null;
            
            let explanation = `Mod '${culprit}' is client-only and cannot run on a server.`;
            if (hasChainCrash && chainMod) {
                explanation += ` Caused chain failure in '${chainMod}'.`;
            }

            return {
                id: `client-mod-${server.id}-${Date.now()}`,
                ruleId: 'client_only_mod',
                severity: 'CRITICAL',
                title: 'Client Mod on Server',
                explanation,
                recommendation: `Remove '${culprit}' from your server's mods folder. Only install it on your personal client.`,
                evidence: (crashReport?.content || logs.join('\n')).split('\n').find(l => /minecraft\.client|environmental type SERVER/i.test(l))?.trim(),
                timestamp: Date.now(),
                isRootCause: true
            };
        }
        return null;
    }
};

export const CorruptedModJarRule: DiagnosisRule = {
    id: 'corrupted_mod_jar',
    name: 'Corrupted Mod JAR File',
    description: 'Detects mod zip/jar files that are empty or fundamentally corrupted.',
    triggers: [
        /java.util.zip.ZipException: zip file is empty/i,
        /error in opening zip file/i,
        /Invalid zip file/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const fullLog = logs.join('\n');
        
        const zipErrorMatch = fullLog.match(/(java\.util\.zip\.ZipException: (?:zip file is empty|error in opening zip file)|Invalid zip file).*?([a-zA-Z0-9_+\-\.\[\] ]+\.jar)/is);
        
        if (zipErrorMatch) {
             const jarFile = zipErrorMatch[2];
             return {
                id: `corrupt-jar-${server.id}-${Date.now()}`,
                ruleId: 'corrupted_mod_jar',
                severity: 'CRITICAL',
                title: 'Corrupted Mod File',
                explanation: `Mod file '${jarFile}' is corrupted or empty. Likely an interrupted download.`,
                recommendation: `Delete '${jarFile}' and re-download. Check your disk space.`,
                evidence: zipErrorMatch[0].trim(),
                timestamp: Date.now()
             };
        }
        return null;
    }
};


export const ProactiveModIntegrityRule: DiagnosisRule = {
    id: 'proactive_mod_integrity',
    name: 'Proactive Mod Integrity Scan',
    description: 'Scans the mods folder for client-side mods and corruption before startup.',
    triggers: [], // Explicitly proactive
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (!server.workingDirectory) return null;
        const modsDir = path.join(server.workingDirectory, 'mods');
        
        if (!(await fs.pathExists(modsDir))) return null;

        try {
            const files = await fs.readdir(modsDir);
            const jars = files.filter(f => f.endsWith('.jar'));

            for (const jar of jars) {
                const jarPath = path.join(modsDir, jar);
                const stats = await fs.stat(jarPath);

                // 1. Detect Empty/Corrupt (Zero Byte)
                if (stats.size === 0) {
                    return {
                        id: `proactive-corrupt-${server.id}-${jar}`,
                        ruleId: 'corrupted_mod_jar',
                        severity: 'CRITICAL',
                        title: 'Empty Mod File Detected',
                        explanation: `The mod file "${jar}" is 0 bytes. This will cause the server to crash during startup.`,
                        recommendation: `Delete "${jar}" and re-download it.`,
                        timestamp: Date.now(),
                        isRepairable: false
                    };
                }

                // 2. Client-Side Known Saboteurs (IRIS, Oculus, Sodium, Slyde, etc on Dedicated Server)
                const clientOnlyKeywords = ['iris', 'oculus', 'sodium', 'slyde', 'rubidium', 'distantsnapshots', 'dynamiclights', 'itlt', 'customtitlescreen'];
                const jarLower = jar.toLowerCase();
                
                if (clientOnlyKeywords.some(k => jarLower.includes(k))) {
                    return {
                        id: `proactive-client-${server.id}-${jar}`,
                        ruleId: 'client_only_mod',
                        severity: 'CRITICAL',
                        title: 'Client Mod found',
                        explanation: `Mod '${jar}' is client-side only.`,
                        recommendation: `Remove '${jar}' before starting.`,
                        timestamp: Date.now(),
                        isRepairable: true,
                        action: {
                            type: 'UPDATE_CONFIG', 
                            payload: { repairPermissions: true }, 
                            automaticRepair: false
                        }
                    };
                }
            }
        } catch (e) {
            return null;
        }

        return null;
    }
};

export const ModDiagnosisRules: DiagnosisRule[] = [
    IncompatibleModsRule,
    ModDependencyRule,
    DuplicateModRule,
    MixinConflictRule,
    TickingEntityRule,
    ForgeLibraryMissingRule,
    ClientOnlyModRule,
    CorruptedModJarRule,
    ProactiveModIntegrityRule
];
