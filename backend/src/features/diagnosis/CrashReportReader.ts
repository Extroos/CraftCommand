import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';

export interface CrashReport {
    filename: string;
    description: string;
    content: string;
    timestamp: number;
}

export class CrashReportReader {
    
    /**
     * Finds and reads the most recent crash report for a server.
     * @param serverStatus The current status of the server to determine relevance window.
     */
    static async getRecentCrashReport(serverCwd: string, serverStatus?: string): Promise<CrashReport | null> {
        try {
            const crashDir = path.join(serverCwd, 'crash-reports');
            if (!await fs.pathExists(crashDir)) return null;

            const files = await fs.readdir(crashDir).catch(() => []);
            const crashFiles = files.filter(f => 
                (f.endsWith('.txt') && f.startsWith('crash-')) || 
                (f.startsWith('hs_err_pid') && f.endsWith('.log'))
            ).map(f => path.join(crashDir, f));

            // ALSO: Scan root for hs_err_pid files (JVM native crashes)
            const rootFiles = await fs.readdir(serverCwd).catch(() => []);
            const rootCrashFiles = rootFiles
                .filter(f => f.startsWith('hs_err_pid') && f.endsWith('.log'))
                .map(f => path.join(serverCwd, f));
            
            const allCrashFiles = [...crashFiles, ...rootCrashFiles];

            if (allCrashFiles.length === 0) return null;

            // Sort by time (filename usually has date, but we check fs stats for accuracy)
            const fileStats = await Promise.all(allCrashFiles.map(async filePath => {
                const stat = await fs.stat(filePath);
                return { file: path.basename(filePath), mtime: stat.mtimeMs, path: filePath };
            }));

            // Get newest
            const newest = fileStats.sort((a, b) => b.mtime - a.mtime)[0];

            // Filter out old crashes
            // 1. If server is online: strict 10-minute window (prevents reporting historic junk)
            // 2. If server is OFFLINE/CRASHED: wider 24-hour window (explains WHY it's down)
            const window = (serverStatus === 'OFFLINE' || serverStatus === 'CRASHED') 
                ? 24 * 60 * 60 * 1000 // 24 Hours
                : 10 * 60 * 1000;      // 10 Minutes
            
            if (Date.now() - newest.mtime > window) {
                return null;
            }

            const content = await fs.readFile(newest.path, 'utf-8');
            const description = this.extractDescription(content);

            logger.info(`[CrashReportReader] Found recent crash report: ${newest.file}`);

            return {
                filename: newest.file,
                description,
                content,
                timestamp: newest.mtime
            };

        } catch (error) {
            logger.warn(`[CrashReportReader] Failed to read crash reports: ${error}`);
            return null;
        }
    }

    private static extractDescription(content: string): string {
        const lines = content.split('\n');
        // Minecraft crash reports usually have a "Description: " line near the top
        const descLine = lines.find(l => l.trim().startsWith('Description: '));
        if (descLine) {
            return descLine.replace('Description: ', '').trim();
        }
        // Fallback: Try to find the exception type
        const exceptionLine = lines.find(l => l.includes('Exception') || l.includes('Error'));
        return exceptionLine ? exceptionLine.trim() : 'Unknown Error';
    }
}
