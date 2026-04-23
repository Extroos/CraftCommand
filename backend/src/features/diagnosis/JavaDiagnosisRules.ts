import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
import { logger } from '../../utils/logger';
import { ServerStatus } from '@shared/types';
import { CrashReport } from './CrashReportReader';
import fs from 'fs-extra';
import path from 'path';

/**
 * Rule for detecting missing Java binaries in the runtimes directory.
 */
export const JavaBinaryMissingRule: DiagnosisRule = {
    id: 'java_binary_missing',
    name: 'Java Binary Missing',
    description: 'Detects if the configured Java binary is missing on disk.',
    tier: 1,
    defaultConfidence: 100,
    triggers: [/java.io.IOException: Cannot run program.*java/i, /executable file not found/i],
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const javaVersion = server.javaVersion;
        if (!javaVersion) return null;

        // Map "Java 17" to a path like backend/runtimes/17/bin/java (or java.exe)
        const versionStr = String(javaVersion || '');
        const majorVer = versionStr.replace('Java ', '').trim();
        const isWindows = process.platform === 'win32';
        const binName = isWindows ? 'java.exe' : 'java';
        
        // v1.13.3: Use unified .runtimes path
        const rootDir = path.resolve(__dirname, '../../../../');
        const absolutePath = path.join(rootDir, '.runtimes', 'java', majorVer, 'bin', binName);

        // Check logs first for reactive detection
        const hasLogMatch = logs.some(l => /java.io.IOException: Cannot run program/i.test(l) || /executable file not found/i.test(l) || /is not recognized as an internal or external command/i.test(l));

        if (hasLogMatch) {
            // Live-State Priority: Check if the binary was downloaded/fixed since the last crash (v1.12.8)
            const binaryExists = await fs.pathExists(absolutePath);
            if (binaryExists) return null;

            return {
                id: `java-miss-${server.id}-${Date.now()}`,
                ruleId: 'java_binary_missing',
                severity: 'CRITICAL',
                title: 'Java Runtime Missing',
                explanation: `The server failed to start because the required Java executable for ${javaVersion} could not be found or executed.`,
                recommendation: 'The system will attempt to automatically download and install the required Java runtime.',
                action: {
                    type: 'INSTALL_JAVA',
                    payload: { version: javaVersion },
                    automaticRepair: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting Java version vs Minecraft version mismatches.
 * Performance: Consolidated reactive log analysis and proactive version detection.
 */
export const JavaVersionRule: DiagnosisRule = {
    id: 'java_version',
    name: 'Java Version Mismatch',
    description: 'Checks if the Java version matches software requirements',
    triggers: [
        /UnsupportedClassVersionError/i,
        /unsupported.*java/i,
        /compiled by a more recent version/i,
        /java \d+ is required/i,
        /class file version/i
    ],
    tier: 1,
    defaultConfidence: 95,
    isRepairable: true,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (server.software === 'Bedrock') return null;
        if (server.status === ServerStatus.ONLINE || !server.hasStarted) return null;
        
        const logContent = logs.join('\n').toLowerCase();
        const hasError = /unsupportedclassversionerror|compiled by a more recent version|unsupported java version|java \d+ is required/i.test(logContent);
        
        const javaVersionStr = String(server.javaVersion || '');
        const currentJavaNum = parseInt(javaVersionStr.match(/\d+/)?.[0] || '8');
        let requiredJava = 'Java 17'; 
        let minVersion = 17;

        // Smart requirement mapping (v4.5)
        if (['paper', 'purpur', 'spigot', 'forge', 'neoforge', 'fabric', 'quilt'].includes(server.software?.toLowerCase() || '')) {
            const versionMatch = server.version?.match(/1\.(\d+)\.?(\d+)?/);
            if (versionMatch) {
                const minor = parseInt(versionMatch[1]);
                const patch = parseInt(versionMatch[2] || '0');
                
                // MC 1.20.5+ requires Java 21
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

        // --- SMART HANDLING ---
        // Rule: If current config ALREADY meets or exceeds the required version,
        // we assume any log error is stale/historical and return null.
        if (currentJavaNum >= minVersion) {
            return null;
        }

        // Logic check: Only extract from logs if the log error is actually present
        // and provides a newer/more specific requirement than our heuristic.
        if (hasError) {
            if (logContent.includes('class file version 66.0')) { requiredJava = 'Java 22'; minVersion = 22; }
            else if (logContent.includes('class file version 65.0')) { requiredJava = 'Java 21'; minVersion = 21; }
            else if (logContent.includes('class file version 61.0')) { requiredJava = 'Java 17'; minVersion = 17; }
        }

        const isWarningOnly = logContent.includes('unsupported java version') && !logContent.includes('unsupportedclassversionerror');

        return {
            id: `java-${server.id}-${Date.now()}`,
            ruleId: 'java_version',
            severity: isWarningOnly ? 'WARNING' : 'CRITICAL',
            title: isWarningOnly ? 'Unsupported Java Version' : 'Incompatible Java Version',
            explanation: hasError 
                ? `Server requires ${requiredJava}+ but started with ${server.javaVersion}.`
                : `${server.software} ${server.version} requires at least ${requiredJava}, but is currently configured with ${server.javaVersion}.`,
            recommendation: `Switch Java Version in settings to ${requiredJava}.`,
            action: {
                type: 'SWITCH_JAVA',
                payload: { serverId: server.id, version: requiredJava },
                automaticRepair: !isWarningOnly 
            },
            evidence: logs.find(l => /unsupportedclassversionerror|compiled by a more recent version|unsupported java version|java \d+ is required/i.test(l))?.trim(),
            confidence: hasError ? 100 : 90,
            timestamp: Date.now()
        };
    }
};

/**
 * Checks for OutOfMemoryErrors and severe memory pressure.
 */
export const MemoryRule: DiagnosisRule = {
    id: 'memory_oom',
    name: 'Out of Memory',
    description: 'Checks for Java heap exhaustion',
    triggers: [
        /OutOfMemoryError/i,
        /java heap space/i,
        /GC overhead limit exceeded/i
    ],
    tier: 1,
    defaultConfidence: 95,
    isRepairable: true,
    analyze: async (server: ServerConfig, logs: string[], env: SystemStats): Promise<DiagnosisResult | null> => {
         const logContent = logs.join('\n').toLowerCase();
         const hasError = /outofmemoryerror|java heap space|gc overhead limit exceeded/i.test(logContent);
         
         if (hasError) {
             const currentRam = server.ram;
             return {
                id: `oom-${server.id}-${Date.now()}`,
                ruleId: 'memory_oom',
                severity: 'CRITICAL',
                title: 'Out Of Memory (OOM)',
                explanation: `Server exhausted the allocated ${currentRam}GB RAM.`,
                recommendation: currentRam < 8 ? `Increase RAM allocation to ${currentRam + 1}GB.` : `Optimize with Spark or reduce mod count.`,
                action: {
                    type: 'UPDATE_CONFIG',
                    payload: { serverId: server.id, ram: currentRam + 1 },
                    automaticRepair: true
                },
                evidence: logs.find(l => /outofmemoryerror|java heap space|gc overhead limit exceeded/i.test(l))?.trim(),
                timestamp: Date.now()
             };
         }

         if (env.memoryUsed && env.memoryTotal) {
             const memPercent = (env.memoryUsed / env.memoryTotal) * 100;
             
             // --- SMART PROACTIVE CHECK (v4.5) ---
             // If a server is allocated > 8GB but system RAM is almost full, 
             // warn proactively even without a log error.
             if (memPercent > 95 && server.ram >= 8) {
                 return {
                    id: `mem-pressure-${server.id}-${Date.now()}`,
                    ruleId: 'memory_oom',
                    severity: 'CRITICAL',
                    title: 'System RAM Exhaustion',
                    explanation: `System RAM is at ${Math.round(memPercent)}%. This ${server.ram}GB server is at high risk of a native OOM crash.`,
                    recommendation: 'The host system is overloaded. Reduce memory allocation of background servers or add more physical RAM.',
                    timestamp: Date.now()
                 };
             }
         }
         return null;
    }
};

/**
 * Detects malformed startup flags that prevent Java from starting.
 */
export const InvalidJvmArgsRule: DiagnosisRule = {
    id: 'invalid_jvm_args',
    name: 'Invalid Java Arguments',
    description: 'Detects malformed startup flags',
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
            // --- SMART HANDLING ---
            // If the error was "Initial > Max heap size" but the user has already 
            // reset their RAM to a valid state, we treat the log as stale.
            if (errorLine.includes('Initial heap size set to a larger value than the maximum') && server.ram === 2) {
                return null;
            }

            return {
                id: `jvm-args-${server.id}-${Date.now()}`,
                ruleId: 'invalid_jvm_args',
                severity: 'CRITICAL',
                title: 'Invalid JVM Arguments',
                explanation: `Java failed to start: "${errorLine.trim()}"`,
                recommendation: 'Reset RAM settings and flags to safe defaults.',
                action: {
                    type: 'FIX_JVM_ARGS',
                    payload: { serverId: server.id },
                    automaticRepair: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Detects Java Virtual Machine crashes (hs_err_pid).
 */
export const NativeCrashRule: DiagnosisRule = {
    id: 'native_jvm_crash',
    name: 'JVM/Native Crash',
    description: 'Detects native Java crashes',
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
                title: 'Java Runtime Crash',
                explanation: 'Native Java process crashed. Usually caused by outdated drivers or incompatible hardware.',
                recommendation: 'Update Graphics Drivers and verify host hardware integrity.',
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

/**
 * Recommends Aikars Flags for performance optimization.
 */
export const AikarsFlagsRule: DiagnosisRule = {
    id: 'aikars_flags',
    name: 'Performance Optimization',
    description: 'Recommends Aikar\'s Flags for garbage collection',
    triggers: [], 
    tier: 3,
    defaultConfidence: 100,
    isRepairable: true,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        const isGameServer = ['paper', 'spigot', 'purpur', 'forge', 'neoforge', 'fabric', 'quilt'].includes(server.software?.toLowerCase() || '');
        if (!isGameServer) return null;

        if (server.ram >= 4 && !server.advancedFlags?.aikarFlags) {
            return {
                id: `aikar-tip-${server.id}-${Date.now()}`,
                ruleId: 'aikars_flags',
                severity: 'INFO',
                title: 'Optimization Tip',
                explanation: `Server has ${server.ram}GB RAM but isn't using Aikar's Flags for improved stability.`,
                recommendation: 'Enable "Aikar\'s Flags" in Advanced Settings.',
                action: {
                    type: 'OPTIMIZE_ARGUMENTS',
                    payload: { serverId: server.id, optimized: true },
                    automaticRepair: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Monitors the process heap usage for potential leaks.
 */
export const MemoryMonitorRule: DiagnosisRule = {
    id: 'memory_leak',
    name: 'Memory Leak Detection',
    description: 'Monitors heap usage for leaks',
    tier: 3,
    defaultConfidence: 70,
    triggers: [], 
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        const mem = process.memoryUsage();
        const heapUsedGb = mem.heapUsed / 1024 / 1024 / 1024;
        const heapTotalGb = mem.heapTotal / 1024 / 1024 / 1024;
        
        if (heapUsedGb / heapTotalGb > 0.85 && heapTotalGb > 0.5) {
            return {
                id: `mem-leak-${Date.now()}`,
                ruleId: 'memory_leak',
                severity: 'WARNING',
                title: 'High Memory Usage (Potential Leak)',
                explanation: `Panel heap usage is at ${Math.round((heapUsedGb/heapTotalGb)*100)}% (${Math.round(heapUsedGb * 1024)}MB).`,
                recommendation: 'Monitor heap snapshots to identify leaking objects.',
                action: {
                    type: 'TAKE_HEAP_SNAPSHOT',
                    payload: { reason: 'high_memory' },
                    automaticRepair: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

// Note: JavaVersionMismatchRule is intentionally excluded from the exported array
// because JavaVersionRule in DiagnosisRules.ts provides more comprehensive coverage
// (proactive version detection + reactive log analysis). Including both causes duplicate diagnoses.
export const JavaRules = [
    JavaBinaryMissingRule,
    JavaVersionRule,
    MemoryRule,
    InvalidJvmArgsRule,
    NativeCrashRule,
    AikarsFlagsRule,
    MemoryMonitorRule
];
