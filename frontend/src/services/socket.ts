
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

class SocketService {
    socket: Socket;

    constructor() {
        this.socket = io(SOCKET_URL, {
            autoConnect: false // We connect manually after auth
        });
    }

    connect() {
        if (this.socket.connected) return;
        
        const token = localStorage.getItem('cc_token');
        if (token) {
            this.socket.auth = { token };
        }
        
        this.socket.connect();
    }

    disconnect() {
        if (this.socket.connected) {
            this.socket.disconnect();
        }
    }

    onLog(callback: (data: { id: string, line: string, type: 'stdout'|'stderr'}) => void) {
        this.socket.on('log', callback);
        return () => this.socket.off('log', callback);
    }

    onStatus(callback: (data: { id: string, status: string }) => void) {
        this.socket.on('status', callback);
        return () => this.socket.off('status', callback);
    }

    onStats(callback: (data: { id: string, cpu: number, memory: number, pid: number, tps: string, uptime: number }) => void) {
        this.socket.on('stats', callback);
        return () => this.socket.off('stats', callback);
    }

    onPlayerJoin(callback: (data: { serverId: string, name: string, onlinePlayers: number }) => void) {
        this.socket.on('player:join', callback);
        return () => this.socket.off('player:join', callback);
    }

    onPlayerLeave(callback: (data: { serverId: string, name: string, onlinePlayers: number }) => void) {
        this.socket.on('player:leave', callback);
        return () => this.socket.off('player:leave', callback);
    }
    
    // Legacy off methods - now safely doing nothing or we can remove them
    offLog() { /* deprecated */ }
    offStatus() { /* deprecated */ }
    offStats() { /* deprecated */ }

    onBackupProgress(callback: (data: { serverId: string, percent: number, backupId: string }) => void) {
        this.socket.on('backup:progress', callback);
        return () => this.socket.off('backup:progress', callback);
    }

    onBackupStatus(callback: (data: { message: string }) => void) {
        this.socket.on('backup:status', callback);
        return () => this.socket.off('backup:status', callback);
    }

    onInstallStatus(callback: (data: { message: string, phase: string }) => void) {
        this.socket.on('install:status', callback);
        return () => this.socket.off('install:status', callback);
    }

    onInstallProgress(callback: (data: { phase: string, percent: number, message: string }) => void) {
        this.socket.on('install:progress', callback);
        return () => this.socket.off('install:progress', callback);
    }

    onInstallError(callback: (data: { message: string, phase: string }) => void) {
        this.socket.on('install:error', callback);
        return () => this.socket.off('install:error', callback);
    }
}


export const socketService = new SocketService();
