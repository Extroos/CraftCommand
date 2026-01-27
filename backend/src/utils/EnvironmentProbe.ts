
import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

export class EnvironmentProbe {

    /**
     * Check the Java version of a specific executable.
     * Returns the major version number (e.g. 17, 21, 8) or null if invalid.
     */
    static async getJavaVersion(javaPath: string): Promise<number | null> {
        return new Promise((resolve) => {
            const child = spawn(javaPath, ['-version']);
            let output = '';

            // Java -version prints to stderr usually
            child.stderr.on('data', (d) => output += d.toString());
            child.stdout.on('data', (d) => output += d.toString());

            child.on('close', () => {
                // Parse "version 1.8.0_..." or "version 17.0.1"
                const match = output.match(/version "(\d+)\.(\d+)(?:\.|_)(?:.*)"/);
                // Newer Java output: "openjdk 17.0.1 ..."
                const matchNew = output.match(/version "(\d+)(?:\.|_)(?:.*)"/);

                if (matchNew && parseInt(matchNew[1]) > 1) {
                    resolve(parseInt(matchNew[1]));
                    return;
                }

                if (match) {
                     // 1.8 -> 8
                     if (match[1] === '1') resolve(parseInt(match[2]));
                     else resolve(parseInt(match[1]));
                     return;
                }
                
                resolve(null);
            });
            
            child.on('error', () => resolve(null));
        });
    }

    /**
     * Check if the server directory has write permissions
     */
    static async checkPermissions(dir: string): Promise<boolean> {
        try {
            const testFile = path.join(dir, '.perm_test');
            await fs.writeFile(testFile, 'test');
            await fs.remove(testFile);
            return true;
        } catch (e) {
            return false;
        }
    }
}
