
import { Server, Socket } from 'socket.io';
import { processManager } from './services/ProcessManager';
import { installerService } from './services/InstallerService';
import { javaManager } from './services/JavaManager';
import { backupService } from './services/BackupService';
import { fileWatcherService } from './services/FileWatcherService';

export const setupSocket = (io: Server) => {
    
    // --- Global Event Broadcasters ---
    // These forward internal service events to all connected clients
    
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
    javaManager.on('status', (data: any) => {
        // Broadcast as a log or special status so console sees it
        // Choosing 'install:status' for toast feedback, plus 'log' for console visibility
        io.emit('install:status', data); 
        // Also emit as a system log to the active console if possible, but we don't have ID here easily.
        // For now, let's just use install:status which Dashboard/Console can pick up
    });



    io.on('connection', (socket: Socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);

        socket.on('disconnect', () => {
            console.log(`[Socket] Client disconnected: ${socket.id}`);
        });

        // Command handling
        socket.on('command', (data) => {
            if (!data.id && !data.serverId) return;
            const id = data.id || data.serverId; // Handle both naming conventions
            console.log(`[Socket] Command for ${id}: ${data.command}`);
            processManager.sendCommand(id, data.command);
        });
    });
};


