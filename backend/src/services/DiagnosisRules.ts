
import { DiagnosisRule, DiagnosisResult, SystemStats } from './DiagnosisService';
import { ServerConfig } from '../types';
import { ConfigReader } from '../utils/ConfigReader';
import { EnvironmentProbe } from '../utils/EnvironmentProbe';
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

export const CoreRules = [EulaRule, PortConflictRule, JavaVersionRule, MemoryRule];
