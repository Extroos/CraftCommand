import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { sendToAgent, isAgentConnected } from './NodeAgentHandler';

/**
 * FileTransferService — Phase 21
 * 
 * Handles chunked file transfer from the panel to remote Node Agents.
 * Uses Socket.IO acknowledgements for flow control.
 * 
 * Protocol:
 *   1. Panel scans server directory for all files
 *   2. Panel sends `agent:file-begin` with manifest (file list + sizes)
 *   3. For each file, panel sends `agent:file-chunk` events (64KB chunks)
 *   4. Panel sends `agent:file-end` when all files are sent
 *   5. Agent acknowledges each step
 * 
 * Features:
 *   - 64KB chunk size for efficient transfer
 *   - SHA-256 checksums per file for integrity verification
 *   - Skip unchanged files if the agent already has them (hash comparison)
 *   - Progress callbacks for UI feedback
 */

const CHUNK_SIZE = 64 * 1024; // 64KB

export interface FileManifestEntry {
    relativePath: string;
    size: number;
    hash: string;
}

export interface TransferProgress {
    serverId: string;
    nodeId: string;
    phase: 'scanning' | 'transferring' | 'reconnecting' | 'verifying' | 'complete' | 'error';
    totalFiles: number;
    transferredFiles: number;
    totalBytes: number;
    transferredBytes: number;
    currentFile?: string;
    error?: string;
}

type ProgressCallback = (progress: TransferProgress) => void;

/**
 * Scan a directory recursively and build a file manifest.
 */
function scanDirectory(baseDir: string, currentDir: string = ''): FileManifestEntry[] {
    const entries: FileManifestEntry[] = [];
    const fullPath = currentDir ? path.join(baseDir, currentDir) : baseDir;

    if (!fs.existsSync(fullPath)) return entries;

    const items = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const item of items) {
        const relativePath = currentDir ? path.join(currentDir, item.name) : item.name;

        // Skip logs, crash reports, and large temp data
        if (item.name === 'logs' || item.name === 'crash-reports' || item.name === '.git' || item.name === 'node_modules') {
            continue;
        }

        if (item.isDirectory()) {
            entries.push(...scanDirectory(baseDir, relativePath));
        } else if (item.isFile()) {
            const filePath = path.join(baseDir, relativePath);
            const stat = fs.statSync(filePath);

            // Skip files > 100MB (worlds should use a separate transfer mechanism)
            if (stat.size > 100 * 1024 * 1024) {
                logger.warn(`[FileTransfer] Skipping large file: ${relativePath} (${Math.round(stat.size / 1024 / 1024)}MB)`);
                continue;
            }

            const content = fs.readFileSync(filePath);
            const hash = crypto.createHash('sha256').update(content).digest('hex');

            entries.push({
                relativePath: relativePath.replace(/\\/g, '/'), // Normalize to forward slashes
                size: stat.size,
                hash
            });
        }
    }

    return entries;
}

/**
 * Transfer all server files to a remote node agent.
 */
