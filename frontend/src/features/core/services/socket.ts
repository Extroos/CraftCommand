
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';

class SocketService {
    socket: Socket;

    constructor() {
        this.socket = io(SOCKET_URL, {
            autoConnect: false,
            transports: ['websocket'], // Prevent 400 polling errors on fast restart
            reconnectionAttempts: 20,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
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

    // --- Server Room Management (Collaboration) ---

    joinServer(serverId: string, activeView: string = 'dashboard') {
        this.socket.emit('server:join', { serverId, activeView });
    }

    leaveServer(serverId: string) {
        this.socket.emit('server:leave', { serverId });
    }

    updateView(serverId: string, activeView: string) {
        this.socket.emit('server:view', { serverId, activeView });
    }

    // --- Core Server Events ---

    onLog(callback: (data: { id: string, line: string, type: 'stdout'|'stderr'}) => void) {
        this.socket.on('log', callback);
        return () => this.socket.off('log', callback);
    }

    onStatus(callback: (data: { id: string, status: string }) => void) {
        this.socket.on('status', callback);
        return () => this.socket.off('status', callback);
    }

    onStatusGlobal(callback: (data: { id: string, status: string }) => void) {
        this.socket.on('status:global', callback);
        return () => this.socket.off('status:global', callback);
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

    onPlayerActivity(callback: (data: { serverId: string, activity: any }) => void) {
        this.socket.on('player:activity', callback);
        return () => this.socket.off('player:activity', callback);
    }
    
    // Legacy off methods - now safely doing nothing or we can remove them
    offLog() { /* deprecated */ }
    offStatus() { /* deprecated */ }
    offStats() { /* deprecated */ }

    // --- Backup Events ---

    onBackupProgress(callback: (data: { serverId: string, percent: number, backupId: string }) => void) {
        this.socket.on('backup:progress', callback);
        return () => this.socket.off('backup:progress', callback);
    }

    onBackupStatus(callback: (data: { message: string }) => void) {
        this.socket.on('backup:status', callback);
        return () => this.socket.off('backup:status', callback);
    }

    // --- Install Events ---

    onInstallStatus(callback: (data: { message: string, phase: string }) => void) {
        this.socket.on('install:status', callback);
        return () => this.socket.off('install:status', callback);
    }

    onInstallProgress(callback: (data: { serverId?: string, phase: string, percent: number, message: string }) => void) {
        this.socket.on('install:progress', callback);
        return () => this.socket.off('install:progress', callback);
    }

    public onInstallError(callback: (data: { message: string, phase: string }) => void) {
        this.socket.on('server:install:error', callback);
        return () => this.socket.off('server:install:error', callback);
    }

    public onInstallComplete(callback: (data: { serverId: string }) => void) {
        this.socket.on('server:install:complete', callback);
        return () => this.socket.off('server:install:complete', callback);
    }

    // --- Collaboration Events ---

    onPresenceUpdate(callback: (data: { serverId: string, users: any[] }) => void) {
        this.socket.on('presence:update', callback);
        return () => this.socket.off('presence:update', callback);
    }

    onActivityNew(callback: (data: any) => void) {
        this.socket.on('activity:new', callback);
        return () => this.socket.off('activity:new', callback);
    }

    onChatMessage(callback: (data: any) => void) {
        this.socket.on('chat:message', callback);
        return () => this.socket.off('chat:message', callback);
    }

    onChatTyping(callback: (data: { userId: string, username: string }) => void) {
        this.socket.on('chat:typing', callback);
        return () => this.socket.off('chat:typing', callback);
    }

    onCollabError(callback: (data: { message: string }) => void) {
        this.socket.on('collab:error', callback);
        return () => this.socket.off('collab:error', callback);
    }

    onNodeStatus(callback: (data: { nodeId: string, status: string, node: any }) => void) {
        this.socket.on('node:status', callback);
        return () => this.socket.off('node:status', callback);
    }

    sendChatMessage(serverId: string, content: string) {
        this.socket.emit('chat:send', { serverId, content });
    }

    sendChatTyping(serverId: string) {
        this.socket.emit('chat:typing', { serverId });
    }
}


export const socketService = new SocketService();
