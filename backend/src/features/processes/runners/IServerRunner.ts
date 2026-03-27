import { EventEmitter } from 'events';

export interface RunnerStats {
    cpu: number;
    memory: number;
    pid?: number;
    containerId?: string;
    commandLine?: string;
}

export interface IServerRunner extends EventEmitter {
    start(id: string, runCommand: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void>;
    stop(id: string, force?: boolean): Promise<void>;
    kill(id: string, signal?: string): Promise<void>;
    sendCommand(id: string, command: string): Promise<void>;
    getStats(id: string): Promise<RunnerStats>;
    isRunning(id: string): boolean;
    createBackup(id: string, serverDir: string, options: { description?: string, worldOnly?: boolean, nodeId?: string }): Promise<any>;
    restoreBackup(id: string, serverDir: string, backupId: string, options: { scope?: 'full' | 'world' | 'configs' | 'plugins', worldOnly?: boolean, nodeId?: string }): Promise<void>;
    sync?(): Promise<void>; // Optional: Re-attach to existing processes after backend restart
}