export async function transferServerFiles(
    serverId: string,
    nodeId: string,
    serverDir: string,
    onProgress?: ProgressCallback,
    timeoutMs: number = 60000
): Promise<void> {

    if (!isAgentConnected(nodeId)) {
        throw new Error(`Cannot transfer files: Node Agent "${nodeId}" is not connected.`);
    }

    const progress: TransferProgress = {
        serverId,
        nodeId,
        phase: 'scanning',
        totalFiles: 0,
        transferredFiles: 0,
        totalBytes: 0,
        transferredBytes: 0
    };

    onProgress?.(progress);

    // Step 1: Scan server directory
    logger.info(`[FileTransfer] Scanning server directory: ${serverDir}`);
    const manifest = scanDirectory(serverDir);
    progress.totalFiles = manifest.length;
    progress.totalBytes = manifest.reduce((sum, f) => sum + f.size, 0);
    onProgress?.(progress);

    logger.info(`[FileTransfer] Found ${manifest.length} files (${Math.round(progress.totalBytes / 1024 / 1024 * 10) / 10} MB)`);

    if (manifest.length === 0) {
        logger.warn(`[FileTransfer] No files to transfer for server ${serverId}`);
        progress.phase = 'complete';
        onProgress?.(progress);
        return;
    }

    // Step 2: Send manifest and get back which files need transfer
    progress.phase = 'transferring';
    onProgress?.(progress);

    let filesToTransfer: string[];
    try {
        const beginResult = await sendToAgent(nodeId, 'agent:file-begin', {
            serverId,
            manifest: manifest.map(f => ({
                relativePath: f.relativePath,
                size: f.size,
                hash: f.hash
            }))
        }, timeoutMs);

        // Agent responds with which files it needs (hash mismatch or missing)
        filesToTransfer = beginResult?.needed || manifest.map(f => f.relativePath);
    } catch (err: any) {
        progress.phase = 'error';
        progress.error = err.message;
        onProgress?.(progress);
        throw err;
    }

    logger.info(`[FileTransfer] Agent needs ${filesToTransfer.length}/${manifest.length} files`);

    // Step 3: Transfer needed files in chunks
    for (const relativePath of filesToTransfer) {
        const entry = manifest.find(f => f.relativePath === relativePath);
        if (!entry) continue;

        const filePath = path.join(serverDir, relativePath);
        if (!fs.existsSync(filePath)) continue;

        progress.currentFile = relativePath;
        onProgress?.(progress);

        const content = fs.readFileSync(filePath);
        const totalChunks = Math.ceil(content.length / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, content.length);
            const chunk = content.subarray(start, end);

            // Jitter-tolerant pause loop: wait up to 60 seconds if node drops
            let waitTime = 0;
            const originalPhase = progress.phase;
            
            while (!isAgentConnected(nodeId) && waitTime < 60) {
                if (waitTime === 0) {
                    logger.warn(`[FileTransfer] Node "${nodeId}" disconnected. Pausing transfer up to 60s for reconnect...`);
                    progress.phase = 'reconnecting';
                    onProgress?.(progress);
                }
                await new Promise(r => setTimeout(r, 1000));
                waitTime++;
            }
 
            if (!isAgentConnected(nodeId)) {
                progress.phase = 'error';
                progress.error = `Transfer interrupted: Node Agent "${nodeId}" disconnected permanently (60s timeout).`;
                onProgress?.(progress);
                throw new Error(progress.error);
            }
 
            if (waitTime > 0) {
                logger.info(`[FileTransfer] Node "${nodeId}" reconnected. Resuming chunk ${i}/${totalChunks}...`);
                progress.phase = originalPhase;
                onProgress?.(progress);
            }

            let retries = 3;
            while (retries > 0) {
                try {
                    await sendToAgent(nodeId, 'agent:file-chunk', {
                        serverId,
                        relativePath,
                        chunkIndex: i,
                        totalChunks,
                        data: chunk.toString('base64'),
                        size: entry.size,
                        hash: entry.hash
                    }, 30000);
                    break; // Success
                } catch (err: any) {
                    retries--;
                    if (retries === 0) {
                        progress.phase = 'error';
                        progress.error = `Failed to transfer ${relativePath} (chunk ${i}/${totalChunks}): ${err.message}`;
                        onProgress?.(progress);
                        throw err;
                    }
                    // Wait 1s before retry
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            progress.transferredBytes += chunk.length;
        }

        progress.transferredFiles++;
        onProgress?.(progress);
    }

    // Step 4: Signal transfer complete
    try {
        await sendToAgent(nodeId, 'agent:file-end', { serverId }, 15000);
    } catch (err: any) {
        logger.warn(`[FileTransfer] file-end acknowledgement failed: ${err.message}`);
        // Non-fatal — files are already transferred
    }

    progress.phase = 'complete';
    progress.currentFile = undefined;
    onProgress?.(progress);

    logger.info(`[FileTransfer] ✓ Transfer complete: ${progress.transferredFiles} files, ${Math.round(progress.transferredBytes / 1024 / 1024 * 10) / 10} MB`);
}
