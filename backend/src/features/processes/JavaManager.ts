

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
    
    // Phase 56.3: Track current status for session recovery
    public currentStatus: { message: string, percent?: number, phase?: string } | null = null;

    // Download portable Java if missing
    async ensureJava(version: string): Promise<string> {
        console.log(`[JavaManager] Request to ensure ${version}`);
        
        // 1. SMART CHECK: Check for existing system-wide Java first (v1.12.0)
        const detected = await this.detectJavaVersions();
        const majorVer = version.replace('Java ', '').trim();
        
        // Look for a version that matches the major version requested (e.g. 'jdk-17', '17.0.x')
        const matchingSystemJava = detected.find(j => 
            j.version.includes(majorVer) || 
            j.path.includes(`jdk-${majorVer}`) ||
            j.path.includes(`jre-${majorVer}`) ||
            (j.version === 'System Default' && majorVer === '17') // Common default
        );

        if (matchingSystemJava && matchingSystemJava.path !== 'java') {
            logger.info(`[JavaManager] Preferred system Java found for ${version}: ${matchingSystemJava.path}`);
            return matchingSystemJava.path;
        }

        const runtimeDir = path.join(__dirname, '../../runtimes', majorVer);
        const javaBin = path.join(runtimeDir, 'bin', 'java.exe');

        // 2. Check Managed Runtimes
        if (await fs.pathExists(javaBin)) {
            console.log(`[JavaManager] Found existing managed runtime at ${javaBin}`);
            return javaBin;
        }

        // 3. Fallback: Download it
        console.log(`[JavaManager] No compatible Java found. Downloading ${version}...`);
        this.currentStatus = { message: `Downloading ${version}...` };
        this.emit('status', this.currentStatus);
        await this.downloadJava(majorVer, runtimeDir);
        return javaBin;
    }

    async downloadJava(majorVer: string, destDir: string) {
        // Adoptium API (Temurin)
        // https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jdk/hotspot/normal/eclipse
        const url = `https://api.adoptium.net/v3/binary/latest/${majorVer}/ga/windows/x64/jdk/hotspot/normal/eclipse`;
        const zipPath = path.join(destDir, '../', `java-${majorVer}.zip`);
        
        try {
            await fs.ensureDir(path.dirname(zipPath));

            console.log(`[JavaManager] Downloading JDK ${majorVer} from ${url}`);
            this.currentStatus = { message: `Downloading Java ${majorVer}...`, phase: 'downloading' };
            this.emit('status', this.currentStatus);
            
            // Throttle progress updates to prevent performance issues
            let lastProgressEmit = 0;
            let lastPercent = 0;
            
            // Download with progress tracking
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'arraybuffer',
                timeout: 600000, // 10 minute timeout
                onDownloadProgress: (progressEvent: any) => {
                    if (progressEvent.total) {
                        const now = Date.now();
                        const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                        
                        // Only emit if: 1 second has passed OR percentage changed by 5% or more
                        if (now - lastProgressEmit > 1000 || Math.abs(percent - lastPercent) >= 5) {
                            this.currentStatus = { 
                                phase: 'downloading',
                                percent,
                                message: `Downloading Java ${majorVer}... ${percent}%`
                            };
                            this.emit('progress', this.currentStatus);
                            lastProgressEmit = now;
                            lastPercent = percent;
                        }
                    }
                }
            } as any);
            
            // Verify download size (JDK should be at least 50MB)
            const minSize = 50 * 1024 * 1024; // 50MB
            if ((response.data as any).byteLength < minSize) {
                throw new Error(`Downloaded file is too small (${((response.data as any).byteLength / 1024 / 1024).toFixed(1)}MB). Download may be corrupted.`);
            }
            
            await fs.writeFile(zipPath, response.data as any);
            console.log(`[JavaManager] Extraction complete. Size: ${((response.data as any).byteLength / 1024 / 1024).toFixed(1)}MB`);
            
            console.log(`[JavaManager] Extracting JDK ${majorVer}...`);
            this.currentStatus = { message: `Extracting Java ${majorVer}...`, phase: 'extracting' };
            this.emit('status', this.currentStatus);
            
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(path.dirname(zipPath), true);
            
            // Adoptium zips usually have a root folder like 'jdk-17.0.x+y'. We need to find it and rename/move contents to destDir
            // Or just find the bin path dynamically. Let's try to locate the extracted folder.
            const entries = await fs.readdir(path.dirname(zipPath));
            const jdkFolder = entries.find(e => e.startsWith('jdk') && !e.endsWith('.zip'));
            
            
            if (jdkFolder) {
                const source = path.join(path.dirname(zipPath), jdkFolder);
                
                this.currentStatus = { message: `Installing Java ${majorVer}...`, phase: 'installing' };
                this.emit('status', this.currentStatus);
                
                // Safety: Ensure destination is clear
                if (await fs.pathExists(destDir)) {
                    await fs.remove(destDir);
                }

                // Retry loop for Windows permissions
                let attempts = 0;
                while (attempts < 5) {
                    try {
                        // Try Copy + Remove instead of Move (more robust on Windows)
                        await fs.copy(source, destDir, { overwrite: true });
                        // Give it a moment before trying to delete the source
                        await new Promise(r => setTimeout(r, 500)); 
                        try {
                            await fs.remove(source);
                        } catch (cleanupErr) {
                            console.warn(`[JavaManager] Warning: Could not cleanup source ${source}: ${cleanupErr}`);
                        }
                        break;
                    } catch (e: any) {
                        attempts++;
                        console.warn(`[JavaManager] Copy failed (Attempt ${attempts}/5). Retrying in 2s... Error: ${e.message}`);
                        await new Promise(r => setTimeout(r, 2000));
                        if (attempts === 5) throw e;
                    }
                }
            } else {
                throw new Error('Failed to find extracted JDK folder');
            }

            await fs.remove(zipPath);
            console.log(`[JavaManager] JDK ${majorVer} installed to ${destDir}`);
            this.emit('status', { message: `Java ${majorVer} ready`, phase: 'complete' });
            this.currentStatus = null; // Clear on success
            
        } catch (error: any) {
            // Clean up partial downloads on error
            try {
                if (await fs.pathExists(zipPath)) {
                    await fs.remove(zipPath);
                }
                if (await fs.pathExists(destDir)) {
                    await fs.remove(destDir);
                }
            } catch (cleanupErr) {
                console.warn(`[JavaManager] Failed to cleanup after error: ${cleanupErr}`);
            }
            
            // Emit error event with user-friendly message
            const userMessage = error.code === 'ECONNABORTED' 
                ? 'Download timed out. Please check your internet connection.'
                : error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN'
                ? 'Cannot reach download server. Please check your internet connection.'
                : `Download failed: ${error.message}`;
            
            this.currentStatus = { message: userMessage, phase: 'failed' };
            this.emit('error', this.currentStatus);
            throw error;
        }
    }

    // Simplistic detection - in reality needs to scan registry or common paths
    async detectJavaVersions(): Promise<{ version: string, path: string }[]> {
        const foundJavas: { version: string, path: string }[] = [];
        
        // Check system PATH java
        try {
            const { stdout } = await execAsync('java -version');
            foundJavas.push({ version: 'System Default', path: 'java' });
        } catch (e) { /* Java not found on path */ }
        
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
    getRecommendedJavaVersion(minecraftVersion: string): 'Java 8' | 'Java 11' | 'Java 17' | 'Java 21' {
        if (!minecraftVersion) return 'Java 21'; // Default modern

        if (minecraftVersion.startsWith('1.20') || minecraftVersion.startsWith('1.21')) {
            return 'Java 21';
        } else if (minecraftVersion.startsWith('1.18') || minecraftVersion.startsWith('1.19') || minecraftVersion.startsWith('1.17')) {
            return 'Java 17';
        } else if (minecraftVersion.startsWith('1.16')) {
            return 'Java 11';
        } else if (minecraftVersion.startsWith('1.8') || minecraftVersion.startsWith('1.12')) {
            return 'Java 8';
        }

        return 'Java 21'; // Fallback
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
            
            // For 21 and any future versions (22, 23, etc.)
            return `eclipse-temurin:${num}-jre`;
        }
        
        return 'eclipse-temurin:21-jre';
    }
}

export const javaManager = new JavaManager();
