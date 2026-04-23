const { Rcon } = require('rcon-client');
import { logger } from '../utils/logger';

/**
 * RconService: Provides a persistent command path for orphaned Minecraft processes.
 */
export class RconService {
    private static sessions: Map<string, any> = new Map();

    public static async sendCommand(host: string, port: number, password: string, command: string): Promise<string> {
        const sessionKey = `${host}:${port}`;
        let client = this.sessions.get(sessionKey);

        try {
            if (!client || (client as any).writable === false) {
                client = await Rcon.connect({ host, port, password });
                this.sessions.set(sessionKey, client);
            }

            const response = await client.send(command);
            return response;
        } catch (err: any) {
            logger.error(`[RconService] Failed to send command to ${sessionKey}: ${err.message}`);
            this.sessions.delete(sessionKey);
            throw err;
        }
    }

    public static async closeAll() {
        for (const [key, client] of this.sessions.entries()) {
            try {
                await client.end();
            } catch (e) {}
            this.sessions.delete(key);
        }
    }
}
