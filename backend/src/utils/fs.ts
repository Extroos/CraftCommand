import fs from 'fs-extra';
import path from 'path';
import si from 'systeminformation';
import { logger } from './logger';

/**
 * Robust File System Operations (v1.10.0)
 * Specifically handles Windows EBUSY/EPERM errors with exponential backoff.
 */
export class SafeFileOperation {
    private static MAX_RETRIES = 5;
    private static INITIAL_DELAY = 500;

    /**
     * Security Guard: Prevent path traversal by ensuring paths are within allowed roots.
     */
    public static validatePath(target: string) {
        const { DATA_DIR, SERVERS_ROOT, UPLOADS_ROOT, PROJECT_ROOT } = require('../constants');
        const absoluteTarget = path.resolve(target);
        
        const allowedRoots = [DATA_DIR, SERVERS_ROOT, UPLOADS_ROOT, PROJECT_ROOT].map(r => path.resolve(r));
        const isAllowed = allowedRoots.some(root => 
            absoluteTarget === root || absoluteTarget.startsWith(root + path.sep)
        );
        
        if (!isAllowed) {
            logger.error(`[SafeFS] Security Violation: Attempted to access path outside of authorized directory: ${absoluteTarget}`);
            throw new Error('SECURITY_VIOLATION: Path access denied.');
        }
    }

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
        this.validatePath(path);
        await this.retry(() => fs.remove(path), `Removing ${path}`);
    }

    /**
     * Atomically writes to a file by writing to a .tmp file first, then renaming.
     * Prevents partial writes/corruption on sudden crash or power loss.
     */
    static async writeFile(targetPath: string, content: string | Buffer): Promise<void> {
        this.validatePath(targetPath);
        // Ensure parent directory exists before writing
        await this.ensureDir(path.dirname(targetPath));

        const tmpPath = `${targetPath}.tmp`;
        
        // 1. Write the payload to a temporary file
        await this.retry(async () => {
            // Write to .tmp, making sure we flush to disk if possible
            await fs.writeFile(tmpPath, content);
        }, `Writing temporary file ${tmpPath}`);

        // 2. Atomically swap the tmp file over the active file
        await this.retry(async () => {
            await fs.move(tmpPath, targetPath, { overwrite: true });
        }, `Atomic swap ${tmpPath} -> ${targetPath}`);
    }

    /**
     * Atomically writes a file, but first creates a .bak copy of the original if it exists.
     */
    static async writeWithBackup(targetPath: string, content: string | Buffer): Promise<void> {
        this.validatePath(targetPath);
        if (await fs.pathExists(targetPath)) {
            const bakPath = `${targetPath}.bak`;
            await this.retry(() => fs.copy(targetPath, bakPath, { overwrite: true }), `Creating backup ${bakPath}`);
        }
        await this.writeFile(targetPath, content);
    }

    static async move(src: string, dest: string, options?: fs.MoveOptions): Promise<void> {
        this.validatePath(src);
        this.validatePath(dest);
        await this.retry(() => fs.move(src, dest, options), `Moving ${src} to ${dest}`);
    }

    static async ensureDir(path: string): Promise<void> {
        this.validatePath(path);
        await this.retry(() => fs.ensureDir(path), `Ensuring directory ${path}`);
    }

    /**
     * Environment Check: Disk Space (Min 500MB)
     */
    static async checkDiskSpace(dir: string, minMb: number = 500): Promise<void> {
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
