import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';

export class FileWatcherService extends EventEmitter {
    private watchers: Map<string, chokidar.FSWatcher> = new Map();

    watchServer(serverId: string, directory: string) {
        if (this.watchers.has(serverId)) {
            this.watchers.get(serverId)?.close();
        }

        console.log(`[FileWatcher] Starting watch for server ${serverId}: ${directory}`);
        
        const watcher = chokidar.watch(directory, {
            ignored: [
                /(^|[\/\\])\../, // ignore dotfiles
                '**/world/**',   // ignore world folder for performance
                '**/logs/**',    // ignore logs if you have a separate logger
                'node_modules',
                'temp_uploads',
                'backups'
            ],
            persistent: true,
            ignoreInitial: true,
            depth: 3
        });

        watcher
            .on('add', path => this.emitChange(serverId, 'add', path))
            .on('change', path => this.emitChange(serverId, 'change', path))
            .on('unlink', path => this.emitChange(serverId, 'unlink', path))
            .on('addDir', path => this.emitChange(serverId, 'addDir', path))
            .on('unlinkDir', path => this.emitChange(serverId, 'unlinkDir', path));

        this.watchers.set(serverId, watcher);
    }

    private emitChange(serverId: string, event: string, filePath: string) {
        const relativePath = path.basename(filePath);
        this.emit('fileChange', {
            serverId,
            event,
            path: filePath,
            name: relativePath
        });
    }

    unwatchServer(serverId: string) {
        if (this.watchers.has(serverId)) {
            this.watchers.get(serverId)?.close();
            this.watchers.delete(serverId);
        }
    }
}

export const fileWatcherService = new FileWatcherService();
