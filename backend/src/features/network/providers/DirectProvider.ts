import { ConnectivityProvider } from './ConnectivityProvider';
import {  ConnectionStatus, ConnectivityMethod  } from '@shared/types';
import { logger } from '../../../utils/logger';

export class DirectProvider implements ConnectivityProvider {
    public id: ConnectivityMethod = 'direct';

    async connect(): Promise<ConnectionStatus> {
        logger.info('[DirectProvider] Connected (Passive mode - ensuring 0.0.0.0 bind)');
        return this.getStatus();
    }

    async disconnect(): Promise<void> {
        logger.info('[DirectProvider] Disconnected');
    }

    async getStatus(): Promise<ConnectionStatus> {
        return {
            enabled: true,
            method: 'direct',
            bindAddress: '0.0.0.0'
        };
    }
}
