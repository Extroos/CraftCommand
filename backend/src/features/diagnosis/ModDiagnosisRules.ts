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
            let customExplanation = `The mod loader found fundamentally incompatible mods.`;
            let customRecommendation = solutions ? `Automated solution mapping:\n${solutions}` : `Check your mods folder for Minecraft ${server.version} compatibility.`;

            // NEW: Prioritize removing mods that are listed as the culprits in "More details:"
            const detailsBlockMatch = fullLog.match(/More details:[\s\S]*?(?=\n\S|$)/i);
            if (detailsBlockMatch) {
                const rawDetails = detailsBlockMatch[0];
                const invalidModRegex = /- Mod '([^']+)' \(([^)]+)\) .* requires /ig;
                let match;
                const invalidSlugs: string[] = [];
                const invalidNames: string[] = [];
                while ((match = invalidModRegex.exec(rawDetails)) !== null) {
                    const slug = match[2];
                    if (slug !== 'fabricloader' && slug !== 'minecraft' && slug !== 'java' && slug !== 'fabric-api' && slug !== 'quilt_loader' && slug !== 'forge') {
                        invalidNames.push(match[1]);
                        invalidSlugs.push(slug);
                    }
                }
                
                if (invalidSlugs.length > 0) {
                    const uniqueSlugs = [...new Set(invalidSlugs)];
                    const uniqueNames = [...new Set(invalidNames)];
                    action = {
                        type: 'REMOVE_MOD',
                        payload: { name: uniqueSlugs.join(','), serverId: server.id },
                        autoHeal: false
                    };
                    customExplanation = `The mod(s) '${uniqueNames.join(', ')}' are fundamentally incompatible or missing dependencies that cannot be satisfied in this environment.`;
                    customRecommendation = `You can easily click "Fix" to remove them automatically, or manually delete them from your mods folder.`;
                }
            }

            // Fallback to INSTALL_DEPENDENCY if no removal was found
            if (!action) {
                const replaceMatch = rawSolutions.match(/- Replace mod '([^']+)' \(([^)]+)\)/i);
                if (replaceMatch) {
                    const modFriendlyName = replaceMatch[1];
                    const modSlug = replaceMatch[2];
                    if (modSlug !== 'java' && modSlug !== 'minecraft' && modSlug !== 'fabricloader') {
                        action = {
                            type: 'INSTALL_DEPENDENCY',
                            payload: { name: modSlug, serverId: server.id },
                            autoHeal: false // Don't auto-heal, provide as a click fix
                        };
                    }
                } else if (rawSolutions.match(/- Install ([^,]+), version ([^ ]+) or later/i)) {
                    // e.g. "- Install fabric-api, version 0.85.0+1.20.1 or later."
                    const installMatch = rawSolutions.match(/- Install ([^,]+),/i);
                    if (installMatch) {
                        const modSlug = installMatch[1];
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
    description: 'Detects when a client-side only mod (like minimaps or Sodium) is installed on the server.',
    triggers: [
        /java.lang.NoClassDefFoundError: net\/minecraft\/client/i,
        /java.lang.NoSuchMethodError: net.minecraft.client/i,
        /java.lang.NoSuchFieldError: net.minecraft.client/i,
        /java.lang.ClassNotFoundException: net.minecraft.client/i
    ],
    tier: 1,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats, crashReport?: CrashReport): Promise<DiagnosisResult | null> => {
        const fullLog = crashReport ? crashReport.content : logs.join('\n');
        
        if (/net\.minecraft\.client/i.test(fullLog) && (/NoClassDefFoundError/i.test(fullLog) || /NoSuchMethodError/i.test(fullLog) || /NoSuchFieldError/i.test(fullLog) || /ClassNotFoundException/i.test(fullLog))) {
            
            // Try to extract the offending mod name from the stack trace
            let culprit = "an unknown mod";
            const modMatch = fullLog.match(/at ([a-zA-Z0-9_]+\.[a-zA-Z0-9_\.]+)\./);
            if (modMatch && !modMatch[1].startsWith('net.minecraft')) {
                 const parts = modMatch[1].split('.');
                 culprit = parts.length > 1 ? parts[1] : parts[0]; 
            }

            return {
                id: `client-mod-${server.id}-${Date.now()}`,
                ruleId: 'client_only_mod',
                severity: 'CRITICAL',
                title: 'Client-Side Mod Crash',
                explanation: `The server crashed because it tried to load client-specific graphical code. This usually means you installed a client-side-only mod (like ${culprit}, OptiFine, Sodium, or a Minimap) on the standalone server.`,
                recommendation: `Search your mods folder for ${culprit} or any client-side mods and delete them. They are only meant to be installed on your personal Minecraft client.`,
                timestamp: Date.now()
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
                recommendation: `Delete "${jarFile}" from your mods folder and re-download it.`,
                action: {
                    type: 'REMOVE_MOD',
                    payload: { name: jarFile.replace('.jar', ''), serverId: server.id },
                    autoHeal: false 
                },
                timestamp: Date.now(),
                isHealable: true
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
