

import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { logger } from '../../utils/logger';


import { EventEmitter } from 'events';

const execAsync = util.promisify(exec);

export class JavaManager extends EventEmitter {
    
    // Track current status for session recovery
    public currentStatus: { message: string, percent?: number, phase?: string } | null = null;

    // Download portable Java if missing
    async ensureJava(version: string, serverId?: string): Promise<any> {
        logger.info(`[JavaManager] Request to ensure ${version}`);
        
        const majorVer = version.replace('Java ', '').trim(); 
        
        // v1.14.0: Unified Provisioning
        try {
            this.currentStatus = { message: `Provisioning ${version}...`, phase: 'provisioning' };
            this.emit('status', { ...this.currentStatus, serverId });
            
            const provisioner = require('../../../scripts/core/runtime-provisioner.cjs');
            const env = await provisioner.provisionJava(majorVer);
            
            this.currentStatus = null;
            this.emit('complete', { serverId });
            
            return {
                path: path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
                env
            };
        } catch (e: any) {
            logger.error(`[JavaManager] Provisioning failed: ${e.message}`);
            this.currentStatus = { message: `Failed to provision ${version}`, phase: 'failed' };
            this.emit('error', { ...this.currentStatus, serverId });
            throw e;
        }
    }


    // Simplistic detection - in reality needs to scan registry or common paths
    async detectJavaVersions(): Promise<{ version: string, path: string }[]> {
        const foundJavas: { version: string, path: string }[] = [];
        
        // Check system PATH java
        try {
            const { stdout, stderr } = await execAsync('java -version');
            const output = stdout + stderr; // Capture both stdout and stderr for version info
            // Attempt to parse version from output
            const versionMatch = output.match(/(?:java|openjdk) version "(.*?)"/);
            const versionString = versionMatch ? versionMatch[1] : 'System Default';
            
            let finalPath = 'java';
            try {
                const { stdout: pathOut } = await execAsync(process.platform === 'win32' ? 'powershell -Command "(Get-Command java).Source"' : 'which java');
                finalPath = pathOut.trim() || 'java';
            } catch (pe) { logger.debug(`[JavaManager] Failed to resolve absolute path for detected Java: ${pe}`); }
            
            foundJavas.push({ version: versionString, path: finalPath });
        } catch (e) { logger.debug(`[JavaManager] Error detecting system Java on PATH: ${e}`); }
        
        // Check Managed Runtimes
        const runtimesDir = path.join(__dirname, '../../runtimes');
        if (await fs.pathExists(runtimesDir)) {
             const dirs = await fs.readdir(runtimesDir);
             for (const dir of dirs) {
                 const bin = path.join(runtimesDir, dir, 'bin', 'java.exe');
                 if (await fs.pathExists(bin)) {
                     foundJavas.push({ version: `Managed Java ${dir}`, path: bin });
                 }
             }
        }

        // Common Windows Paths
        const commonPaths = [
            'C:\\Program Files\\Java',
            'C:\\Program Files (x86)\\Java'
        ];

        for (const root of commonPaths) {
            if (await fs.pathExists(root)) {
                const subdirs = await fs.readdir(root);
                for (const dir of subdirs) {
                    const binPath = path.join(root, dir, 'bin', 'java.exe');
                    if (await fs.pathExists(binPath)) {
                         foundJavas.push({ version: dir, path: binPath });
                    }
                }
            }
        }

        return foundJavas;
    }


    /**
     * Smart Heuristic: Get recommended Java Major Version for a specific Minecraft Version
     */
    getRecommendedJavaVersion(minecraftVersion: string): 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21' | 'Java 25' {
        if (!minecraftVersion) return 'Java 21'; 

        const parts = minecraftVersion.split('.');
        const major = parseInt(parts[0]);
        const minor = parseInt(parts[1] || '0');
        const patch = parseInt(parts[2] || '0');

        // Mojang switched to 26.x in 2026
        if (major >= 26) return 'Java 25';

        // Legacy 1.x logic
        if (major === 1) {
            if (minor > 21) return 'Java 25';
            if (minor > 20 || (minor === 20 && patch >= 5)) return 'Java 21';
            if (minor >= 17) return 'Java 17';
            if (minor >= 16) return 'Java 11';
            if (minor >= 8) return 'Java 8';
        }

        return 'Java 21'; // Fallback for modern or unknown
    }

    /**
     * Map a Java Version string (e.g., "Java 21") to a safe Docker image
     */
    getDockerImageForJava(javaVersion: string): string {
        if (!javaVersion) return 'eclipse-temurin:21-jre'; // Modern high default
        
        const match = javaVersion.match(/\d+/);
        if (match) {
            const num = parseInt(match[0]);
            
            // Map to standard Temurin LTS/Supported versions
            if (num <= 8) return 'eclipse-temurin:8-jre';
            if (num <= 11) return 'eclipse-temurin:11-jre';
            if (num <= 17) return 'eclipse-temurin:17-jre';
            
            // For 21, 25 and any future versions
            return `eclipse-temurin:${num}-jre`;
        }
        
        return 'eclipse-temurin:25-jre';
    }
}

export const javaManager = new JavaManager();
