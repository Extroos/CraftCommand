import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { logger } from './logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * BinaryProvisioner (v1.14.0)
 * Handles automated downloading of required sidecar binaries (Cloudflare, Playit, etc.)
 */
export class BinaryProvisioner {
    private static readonly BIN_ROOT = path.join(process.cwd(), 'bin', 'networking');
    private static readonly PROXY_ROOT = path.join(process.cwd(), 'proxy');

    private static readonly URLS = {
        cloudflare: {
            'win32-x64': 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
            'linux-x64': 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
            'linux-arm64': 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64',
            'darwin-x64': 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz',
            'darwin-arm64': 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz'
        },
        playit: {
            'win32-x64': 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-amd64.exe',
            'linux-x64': 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64',
            'linux-arm64': 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-arm64',
            'darwin-x64': 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-macos-amd64',
            'darwin-arm64': 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-macos-arm64'
        }
    };

    /**
     * Ensures a binary is available locally. Downloads if missing.
     * @returns The absolute path to the ready-to-use binary
     */
    public async ensureBinary(type: 'cloudflare' | 'playit'): Promise<string> {
        const platform = process.platform;
        const arch = process.arch;
        const key = `${platform}-${arch}` as keyof typeof BinaryProvisioner.URLS.cloudflare;

        const binName = platform === 'win32' ? `${type}.exe` : type;
        const binPath = path.join(BinaryProvisioner.BIN_ROOT, binName);

        // 1. Check if already exists
        if (await fs.pathExists(binPath)) {
            return binPath;
        }

        // 2. Resolve URL
        const urlMap: any = BinaryProvisioner.URLS[type];
        const url = urlMap[key] || urlMap[`${platform}-x64`]; // Fallback to x64

        if (!url) {
            throw new Error(`Unsupported platform for ${type}: ${platform}-${arch}`);
        }

        // 3. Download
        await fs.ensureDir(BinaryProvisioner.BIN_ROOT);
        logger.info(`[BinaryProvisioner] Downloading ${type} binary for ${platform}-${arch}...`);
        
        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream'
            });

            const tempPath = binPath + '.tmp';
            const writer = fs.createWriteStream(tempPath);

            // TypeScript safety: cast to any for stream piping
            (response.data as any).pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
            });

            // 4. Post-processing (Extraction for tarballs, chmod for linux)
            if (url.endsWith('.tgz') || url.endsWith('.tar.gz')) {
                logger.info(`[BinaryProvisioner] Extracting ${type} archive...`);
                // Use system tar for simplicity and speed
                await execAsync(`tar -xzf "${tempPath}" -C "${BinaryProvisioner.BIN_ROOT}"`);
                await fs.remove(tempPath);
                
                // Cloudflare tarball usually contains the binary directly, but might be named differently
                if (type === 'cloudflare') {
                    const files = await fs.readdir(BinaryProvisioner.BIN_ROOT);
                    const cfFile = files.find(f => f.startsWith('cloudflared'));
                    if (cfFile && cfFile !== binName) {
                        await fs.move(path.join(BinaryProvisioner.BIN_ROOT, cfFile), binPath, { overwrite: true });
                    }
                }
            } else {
                await fs.move(tempPath, binPath, { overwrite: true });
            }

            // 5. Chmod +x
            if (platform !== 'win32') {
                await fs.chmod(binPath, 0o755);
            }

            logger.info(`[BinaryProvisioner] ${type} binary provisioned successfully.`);
            return binPath;

        } catch (err: any) {
            logger.error(`[BinaryProvisioner] Failed to provision ${type}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Helper to get path without downloading (checks environment first)
     */
    public async getBinaryPath(type: 'cloudflare' | 'playit'): Promise<string> {
        const binName = process.platform === 'win32' ? `${type}.exe` : type;
        
        // 1. Check existing proxy folder (First Priority)
        const proxyPath = path.join(BinaryProvisioner.PROXY_ROOT, binName);
        if (await fs.pathExists(proxyPath)) {
            return proxyPath;
        }

        // 2. Check if it's already in the OS Path (Second Priority)
        try {
            const cmd = process.platform === 'win32' ? `where ${type}` : `which ${type}`;
            const { stdout } = await execAsync(cmd);
            const systemPath = stdout.split('\n')[0].trim();
            if (systemPath && await fs.pathExists(systemPath)) {
                return systemPath;
            }
        } catch (e) {}

        // 3. Local check / download (Third Priority)
        return this.ensureBinary(type);
    }
}

export const binaryProvisioner = new BinaryProvisioner();
