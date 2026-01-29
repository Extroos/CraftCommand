import { JsonRepository } from './JsonRepository';
import { ServerConfig } from '../../../shared/types';

export class ServerRepository extends JsonRepository<ServerConfig> {
    constructor() {
        super('servers.json');
    }

    // Add any specific server queries here if needed
    public findByPort(port: number): ServerConfig | undefined {
        return this.data.find(s => s.port === port);
    }
}

export const serverRepository = new ServerRepository();
