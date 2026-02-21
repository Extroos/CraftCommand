import { exec } from 'child_process';
import os from 'os';
import util from 'util';
import { NodeCapabilities } from './types';

const execAsync = util.promisify(exec);

/**
 * Detects the installed capabilities of the current node environment.
 */
export async function getCapabilities(): Promise<NodeCapabilities> {
    const caps: NodeCapabilities = {
        os: `${os.type()} ${os.release()}`,
        node: process.version
    };

    // 1. Check Java (try 'java -version')
    try {
        const { stderr } = await execAsync('java -version');
        // Java sends version info to stderr usually
        const output = stderr || ''; 
        const match = output.match(/version "([^"]+)"/i) || output.match(/version ([^ ]+)/i);
        if (match && match[1]) {
            caps.java = match[1];
        }
    } catch {
        // Java not found
    }

    // 2. Check Docker (try 'docker --version' or 'docker info')
    try {
        await execAsync('docker --version');
        caps.docker = true;
    } catch {
        caps.docker = false;
    }

    // 3. Check Git
    try {
        await execAsync('git --version');
        caps.git = true;
    } catch {
        caps.git = false;
    }

    return caps;
}
