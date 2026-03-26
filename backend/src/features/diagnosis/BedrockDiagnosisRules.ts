import { DiagnosisRule, SystemStats, ServerConfig, DiagnosisResult } from './types';
import fs from 'fs-extra';
import path from 'path';

export const BedrockExecutableRule: DiagnosisRule = {
    id: 'bedrock_missing_exe',
    name: 'Missing Bedrock Executable',
    description: 'Checks if bedrock_server.exe (Win) or bedrock_server (Linux) exists',
    triggers: [], // Proactive check
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Bedrock' || !server.hasStarted) return null;

        const isWin = process.platform === 'win32';
        const exeName = isWin ? 'bedrock_server.exe' : 'bedrock_server';
        const exePath = path.join(server.workingDirectory, exeName);

        if (!(await fs.pathExists(exePath))) {
            return {
                id: `br-exe-${server.id}-${Date.now()}`,
                ruleId: 'bedrock_missing_exe',
                severity: 'CRITICAL',
                title: 'Bedrock Executable Missing',
                explanation: `The core Bedrock server file '${exeName}' is missing from the working directory.`,
                recommendation: 'Re-install the server or manually place the Bedrock binaries in the folder.',
                action: {
                    type: 'REINSTALL_BEDROCK',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const BedrockPortRule: DiagnosisRule = {
    id: 'bedrock_port_binding',
    name: 'Bedrock Port Binding Check',
    description: 'Checks for UDP port binding failures specific to Bedrock',
    triggers: [],
    tier: 1,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Bedrock') return null;

        const { NetUtils } = require('../../utils/NetUtils');
        const hasLogMatch = logs.some(l => /Failed to bind|Address already in use/i.test(l));
        const isPortBusy = await NetUtils.checkUDPPortBind(server.port);

        if (hasLogMatch || isPortBusy) {
            return {
                id: `br-port-${server.id}-${Date.now()}`,
                ruleId: 'bedrock_port_binding',
                severity: 'CRITICAL',
                title: 'Bedrock Port Conflict',
                explanation: `Bedrock failed to bind to UDP port ${server.port}. This port is already in use by another instance or blocked by a firewall.`,
                recommendation: 'Change the port in Server Settings or stop the conflicting process.',
                timestamp: Date.now()
            };
        }
        return null;
    },
    heal: async (server: ServerConfig) => {
        const { getServer, saveServer } = require('../servers/ServerService');
        const s = getServer(server.id);
        if (s) {
            // Increment port and save
            s.port = (s.port || 19132) + 1;
            saveServer(s);
            return true;
        }
        return false;
    }
};

/**
 * Detects corrupted or malformed whitelist/permissions JSON files
 */
export const BedrockJSONCorruptionRule: DiagnosisRule = {
    id: 'bedrock_json_corrupted',
    name: 'Bedrock JSON Config Check',
    description: 'Detects malformed permissions.json or whitelist.json files',
    triggers: [], // Proactive
    tier: 2,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Bedrock' || !server.hasStarted) return null;

        const files = ['permissions.json', 'whitelist.json'];

        for (const file of files) {
            const filePath = path.join(server.workingDirectory, file);
            if (await fs.pathExists(filePath)) {
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    if (content.trim()) {
                        JSON.parse(content);
                    }
                } catch (e: any) {
                    return {
                        id: `br-json-${file}-${server.id}-${Date.now()}`,
                        ruleId: 'bedrock_json_corrupted',
                        severity: 'WARNING',
                        title: `Malformed ${file}`,
                        explanation: `The file ${file} contains invalid JSON syntax and will be ignored by the server.`,
                        recommendation: `Repair the syntax in ${file} or delete it to let the server regenerate a fresh one.`,
                        timestamp: Date.now()
                    };
                }
            }
        }
        return null;
    }
};

export const BedrockDependencyRule: DiagnosisRule = {
    id: 'bedrock_linux_deps',
    name: 'Bedrock Linux Dependencies',
    description: 'Checks for missing shared libraries (libssl, libcrypto) on Linux',
    triggers: [
        /error while loading shared libraries/i,
        /libssl\.so/i,
        /libcrypto\.so/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Bedrock' || process.platform === 'win32') return null;

        const match = logs.find(l => /error while loading shared libraries: (lib[\w\.]+):/i.test(l));
        if (match) {
            const libMatch = match.match(/error while loading shared libraries: (lib[\w\.]+):/i);
            const missingLib = libMatch ? libMatch[1] : 'required libraries';

            return {
                id: `br-deps-${server.id}-${Date.now()}`,
                ruleId: 'bedrock_linux_deps',
                severity: 'CRITICAL',
                title: 'Missing System Library',
                explanation: `The Bedrock server cannot start because a system library is missing: ${missingLib}.`,
                recommendation: 'Install the missing dependencies (e.g., openssl 1.1) using your linux package manager (apt/yum).',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const BedrockVCRedistRule: DiagnosisRule = {
    id: 'bedrock_vcredist_missing',
    name: 'Windows C++ Redistributable Check',
    description: 'Detects if Visual C++ 2015-2019 Redistributable is missing on Windows',
    triggers: [
        /VCRUNTIME140\.dll/i,
        /MSVCP140\.dll/i,
        /The code execution cannot proceed/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Bedrock' || process.platform !== 'win32') return null;

        const hasError = logs.some(l => /VCRUNTIME140\.dll|MSVCP140\.dll/i.test(l));
        if (hasError) {
            return {
                id: `br-vc-${server.id}-${Date.now()}`,
                ruleId: 'bedrock_vcredist_missing',
                severity: 'CRITICAL',
                title: 'Missing C++ Redistributable',
                explanation: 'The Bedrock server requires the Visual C++ 2015-2019 Redistributable (x64) to run.',
                recommendation: 'Download and install the latest "vc_redist.x64.exe" from the official Microsoft website.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const BedrockVersionMismatchRule: DiagnosisRule = {
    id: 'bedrock_version_mismatch',
    name: 'Bedrock Version Check',
    description: 'Checks if the executable version matches the expected server version',
    triggers: [], // Pre-flight check
    tier: 2,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Bedrock') return null;
        return null;
    }
};

/**
 * Detects level.dat corruption which is common in Bedrock
 */
export const BedrockLevelDatRule: DiagnosisRule = {
    id: 'bedrock_level_dat_corrupt',
    name: 'Bedrock level.dat Corruption',
    description: 'Detects if the level.dat file is missing or corrupted',
    triggers: [
        /Failed to open level.dat/i,
        /Level format not recognized/i,
        /level.dat is not a valid NBT file/i
    ],
    tier: 3,
    defaultConfidence: 95,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Bedrock') return null;

        const worldName = 'Bedrock Level'; // Default
        const levelDatPath = path.join(server.workingDirectory, 'worlds', worldName, 'level.dat');
        
        const hasLogMatch = logs.some(l => /Failed to open level.dat|Level format not recognized/i.test(l));
        
        if (hasLogMatch) {
            return {
                id: `br-level-${server.id}-${Date.now()}`,
                ruleId: 'bedrock_level_dat_corrupt',
                severity: 'CRITICAL',
                title: 'World Data Corruption',
                explanation: 'The server failed to load the world because the level.dat file is corrupted or unreadable.',
                recommendation: 'Restore the level.dat from a backup or use a world repair tool.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Detects common WSL/Path issues when running on Windows but accessing Linux-style paths
 */
export const BedrockWSLPathRule: DiagnosisRule = {
    id: 'bedrock_wsl_path_issue',
    name: 'Bedrock WSL/Path Conflict',
    description: 'Detects if the server is trying to access paths in a way that conflicts with WSL or PowerShell permissions',
    triggers: [
        /Access is denied/i,
        /Operation not permitted/i,
        /\\\\wsl\$/i
    ],
    tier: 1,
    defaultConfidence: 80,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (server.software !== 'Bedrock' || process.platform !== 'win32') return null;

        const hasWSLPrefix = server.workingDirectory.toLowerCase().includes('wsl$');
        const hasAccessDenied = logs.some(l => /Access is denied/i.test(l));

        if (hasWSLPrefix && hasAccessDenied) {
            return {
                id: `br-wsl-${server.id}-${Date.now()}`,
                ruleId: 'bedrock_wsl_path_issue',
                severity: 'WARNING',
                title: 'WSL Path Permission Issue',
                explanation: 'The server is located on a WSL network share. Bedrock Server often has issues with block-level locking over WSL shares.',
                recommendation: 'Move the server folder to a local drive (e.g., C:\\Servers) for better compatibility.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const BedrockRules: DiagnosisRule[] = [
    BedrockExecutableRule,
    BedrockPortRule,
    BedrockDependencyRule,
    BedrockVCRedistRule,
    // BedrockVersionMismatchRule excluded: stub that always returns null (placeholder for future impl)
    BedrockJSONCorruptionRule,
    BedrockLevelDatRule,
    BedrockWSLPathRule
];
