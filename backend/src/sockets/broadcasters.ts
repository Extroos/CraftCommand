import { Server } from 'socket.io';
import { processManager } from '../services/servers/ProcessManager';
import { installerService } from '../services/servers/InstallerService';
import { javaManager } from '../services/servers/JavaManager';
import { backupService } from '../services/backups/BackupService';
import { fileWatcherService } from '../services/files/FileWatcherService';

export const registerBroadcasters = (io: Server) => {
    // 1. Process Manager (Logs & Status)
    processManager.removeAllListeners('log');
    processManager.removeAllListeners('status');
    processManager.on('log', (data) => io.emit('log', data));
    processManager.on('status', (data) => io.emit('status', data));
    processManager.on('stats', (data) => io.emit('stats', data));
    processManager.on('player:join', (data) => io.emit('player:join', data));
    processManager.on('player:leave', (data) => io.emit('player:leave', data));

    // 2. Installer Service (Progress & Status)
    installerService.removeAllListeners('progress');
    installerService.removeAllListeners('status');
    installerService.on('progress', (data) => io.emit('install:progress', data));
    installerService.on('status', (data) => io.emit('install:status', { message: data }));

    // 3. Backup Service (Progress & Status)
    backupService.removeAllListeners('progress');
    backupService.removeAllListeners('status');
    backupService.on('progress', (data) => io.emit('backup:progress', data));
    backupService.on('status', (data) => io.emit('backup:status', { message: data }));

    // 4. File Watcher (Real-time file changes)
    fileWatcherService.removeAllListeners('fileChange');
    fileWatcherService.on('fileChange', (data) => io.emit('file:changed', data));

    // 5. Java Manager (Status updates during auto-download)
    javaManager.removeAllListeners('status');
    javaManager.removeAllListeners('progress');
    javaManager.removeAllListeners('error');
    javaManager.on('status', (data: any) => {
        io.emit('install:status', data); 
    });
    javaManager.on('progress', (data: any) => {
        io.emit('install:progress', data);
    });
    javaManager.on('error', (data: any) => {
        io.emit('install:error', data);
    });
};
