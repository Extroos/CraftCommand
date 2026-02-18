import { DiagnosisRule, DiagnosisResult, ServerConfig, SystemStats } from './types';
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
        const majorVer = javaVersion.replace('Java ', '').trim();
        const isWindows = process.platform === 'win32';
        const binName = isWindows ? 'java.exe' : 'java';
        const relativeJavaPath = path.join('runtimes', majorVer, 'bin', binName);
        const absolutePath = path.join(process.cwd(), 'backend', relativeJavaPath);

        // Check logs first for reactive detection
        const hasLogMatch = logs.some(l => /java.io.IOException: Cannot run program/i.test(l) || /executable file not found/i.test(l));

        // Proactive check on disk
        if (!(await fs.pathExists(absolutePath))) {
            return {
                id: `java-miss-${server.id}-${Date.now()}`,
                ruleId: 'java_binary_missing',
                severity: 'CRITICAL',
                title: 'Java Runtime Missing',
                explanation: `The required Java executable for ${javaVersion} was not found at ${absolutePath}.`,
                recommendation: 'Re-install the required Java version through the Panel Settings.',
                action: {
                    type: 'INSTALL_JAVA',
                    payload: { version: javaVersion },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting Java version vs Minecraft version mismatches.
 */
export const JavaVersionMismatchRule: DiagnosisRule = {
    id: 'java_version_unsupported',
    name: 'Java Version Unsupported',
    description: 'Detects if the selected Java version is too old for the Minecraft version.',
    tier: 2,
    defaultConfidence: 100,
    triggers: [/UnsupportedClassVersionError/i],
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (!server.version || !server.javaVersion) return null;

        // 1. Log Match
        if (logs.some(l => l.includes('UnsupportedClassVersionError'))) {
             return {
                id: `java-ver-err-${server.id}-${Date.now()}`,
                ruleId: 'java_version_unsupported',
                severity: 'CRITICAL',
                title: 'Incompatible Java Version',
                explanation: 'The server crashed because the selected Java version is too old for this Minecraft version. (UnsupportedClassVersionError)',
                recommendation: 'Switch to a newer Java version (e.g. Java 17 for 1.18+, Java 21 for 1.20.6+).',
                action: {
                    type: 'SWITCH_JAVA',
                    payload: { serverId: server.id, target: 'auto' },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }

        // 2. Proactive Version Logic
        const mcMajor = parseInt(server.version.split('.')[1]);
        const javaNum = parseInt(server.javaVersion.replace(/\D/g, ''));

        if (mcMajor >= 21 && javaNum < 21) {
             return {
                id: `java-proactive-${server.id}-${Date.now()}`,
                ruleId: 'java_version_unsupported',
                severity: 'WARNING',
                title: 'Modern Minecraft (1.21+) requires Java 21',
                explanation: `You are trying to run Minecraft ${server.version} with Java ${javaNum}. This will likely fail to start.`,
                recommendation: 'Switch to Java 21.',
                action: {
                    type: 'SWITCH_JAVA',
                    payload: { serverId: server.id, target: 'Java 21' },
                    autoHeal: true
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
    JavaBinaryMissingRule
];
