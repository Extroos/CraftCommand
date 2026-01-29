

import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import AdmZip from 'adm-zip';


import { EventEmitter } from 'events';

const execAsync = util.promisify(exec);

export class JavaManager extends EventEmitter {
    

    // Download portable Java if missing
    async ensureJava(version: string): Promise<string> {
        // Map "Java 17" to "17", "Java 8" to "8"
        const majorVer = version.replace('Java ', '').trim();
        const runtimeDir = path.join(__dirname, '../../runtimes', majorVer);
        const javaBin = path.join(runtimeDir, 'bin', 'java.exe');

        // Check if already exists
        if (await fs.pathExists(javaBin)) {
            return javaBin;
        }

        // If not found, download it
        console.log(`[JavaManager] Runtime ${version} not found. Downloading...`);
        this.emit('status', { message: `Downloading ${version}...` });
        await this.downloadJava(majorVer, runtimeDir);
        return javaBin;
    }

    async downloadJava(majorVer: string, destDir: string) {
        // Adoptium API (Temurin)
        // https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jdk/hotspot/normal/eclipse
        const url = `https://api.adoptium.net/v3/binary/latest/${majorVer}/ga/windows/x64/jdk/hotspot/normal/eclipse`;
        const zipPath = path.join(destDir, '../', `java-${majorVer}.zip`);
        
        await fs.ensureDir(path.dirname(zipPath));

        console.log(`[JavaManager] Downloading JDK ${majorVer} from ${url}`);
        this.emit('status', { message: `Downloading JDK ${majorVer}...` });
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        
        await fs.writeFile(zipPath, response.data);
        
        console.log(`[JavaManager] Extracting JDK ${majorVer}...`);
        this.emit('status', { message: `Extracting JDK ${majorVer}...` });
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(path.dirname(zipPath), true);
        
        // Adoptium zips usually have a root folder like 'jdk-17.0.x+y'. We need to find it and rename/move contents to destDir
        // Or just find the bin path dynamically. Let's try to locate the extracted folder.
        const entries = await fs.readdir(path.dirname(zipPath));
        const jdkFolder = entries.find(e => e.startsWith('jdk') && !e.endsWith('.zip'));
        
        
        if (jdkFolder) {
            const source = path.join(path.dirname(zipPath), jdkFolder);
            
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

}

export const javaManager = new JavaManager();
