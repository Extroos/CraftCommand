import { DiagnosisRule, ServerConfig, DiagnosisResult, SystemStats } from './types';
import { CrashReport } from './CrashReportReader';

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
    'corgitaco.enhancedvisuals': 'Enhanced Visuals',
    'invtweaks': 'Inventory Tweaks',
    'com.teamresourceful.resourcefullib': 'Resourceful Lib',
    'com.teamresourceful.resourcefulconfig': 'Resourceful Config',
    'earth.terrarium.botarium': 'Botarium',
    'earth.terrarium.ad_astra': 'Ad Astra',
    'cn.mcmod.sakura': 'Sakura',
    'com.github.crimson_shadow': 'Create Essentials',
    'dev.latvian.mods.kubejs': 'KubeJS',
    'dev.latvian.mods.rhino': 'Rhino (JS Engine)',
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
    id: 'incompatible_mods_v2',
    name: 'Incompatible Mods (Advanced)',
    description: 'Detects mod loader formatting exceptions and suggests solutions',
    triggers: [
        /Some of your mods are incompatible with the game or each other/i,
        /FormattedException/i,
        /Incompatible mods found/i,
        /fundamentally incompatible mods/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const fullLog = logs.join('\n');
        
        if (/Some of your mods are incompatible with the game or each other!|Incompatible mods found!|fundamentally incompatible mods/i.test(fullLog)) {
            const solutionBlockMatch = fullLog.match(/A potential solution has been determined(?:.*?)\n((?:\s*-\s*.*\n?)+)/i);
            const rawSolutions = solutionBlockMatch ? solutionBlockMatch[1] : '';
            
            const solutions = rawSolutions
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.startsWith('-'))
                .map(l => l.replace(/^- /, '• '))
                .join('\n');
                
            // Parse actions for EZ click fixes
            let action: any = undefined;
            const suggestMcUpgrade = rawSolutions.includes('replace [[minecraft') || rawSolutions.includes('add:minecraft');
            
            let customExplanation = suggestMcUpgrade 
                ? `A mod mismatch was detected. You have installed a mod meant for a newer version of Minecraft.`
                : `The mod loader found fundamentally incompatible mods.`;
            
            let customRecommendation = solutions ? `Automated solution mapping:\n${solutions}` : `Check your mods folder for Minecraft ${server.version} compatibility.`;

            if (suggestMcUpgrade) {
                customRecommendation = `The mod loader suggests upgrading Minecraft, but this is usually not desired. You should find the version of your mod that matches Minecraft ${server.version}, or remove the mod causing the mismatch.`;
            }

            // STEP 1: Parse the SOLUTION section for "Install X" patterns
            // These are the ACTUAL missing dependencies that need to be installed
            const installMatches = [...rawSolutions.matchAll(/- Install ([^,\n]+?)(?:,\s*version\s+([^\s]+)\s+or later)?\.?\s*$/gim)];
            const missingDeps: string[] = [];
            for (const m of installMatches) {
                const depSlug = m[1].trim().toLowerCase();
                if (depSlug !== 'java' && depSlug !== 'minecraft' && depSlug !== 'fabricloader' && depSlug !== 'forge') {
                    missingDeps.push(depSlug);
                }
            }

            // STEP 2: Parse the DETAILS section to understand WHICH mods need WHAT
            // This is for the explanation only — NOT for choosing what to install/remove
            const detailsBlockMatch = fullLog.match(/More details:[\s\S]+/i);
            const requirerNames: string[] = [];
            const requirerSlugs: string[] = [];
            if (detailsBlockMatch) {
                const rawDetails = detailsBlockMatch[0];
                const requirerRegex = /- Mod '([^']+)' \(([^)]+)\) .*? (?:requires|depends on) /ig;
                let match;
                while ((match = requirerRegex.exec(rawDetails)) !== null) {
                    const slug = match[2];
                    if (slug !== 'fabricloader' && slug !== 'minecraft' && slug !== 'java' && slug !== 'fabric-api' && slug !== 'quilt_loader' && slug !== 'forge') {
                        if (!requirerNames.includes(match[1])) requirerNames.push(match[1]);
                        if (!requirerSlugs.includes(slug)) requirerSlugs.push(slug);
                    }
                }
            }

            // STEP 3: Build the right action and explanation
            if (missingDeps.length > 0) {
                // MISSING DEPENDENCIES — install them
                const uniqueDeps = [...new Set(missingDeps)];
                action = {
                    type: 'INSTALL_DEPENDENCY',
                    payload: { name: uniqueDeps.join(','), serverId: server.id },
                    autoHeal: false
                };
                const modList = requirerNames.length > 0 ? requirerNames.join(', ') : 'One or more mods';
                customExplanation = `${modList} requires missing dependencies: ${uniqueDeps.join(', ')}. The server cannot start until these are installed.`;
                customRecommendation = `Click "Fix" to automatically install the missing dependencies (${uniqueDeps.join(', ')}) from Modrinth.`;
            } else if (requirerNames.length > 0 && !suggestMcUpgrade) {
                // Mods have version conflicts but no clear "Install X" solution
                customExplanation = `The mod(s) '${requirerNames.join(', ')}' have dependency conflicts with Minecraft ${server.version}. Check that all mods are compatible with this Minecraft version.`;
                customRecommendation = `You need to find versions of these mods that are compatible with Minecraft ${server.version}. Check Modrinth or CurseForge for updated versions.`;
            }

            // STEP 4: Fallback — if the solution section has "Replace mod X"
            if (!action) {
                const replaceMatch = rawSolutions.match(/- Replace mod '([^']+)' \(([^)]+)\)/i);
                if (replaceMatch) {
                    const modSlug = replaceMatch[2];
                    if (modSlug !== 'java' && modSlug !== 'minecraft' && modSlug !== 'fabricloader') {
                        action = {
                            type: 'INSTALL_DEPENDENCY',
                            payload: { name: modSlug, serverId: server.id },
                            autoHeal: false
                        };
                    }
                }
            }
                
            return {
                id: `incompatible-${server.id}-${Date.now()}`,
                ruleId: 'incompatible_mods',
                severity: 'CRITICAL',
                title: 'Incompatible Mods Detected',
                explanation: customExplanation,
                recommendation: customRecommendation,
                action: action,
                timestamp: Date.now(),
                isHealable: !!action
            };
        }
        return null;
    }
};

