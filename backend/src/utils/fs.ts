import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger';

/**
 * Robust File System Operations (v1.10.0)
 * Specifically handles Windows EBUSY/EPERM errors with exponential backoff.
 */
export class SafeFileOperation {
    private static MAX_RETRIES = 5;
    private static INITIAL_DELAY = 500;

    private static async retry<T>(op: () => Promise<T>, description: string): Promise<T> {
        let lastError: any;
        for (let i = 0; i < this.MAX_RETRIES; i++) {
            try {
                return await op();
            } catch (err: any) {
                lastError = err;
                if (err.code === 'EBUSY' || err.code === 'EPERM') {
                    const delay = this.INITIAL_DELAY * Math.pow(2, i);
                    logger.warn(`[SafeFS] ${description} failed (${err.code}). Retry ${i + 1}/${this.MAX_RETRIES} in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw err;
            }
        }
        logger.error(`[SafeFS] ${description} failed after ${this.MAX_RETRIES} attempts.`);
        throw lastError;
    }

    static async remove(path: string): Promise<void> {
        await this.retry(() => fs.remove(path), `Removing ${path}`);
    }

    static async writeFile(path: string, content: string | Buffer): Promise<void> {
        await this.retry(() => fs.writeFile(path, content), `Writing to ${path}`);
    }

    static async move(src: string, dest: string, options?: fs.MoveOptions): Promise<void> {
        await this.retry(() => fs.move(src, dest, options), `Moving ${src} to ${dest}`);
    }

    static async ensureDir(path: string): Promise<void> {
        await this.retry(() => fs.ensureDir(path), `Ensuring directory ${path}`);
    }

    /**
     * Environment Check: Disk Space (Min 500MB)
     */
    static async checkDiskSpace(dir: string, minMb: number = 500): Promise<void> {
        const si = await import('systeminformation');
        const fsSize = await si.fsSize();
        
        // Find the mount point for the given directory
        const absolutePath = path.resolve(dir);
        let bestMatch: any = null;

        for (const drive of fsSize) {
            if (absolutePath.startsWith(drive.mount)) {
                if (!bestMatch || drive.mount.length > bestMatch.mount.length) {
                    bestMatch = drive;
                }
            }
        }

        if (bestMatch) {
            const freeMb = bestMatch.available / (1024 * 1024);
            if (freeMb < minMb) {
                throw new Error(`Insufficient disk space on ${bestMatch.mount}. Required: ${minMb}MB, Available: ${Math.round(freeMb)}MB`);
            }
            logger.info(`[SafeFS] Disk check passed for ${dir}: ${Math.round(freeMb)}MB available.`);
        }
    }

    /**
     * Environment Check: Write Permissions
     */
    static async checkWritePermissions(dir: string): Promise<void> {
        const testFile = path.join(dir, '.write_test_' + Math.random().toString(36).substring(7));
        try {
            await fs.writeFile(testFile, 'test');
            await fs.remove(testFile);
            logger.info(`[SafeFS] Write permission verified for ${dir}`);
        } catch (err: any) {
            logger.error(`[SafeFS] Write permission denied for ${dir}: ${err.message}`);
            throw new Error(`The panel does not have write permissions for the directory: ${dir}. Please check folder ownership/permissions.`);
        }
    }
}
