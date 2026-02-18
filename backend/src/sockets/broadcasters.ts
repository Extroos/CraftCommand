import { Server } from 'socket.io';
import { processManager } from '../features/processes/ProcessManager';
import { installerService } from '../features/installer/InstallerService';
import { javaManager } from '../features/processes/JavaManager';
import { backupService } from '../features/backups/BackupService';
import { fileWatcherService } from '../features/files/FileWatcherService';
import { nodeRegistryService } from '../features/nodes/NodeRegistryService';
import { networkFabricService } from '../features/network/NetworkFabricService';
import { logger } from '../utils/logger';

let isRegistered = false;

export const registerBroadcasters = (io: Server) => {
    if (isRegistered) {
        logger.warn('[Broadcasters] Already registered. Skipping to prevent duplicate listeners.');
        return;
    }
    isRegistered = true;

    // 1. Process Manager — SCOPED to server rooms

    processManager.on('log', (data) => {
        io.to(`server:${data.id}`).emit('log', data);
    });
    processManager.on('status', (data) => {
        // Status is broadcast to server room AND globally (for dashboard overview)
        io.to(`server:${data.id}`).emit('status', data);
        io.emit('status:global', data);
    });
    processManager.on('stats', (data) => {
        io.to(`server:${data.id}`).emit('stats', data);
    });
    processManager.on('player:join', (data) => {
        io.to(`server:${data.serverId || data.id}`).emit('player:join', data);
    });
    processManager.on('player:leave', (data) => {
        io.to(`server:${data.serverId || data.id}`).emit('player:leave', data);
    });

    // 2. Installer Service (Global — affects full panel)
    installerService.removeAllListeners('progress');
    installerService.removeAllListeners('status');
    installerService.on('progress', (data) => io.emit('install:progress', data));
    installerService.on('status', (data) => {
        io.emit('install:status', { message: data });
        // Pipe installer status to logs for detailed feedback in ProgressOverlay
        // If data contains a serverId (from onProgress), we use it, otherwise 'java-install'
        const serverId = (data as any).serverId || 'java-install';
        io.emit('log', { id: serverId, line: `[INSTALLER] ${data}` });
    });

    // 3. Backup Service (Global — could be scoped later)
    backupService.removeAllListeners('progress');
    backupService.removeAllListeners('status');
    backupService.on('progress', (data) => io.emit('backup:progress', data));
    backupService.on('status', (data) => io.emit('backup:status', { message: data }));

    // 4. File Watcher (Global — file changes)
    fileWatcherService.removeAllListeners('fileChange');
    fileWatcherService.on('fileChange', (data) => io.emit('file:changed', data));

    // 5. Java Manager (Global — affects full panel)
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

    // 6. Node Registry (Global — status updates)
    nodeRegistryService.removeAllListeners('status');
    nodeRegistryService.on('status', (data: any) => {
        io.emit('node:status', data);
    });

    // 7. Network Fabric (Self-managed proxy automation)
    networkFabricService.initialize();
};
