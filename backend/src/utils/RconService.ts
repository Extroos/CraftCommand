import { RCON } from 'minecraft-server-util';
import { logger } from '../utils/logger';

/**
 * RconService: Provides a persistent command path for orphaned Minecraft processes.
 * When the panel restarts and loses the original stdin pipe, RCON becomes the primary
 * channel for console management.
 */
export class RconService {
    private static sessions: Map<string, RCON> = new Map();

    /**
     * Sends a command to a Minecraft server via RCON.
     */
    public static async sendCommand(host: string, port: number, password: string, command: string): Promise<string> {
        const sessionKey = `${host}:${port}`;
        let client = this.sessions.get(sessionKey);

        try {
            if (!client) {
                client = new RCON();
                await client.connect(host, port);
                await client.login(password);
                this.sessions.set(sessionKey, client);
            }

            const response = await client.execute(command);
            return response;
        } catch (err: any) {
            logger.error(`[RconService] Failed to send command to ${sessionKey}: ${err.message}`);
            this.sessions.delete(sessionKey); // Clear session to force reconnect next time
            throw err;
        }
    }

    /**
     * Closes all active RCON sessions.
     */
    public static async closeAll() {
        for (const [key, client] of this.sessions.entries()) {
            client.close();
            this.sessions.delete(key);
        }
    }
}