export const ModDependencyRule: DiagnosisRule = {
    id: 'mod_dependency_v2',
    name: 'Critical Mod Dependency',
    description: 'Checks for missing mod libraries using an expanded mapping',
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
        
        // 1. Precise Crash Report Mapping
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
                    explanation: `A mod requires '${specificLib}' to function, but the library is missing.`,
                    recommendation: `Download and add ${specificLib} to your mods folder.`,
                    action: {
                        type: 'INSTALL_DEPENDENCY',
                        payload: { name: specificLib, serverId: server.id },
                        autoHeal: true
                    },
                    timestamp: Date.now()
                };
            }
        }

        // 2. Generic Log Matching
        const logMatch = content.match(/requires (['"\w\-\s\.]+?) but/is);
        if (logMatch) {
             const lib = logMatch[1].replace(/['"]/g, '').trim();
             return {
                id: `mod-dep-log-${server.id}-${Date.now()}`,
                ruleId: 'mod_dependency',
                severity: 'CRITICAL',
                title: `Missing Mod: ${lib}`,
                explanation: `Your mod loader explicitly requested '${lib}', but it is not installed.`,
                recommendation: `Search Modrinth or CurseForge for '${lib}' and install it.`,
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
        
        // Detect "Cannot load class X in environment type SERVER" (e.g. slyde, shader mods)
        const envTypeMatch = fullLog.match(/Cannot load class ([a-zA-Z0-9_.]+) in environment type SERVER/i);
        
        // Detect classic client class references
        const isClientInServer = envTypeMatch || (
            /net\.minecraft\.client|net\.fabricmc\.fabric\.api\.client/i.test(fullLog) && 
            (/NoClassDefFoundError/i.test(fullLog) || /NoSuchMethodError/i.test(fullLog) || /NoSuchFieldError/i.test(fullLog) || /ClassNotFoundException/i.test(fullLog) || /Cannot load class/i.test(fullLog))
        );

        if (isClientInServer) {
            let culprit = "an unknown mod";
            let culpritSlug = "";

            // 1. Extract from "Cannot load class io.gitlab.jfronny.slyde.Plugin in environment type SERVER"
            if (envTypeMatch) {
                const className = envTypeMatch[1]; // e.g. "io.gitlab.jfronny.slyde.Plugin"
                const parts = className.split('.');
                // Find the mod name — typically the package after the domain (e.g. "slyde" from io.gitlab.jfronny.slyde.Plugin)
                // Also check "provided by" to get the actual mod ID
                const providedByMatch = fullLog.match(/provided by '([^']+)'/);
                if (providedByMatch) {
                    culprit = providedByMatch[1];
                    culpritSlug = providedByMatch[1].toLowerCase().replace(/-/g, '');
                } else if (parts.length >= 3) {
                    // Use the 3rd-to-last part as the mod name (before the class name)
                    culprit = parts[parts.length - 2]; // e.g. "slyde" from io.gitlab.jfronny.slyde.Plugin
                    culpritSlug = culprit.toLowerCase();
                }
            }

            // 2. Fallback: Check for Fabric "provided by" marker
            if (culprit === "an unknown mod") {
                const entrypointMatch = fullLog.match(/provided by '([^']+)' at '([^']+)'/);
                if (entrypointMatch) {
                    culprit = entrypointMatch[1];
                    culpritSlug = entrypointMatch[1].toLowerCase();
                } else {
                    // 3. Fallback to stack trace analysis
                    const modMatch = fullLog.match(/at ([a-zA-Z0-9_]+\.[a-zA-Z0-9_\.]+)\./);
                    if (modMatch && !modMatch[1].startsWith('net.minecraft')) {
                         const parts = modMatch[1].split('.');
                         culprit = parts.length > 1 ? parts[1] : parts[0]; 
                         culpritSlug = culprit.toLowerCase();
                    }
                }
            }

            // Check for chain crash indicators (libjf → lithium MixinTargetAlreadyLoadedException)
            const hasChainCrash = /MixinTargetAlreadyLoadedException.*was loaded too early/i.test(fullLog);
            const chainMod = hasChainCrash ? fullLog.match(/from mod (\w+) target/)?.[1] : null;
            
            let explanation = `The server crashed because the mod "${culprit}" is a client-only mod that cannot run on a dedicated server.`;
            if (hasChainCrash && chainMod) {
                explanation += ` This caused a chain reaction crash — "${chainMod}" failed because "${culprit}" loaded classes too early (MixinTargetAlreadyLoadedException).`;
            }

            return {
                id: `client-mod-${server.id}-${Date.now()}`,
                ruleId: 'client_only_mod',
                severity: 'CRITICAL',
                title: 'Client-Only Mod Crash',
                explanation,
                recommendation: `The mod "${culprit}" is designed for the Minecraft client only (GUI, rendering, etc.) and cannot run on a server. You need to manually remove it from the mods/ folder. Client-only mods should only be installed on your personal Minecraft client, not the server.`,
                action: undefined,
                timestamp: Date.now(),
                isHealable: false,
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
                explanation: `The server failed to read the mod file "${jarFile}" because it is corrupted or empty. This often happens if a download was interrupted or the server ran out of disk space while downloading.`,
                recommendation: `The file "${jarFile}" in your mods folder is corrupted. Please delete it manually and re-download the mod.`,
                action: undefined,
                timestamp: Date.now(),
                isHealable: false
             };
        }
        return null;
    }
};

export const ModDiagnosisRules: DiagnosisRule[] = [
    IncompatibleModsRule,
    ModDependencyRule,
    ClientOnlyModRule,
    CorruptedModJarRule
];
