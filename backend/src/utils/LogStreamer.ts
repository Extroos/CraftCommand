
import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger';

/**
 * LogStreamer: Performance-optimized disk-based logging for Minecraft servers.
 * Handles append-only streaming to avoid full file rewrites and memory bloat.
 */
class LogStreamer {
    private streams: Map<string, fs.WriteStream> = new Map();

    /**
     * Appends a line to the server's latest.log on disk.
     */
    public append(id: string, workingDirectory: string, line: string) {
        let stream = this.streams.get(id);
        
        if (!stream) {
            const logDir = path.join(workingDirectory, 'logs');
            fs.ensureDirSync(logDir);
            const logPath = path.join(logDir, 'latest.log');
            
            // Re-create stream (v1.12.5)
            stream = fs.createWriteStream(logPath, { flags: 'a' });
            this.streams.set(id, stream);
        }

        stream.write(line + '\n');
    }

    /**
     * Closes the stream for a specific server (e.g. on stop).
     */
    public close(id: string) {
        const stream = this.streams.get(id);
        if (stream) {
            stream.end();
            this.streams.delete(id);
        }
    }

    /**
     * Efficiently reads the last N lines from the log file on disk.
     * v1.14.0: Reverse-buffer scan to avoid reading the whole file.
     */
    public async tail(workingDirectory: string, lines: number = 500): Promise<string[]> {
        const logPath = path.join(workingDirectory, 'logs', 'latest.log');
        if (!fs.existsSync(logPath)) return [];

        let fd: number | null = null;
        try {
            const stats = await fs.stat(logPath);
            const fileSize = stats.size;
            if (fileSize === 0) return [];

            fd = await fs.open(logPath, 'r');
            const bufferSize = Math.min(fileSize, 1024 * 64); // Read last 64KB
            const buffer = Buffer.alloc(bufferSize);
            
            await fs.read(fd, buffer, 0, bufferSize, fileSize - bufferSize);
            
            const content = buffer.toString('utf8');
            const allLines = content.split('\n');
            
            // If the last chunk doesn't have enough lines, we just return what we have (Optimization)
            // Realistically 64KB is plenty for the last 500 lines of a Minecraft log.
            return allLines.slice(-lines).map(l => l.trim());
        } catch (e) {
            logger.error(`[LogStreamer] Tail failed: ${e}`);
            return [];
        } finally {
            if (fd !== null) await fs.close(fd);
        }
    }
}

export const logStreamer = new LogStreamer();
