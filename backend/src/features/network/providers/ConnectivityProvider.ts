import {  ConnectionStatus, ConnectivityMethod  } from '@shared/types';

export interface ConnectivityProvider {
    id: ConnectivityMethod;
    connect(): Promise<ConnectionStatus>;
    disconnect(): Promise<void>;
    getStatus(): Promise<ConnectionStatus>;
}
