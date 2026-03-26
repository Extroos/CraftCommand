import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs-extra';
import { SERVERS_ROOT } from '../../constants';

/**
 * FileWatcherService (Professional Scale)
 * Uses a single root watcher for the entire SERVERS_ROOT to prevent 
 * file handle exhaustion. Dispatches events to subscribers based on path.
 */
export class FileWatcherService extends EventEmitter {
    private rootWatcher: chokidar.FSWatcher | null = null;
    private watchedServers: Set<string> = new Set();

    constructor() {
        super();
        this.initRootWatcher();
    }

    private initRootWatcher() {
        if (this.rootWatcher) return;

        console.log(`[FileWatcher] Initializing Single-Root Watcher for: ${SERVERS_ROOT}`);
        
        fs.ensureDirSync(SERVERS_ROOT);

        this.rootWatcher = chokidar.watch(SERVERS_ROOT, {
            ignored: [
                /(^|[\/\\])\../,     // ignore dotfiles
                '**/world/**',        // ignore world folder (heavy)
                '**/logs/**',         // ignore logs (handled by streamer)
                '**/node_modules/**',
                '**/backups/**',
                '**/temp_uploads/**'
            ],
            persistent: true,
            ignoreInitial: true,
            depth: 3 // Enough for core config files
        });

        this.rootWatcher
            .on('add', p => this.handleEvent('add', p))
            .on('change', p => this.handleEvent('change', p))
            .on('unlink', p => this.handleEvent('unlink', p))
            .on('addDir', p => this.handleEvent('addDir', p))
            .on('unlinkDir', p => this.handleEvent('unlinkDir', p));
        
        this.rootWatcher.on('error', (err) => {
            console.error(`[FileWatcher] Root watcher error:`, err);
        });
    }

    private handleEvent(event: string, filePath: string) {
        // Path structure: SERVERS_ROOT/serverId/filename.ext
        const relative = path.relative(SERVERS_ROOT, filePath);
        const parts = relative.split(path.sep);
        
        if (parts.length >= 2) {
            const serverId = parts[0];
            const fileName = parts.slice(1).join('/');

            // Only emit if this server is actually supposed to be "watched" 
            // (e.g. if we want to support on-demand watching in the future)
            if (this.watchedServers.has(serverId)) {
                this.emit('fileChange', {
                    serverId,
                    event,
                    path: filePath,
                    name: fileName
                });
            }
        }
    }

    /**
     * Mark a server as "active" for watching. 
     * In Single-Root mode, this just enables event dispatching for this ID.
     */
    watchServer(serverId: string, directory?: string) {
        this.watchedServers.add(serverId);
        // console.log(`[FileWatcher] Dispatching enabled for ${serverId}`);
    }

    unwatchServer(serverId: string) {
        this.watchedServers.delete(serverId);
    }

    shutdown() {
        console.log('[FileWatcher] Shutting down root watcher...');
        this.rootWatcher?.close();
        this.rootWatcher = null;
        this.watchedServers.clear();
    }
}

export const fileWatcherService = new FileWatcherService();
