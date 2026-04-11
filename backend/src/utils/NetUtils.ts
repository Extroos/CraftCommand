import net from 'net';
import https from 'https';
import si from 'systeminformation';
import { logger } from './logger';

export class NetUtils {

    /**
     * Checks if a specific port is currently in use.
     * @param port Although usually an integer, we support strings.
     * @param host Defaults to '127.0.0.1'
     * @returns True if port is busy, False if free.
     */
    static async checkPort(port: number, host = '127.0.0.1'): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(200); // Fast timeout for responsiveness
            socket.on('connect', () => { 
                socket.destroy(); 
                resolve(true); 
            });
            socket.on('error', (err: any) => { 
                socket.destroy(); 
                // ECONNREFUSED means nothing is listening, so it's free.
                // EADDRINUSE (rare on client connect) means it's busy.
                if (err.code === 'ECONNREFUSED') resolve(false);
                else resolve(false); // Assume free on other errors to avoid blocking excessively
            });
            socket.on('timeout', () => { 
                socket.destroy(); 
                resolve(false); // Timeout usually means firewall or free (no ACK)
            });
            socket.connect(port, host);
        });
    }

    /**
     * Advanced check that tries to bind a server to the port (TCP).
     * This is more reliable for checking "Can I start a server here?"
     */
    static async checkPortBind(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') return resolve(true);
                resolve(false);
            });
            server.once('listening', () => {
                server.close(() => resolve(false));
            });
            server.listen(port);
        });
    }

    /**
     * Bedrock-Specific: Checks if a UDP port is available by attempting to bind a dgram socket.
     */
    static async checkUDPPortBind(port: number): Promise<boolean> {
        const dgram = await import('dgram');
        return new Promise((resolve) => {
            const socket = dgram.createSocket('udp4');
            socket.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') return resolve(true);
                resolve(false);
            });
            socket.once('listening', () => {
                socket.close(() => resolve(false));
            });
            socket.bind(port);
        });
    }

    /**
     * Attempts to find and kill the process listening on a specific port.
     * SAFELY: Only kills known server processes (java, bedrock, etc).
     * @returns True if a process was found and killed, False otherwise.
     */
    static async killProcessOnPort(port: number): Promise<boolean> {
        try {
            const connections = await si.networkConnections();
            const portStr = port.toString();
            
            // Search TCP LISTEN and UDP states
            const listener = connections.find(c => 
                c.localPort === portStr && 
                (c.state === 'LISTEN' || c.protocol === 'udp' || c.state === 'UDP' || c.state === 'NONE')
            );
            
            if (listener && listener.pid) {
                // SAFETY CHECK: What is this process?
                const processes = await si.processes();
                const proc = processes.list.find(p => p.pid === listener.pid);
                
                if (proc) {
                    const name = proc.name.toLowerCase();
                    const cmd = proc.command.toLowerCase();
                    const SAFE_TO_KILL = ['java', 'javaw', 'bedrock_server', 'server', 'screen', 'tmux'];
                    
                    const isSafe = SAFE_TO_KILL.some(safe => name.includes(safe) || cmd.includes(safe));

                    if (!isSafe) {
                        logger.warn(`[NetUtils] Refusing to kill UNKNOWN process '${name}' (PID: ${listener.pid}) on port ${port}.`);
                        return false;
                    }

                    logger.warn(`[NetUtils] Killing ghost process '${name}' (PID: ${listener.pid}) on port ${port}`);
                    
                    // Windows Specific Stubborn Process Purging
                    if (process.platform === 'win32') {
                        try {
                            const { exec } = await import('child_process');
                            const util = await import('util');
                            const execAsync = util.promisify(exec);
                            await execAsync(`taskkill /F /PID ${listener.pid} /T`);
                            return true;
                        } catch (e) {
                            logger.error(`[NetUtils] taskkill failed: ${e.message}. Falling back to standard kill.`);
                        }
                    }

                    process.kill(listener.pid, 'SIGKILL');
                    return true;
                }
            }
        } catch (e) {
            logger.error(`[NetUtils] Failed to kill process on port ${port}: ${e}`);
        }
        return false;
    }

    /**
     * Identifies the name of the process running on a specific port.
     */
    static async identifyProcess(port: number): Promise<string | null> {
        try {
            const connections = await si.networkConnections();
            const listener = connections.find(c => (c.localPort === port.toString()) && (c.state === 'LISTEN'));
            if (listener && listener.pid) {
                const processes = await si.processes();
                const proc = processes.list.find(p => p.pid === listener.pid);
                return proc ? proc.name : null;
            }
        } catch (e) { return null; }
        return null;
    }

    /**
     * Active Health Check: Connects to the port to see if the service is responsive.
     * Different from checkPort (which checks if ANY process holds the port).
     * This checks if the service accepts connections.
     */
    static async checkServiceHealth(port: number, timeout = 2500): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(timeout);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('error', () => { socket.destroy(); resolve(false); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
            socket.connect(port, '127.0.0.1');
        });
    }

    /**
     * BEDROCK RAKNET QUERY: Fetches player count and latency from a Bedrock server using UDP.
     */
    static async queryBedrock(port: number, host = '127.0.0.1'): Promise<{ online: boolean, players: number, maxPlayers: number, ping: number, version: string } | null> {
        const dgram = await import('dgram');
        const client = dgram.createSocket('udp4');
        const start = Date.now();

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                client.close();
                resolve(null);
            }, 2000);

            client.on('message', (msg) => {
                if (msg[0] === 0x1c) { // ID_UNCONNECTED_PONG
                    clearTimeout(timeout);
                    client.close();
                    const latency = Date.now() - start;
                    
                    try {
                        // The string starts after the magic ID and headers at byte 35
                        const dataStr = msg.subarray(35).toString('utf8');
                        const parts = dataStr.split(';');
                        
                        resolve({
                            online: true,
                            players: parseInt(parts[4]) || 0,
                            maxPlayers: parseInt(parts[5]) || 0,
                            version: parts[3] || 'Unknown',
                            ping: latency
                        });
                    } catch (e) {
                        resolve({ online: true, players: 0, maxPlayers: 0, version: 'Unknown', ping: latency });
                    }
                }
            });

            // Craft RakNet Unconnected Ping
            const packet = Buffer.alloc(33);
            packet[0] = 0x01; // ID_UNCONNECTED_PING
            // Timestamp (8 bytes)
            packet.writeBigInt64BE(BigInt(Date.now()), 1);
            // Magic (16 bytes)
            Buffer.from('00ffff00fefefefefdfdfdfcaaaaaaaa', 'hex').copy(packet, 9);
            // Client GUID (8 bytes)
            packet.writeBigInt64BE(BigInt(Math.floor(Math.random() * 1000000)), 25);

            client.send(packet, port, host);
        });
    }

    /**
     * Retrieves the public IP address of the host machine using a 3rd-party service.
     */
    static async getPublicIP(): Promise<string> {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.ipify.org',
                port: 443,
                path: '/',
                method: 'GET',
                timeout: 5000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve(data.trim()));
            });

            req.on('error', (e) => reject(e));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Public IP check timed out'));
            });
            req.end();
        });
    }

    /**
     * Retrieves the local IPv4 address of the host machine.
     */
    static getLocalIP(): string {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    }
}
