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
    sendCommand(id: string, command: string): Promise<void>;
    getStats(id: string): Promise<RunnerStats>;
    isRunning(id: string): boolean;
}
