import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';

// --- Cloud Backup Provider Interface ---
// Extensible provider pattern: add new cloud destinations by implementing this interface.

export interface CloudBackupDestination {
    type: 'local-copy' | 's3' | 'sftp';
    enabled: boolean;
    name: string;
    config: Record<string, any>;
}

export interface CloudUploadResult {
    destination: string;
    type: string;
    success: boolean;
    remotePath?: string;
    error?: string;
    durationMs: number;
}

export interface ICloudBackupProvider {
    type: string;
    name: string;
    upload(localFilePath: string, remoteFileName: string): Promise<CloudUploadResult>;
    testConnection(): Promise<{ success: boolean; message: string }>;
    listRemoteBackups(): Promise<Array<{ name: string; size: number; modified: string }>>;
    deleteRemote(remoteFileName: string): Promise<void>;
}

// --- Local Copy Provider ---
// Copies backups to a secondary local/network path (NAS, external drive, network share)

export class LocalCopyProvider implements ICloudBackupProvider {
    type = 'local-copy';
    name: string;
    private destPath: string;

    constructor(config: { name: string; destPath: string }) {
        this.name = config.name;
        this.destPath = config.destPath;
    }

    async upload(localFilePath: string, remoteFileName: string): Promise<CloudUploadResult> {
        const start = Date.now();
        const destFile = path.join(this.destPath, remoteFileName);

        try {
            await fs.ensureDir(this.destPath);
            await fs.copy(localFilePath, destFile);
            
            return {
                destination: this.name,
                type: this.type,
                success: true,
                remotePath: destFile,
                durationMs: Date.now() - start
            };
        } catch (e: any) {
            return {
                destination: this.name,
                type: this.type,
                success: false,
                error: e.message,
                durationMs: Date.now() - start
            };
        }
    }

    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            await fs.ensureDir(this.destPath);
            // Write and read a test file
            const testFile = path.join(this.destPath, '.craftcommand_test');
            await fs.writeFile(testFile, 'test');
            await fs.remove(testFile);
            return { success: true, message: `Path "${this.destPath}" is writable.` };
        } catch (e: any) {
            return { success: false, message: `Cannot write to "${this.destPath}": ${e.message}` };
        }
    }

    async listRemoteBackups(): Promise<Array<{ name: string; size: number; modified: string }>> {
        try {
            if (!(await fs.pathExists(this.destPath))) return [];
            const files = await fs.readdir(this.destPath);
            const results = [];
            for (const file of files) {
                if (!file.endsWith('.zip')) continue;
                const stats = await fs.stat(path.join(this.destPath, file));
                results.push({ name: file, size: stats.size, modified: stats.mtime.toISOString() });
            }
            return results;
        } catch {
            return [];
        }
    }

    async deleteRemote(remoteFileName: string): Promise<void> {
        await fs.remove(path.join(this.destPath, remoteFileName));
    }
}

// --- S3-Compatible Provider ---
// Works with AWS S3, MinIO, Backblaze B2, DigitalOcean Spaces, etc.

export class S3Provider implements ICloudBackupProvider {
    type = 's3';
    name: string;
    private endpoint: string;
    private bucket: string;
    private region: string;
    private accessKey: string;
    private secretKey: string;
    private prefix: string;

    constructor(config: {
        name: string;
        endpoint: string;
        bucket: string;
        region: string;
        accessKey: string;
        secretKey: string;
        prefix?: string;
    }) {
        this.name = config.name;
        this.endpoint = config.endpoint;
        this.bucket = config.bucket;
        this.region = config.region;
        this.accessKey = config.accessKey;
        this.secretKey = config.secretKey;
        this.prefix = config.prefix || 'craft-commands/';
    }

    async upload(localFilePath: string, remoteFileName: string): Promise<CloudUploadResult> {
        const start = Date.now();
        const remotePath = `${this.prefix}${remoteFileName}`;

        try {
            const fileSize = (await fs.stat(localFilePath)).size;
            logger.info(`[S3Provider] Upload queued: ${remotePath} (${(fileSize / 1024 / 1024).toFixed(1)}MB) → ${this.endpoint}/${this.bucket}`);

            let S3Client, PutObjectCommand;
            try {
                const sdk = require('@aws-sdk/client-s3');
                S3Client = sdk.S3Client;
                PutObjectCommand = sdk.PutObjectCommand;
            } catch (e) {
                throw new Error('DEPENDENCY_MISSING:@aws-sdk/client-s3');
            }

            const client = new S3Client({
                endpoint: this.endpoint.startsWith('http') ? this.endpoint : `https://${this.endpoint}`,
                region: this.region,
                credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
                forcePathStyle: true
            });

            // --- RETRY LOOP ---
            let attempts = 0;
            const maxAttempts = 3;
            while (attempts < maxAttempts) {
                try {
                    const fileStream = fs.createReadStream(localFilePath);
                    await client.send(new PutObjectCommand({
                        Bucket: this.bucket,
                        Key: remotePath,
                        Body: fileStream,
                        ContentType: 'application/zip'
                    }));
                    break;
                } catch (uploadError: any) {
                    attempts++;
                    if (attempts >= maxAttempts) throw uploadError;
                    const delay = Math.pow(2, attempts) * 1000 + (Math.random() * 1000);
                    logger.warn(`[S3Provider] Upload failed. Retrying in ${Math.round(delay)}ms... (${attempts}/${maxAttempts})`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }

            logger.success(`[S3Provider] Uploaded ${remotePath} successfully.`);
            return {
                destination: this.name,
                type: this.type,
                success: true,
                remotePath: `s3://${this.bucket}/${remotePath}`,
                durationMs: Date.now() - start
            };
        } catch (error: any) {
            if (error.message?.startsWith('DEPENDENCY_MISSING:')) {
                const lib = error.message.split(':')[1];
                logger.error(`[S3Provider] Missing dependency: ${lib}. Run 'npm install ${lib}' to enable S3 backups.`);
                return {
                    destination: this.name,
                    type: this.type,
                    success: false,
                    error: `Missing library: ${lib}`,
                    durationMs: Date.now() - start
                };
            }
            return {
                destination: this.name,
                type: this.type,
                success: false,
                error: error.message,
                durationMs: Date.now() - start
            };
        }
    }

    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            let S3Client, HeadBucketCommand;
            try {
                const sdk = require('@aws-sdk/client-s3');
                S3Client = sdk.S3Client;
                HeadBucketCommand = sdk.HeadBucketCommand;
            } catch (e) {
                return { success: false, message: 'S3 SDK not installed. Run: npm install @aws-sdk/client-s3' };
            }

            const client = new S3Client({
                endpoint: this.endpoint.startsWith('http') ? this.endpoint : `https://${this.endpoint}`,
                region: this.region,
                credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
                forcePathStyle: true
            });

            await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
            return { success: true, message: `Connected to bucket "${this.bucket}" at ${this.endpoint}` };
        } catch (e: any) {
            return { success: false, message: `S3 connection failed: ${e.message}` };
        }
    }

    async listRemoteBackups(): Promise<Array<{ name: string; size: number; modified: string }>> {
        try {
            let S3Client, ListObjectsV2Command;
            try {
                const sdk = require('@aws-sdk/client-s3');
                S3Client = sdk.S3Client;
                ListObjectsV2Command = sdk.ListObjectsV2Command;
            } catch (e) {
                logger.error('[S3Provider] SDK not found for listing backups.');
                return [];
            }

            const client = new S3Client({
                endpoint: this.endpoint.startsWith('http') ? this.endpoint : `https://${this.endpoint}`,
                region: this.region,
                credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
                forcePathStyle: true
            });

            const response = await client.send(new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: this.prefix
            }));

            return (response.Contents || []).map((obj: any) => ({
                name: obj.Key.replace(this.prefix, ''),
                size: obj.Size || 0,
                modified: obj.LastModified ? obj.LastModified.toISOString() : new Date().toISOString()
            }));
        } catch (e: any) {
            logger.error(`[S3Provider] Failed to list backups: ${e.message}`);
            return [];
        }
    }

    async deleteRemote(remoteFileName: string): Promise<void> {
        try {
            let S3Client, DeleteObjectCommand;
            try {
                const sdk = require('@aws-sdk/client-s3');
                S3Client = sdk.S3Client;
                DeleteObjectCommand = sdk.DeleteObjectCommand;
            } catch (e) {
                throw new Error('SDK_MISSING');
            }

            const client = new S3Client({
                endpoint: this.endpoint.startsWith('http') ? this.endpoint : `https://${this.endpoint}`,
                region: this.region,
                credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
                forcePathStyle: true
            });

            await client.send(new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: `${this.prefix}${remoteFileName}`
            }));
        } catch (e: any) {
            logger.error(`[S3Provider] Failed to delete remote file: ${e.message}`);
            throw e;
        }
    }
}

// --- SFTP Provider ---

export class SFTPProvider implements ICloudBackupProvider {
    type = 'sftp';
    name: string;
    private host: string;
    private port: number;
    private username: string;
    private password?: string;
    private privateKey?: string;
    private remotePath: string;

    constructor(config: {
        name: string;
        host: string;
        port?: number;
        username: string;
        password?: string;
        privateKey?: string;
        remotePath: string;
    }) {
        this.name = config.name;
        this.host = config.host;
        this.port = config.port || 22;
        this.username = config.username;
        this.password = config.password;
        this.privateKey = config.privateKey;
        this.remotePath = config.remotePath;
    }

    private getConnectionConfig() {
        const config: any = {
            host: this.host,
            port: this.port,
            username: this.username,
        };
        if (this.privateKey) config.privateKey = this.privateKey;
        else if (this.password) config.password = this.password;
        return config;
    }

    async upload(localFilePath: string, remoteFileName: string): Promise<CloudUploadResult> {
        const start = Date.now();
        const remoteFile = `${this.remotePath}/${remoteFileName}`;

        try {
            let SFTPClient;
            try {
                SFTPClient = require('ssh2-sftp-client');
            } catch (e) {
                throw new Error('DEPENDENCY_MISSING:ssh2-sftp-client');
            }

            const sftp = new SFTPClient();
            
            // --- RETRY LOOP ---
            let attempts = 0;
            const maxAttempts = 3;
            while (attempts < maxAttempts) {
                try {
                    await sftp.connect(this.getConnectionConfig());
                    await sftp.mkdir(this.remotePath, true);
                    await sftp.put(localFilePath, remoteFile);
                    await sftp.end();
                    break;
                } catch (connError: any) {
                    attempts++;
                    if (attempts >= maxAttempts) throw connError;
                    const delay = Math.pow(2, attempts) * 1000 + (Math.random() * 1000);
                    logger.warn(`[SFTPProvider] Transfer failed. Retrying in ${Math.round(delay)}ms... (${attempts}/${maxAttempts})`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }

            return {
                destination: this.name,
                type: this.type,
                success: true,
                remotePath: `sftp://${this.host}:${this.port}${remoteFile}`,
                durationMs: Date.now() - start
            };
        } catch (error: any) {
            if (error.message?.startsWith('DEPENDENCY_MISSING:')) {
                const lib = error.message.split(':')[1];
                logger.error(`[SFTPProvider] Missing dependency: ${lib}. Run 'npm install ${lib}' to enable SFTP backups.`);
                return {
                    destination: this.name,
                    type: this.type,
                    success: false,
                    error: `Missing library: ${lib}`,
                    durationMs: Date.now() - start
                };
            }
            return {
                destination: this.name,
                type: this.type,
                success: false,
                error: error.message,
                durationMs: Date.now() - start
            };
        }
    }

    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            const SFTPClient = require('ssh2-sftp-client');
            const sftp = new SFTPClient();
            await sftp.connect(this.getConnectionConfig());
            await sftp.end();
            return { success: true, message: `Connected to ${this.host}:${this.port}` };
        } catch (e: any) {
            if (e.code === 'MODULE_NOT_FOUND') {
                return { success: false, message: 'SFTP client not installed. Run: npm install ssh2-sftp-client' };
            }
            return { success: false, message: `SFTP connection failed: ${e.message}` };
        }
    }

    async listRemoteBackups(): Promise<Array<{ name: string; size: number; modified: string }>> {
        try {
            const SFTPClient = require('ssh2-sftp-client');
            const sftp = new SFTPClient();
            await sftp.connect(this.getConnectionConfig());
            const list = await sftp.list(this.remotePath);
            await sftp.end();
            return list
                .filter((f: any) => f.name.endsWith('.zip'))
                .map((f: any) => ({ name: f.name, size: f.size, modified: new Date(f.modifyTime).toISOString() }));
        } catch {
            return [];
        }
    }

    async deleteRemote(remoteFileName: string): Promise<void> {
        try {
            const SFTPClient = require('ssh2-sftp-client');
            const sftp = new SFTPClient();
            await sftp.connect(this.getConnectionConfig());
            await sftp.delete(`${this.remotePath}/${remoteFileName}`);
            await sftp.end();
        } catch (e: any) {
            logger.error(`[SFTPProvider] Failed to delete remote file: ${e.message}`);
            throw e;
        }
    }
}

// --- Provider Factory ---

export function createCloudProvider(destination: CloudBackupDestination): ICloudBackupProvider {
    switch (destination.type) {
        case 'local-copy':
            return new LocalCopyProvider({
                name: destination.name,
                destPath: destination.config.destPath
            });
        case 's3':
            return new S3Provider({
                name: destination.name,
                endpoint: destination.config.endpoint,
                bucket: destination.config.bucket,
                region: destination.config.region,
                accessKey: destination.config.accessKey,
                secretKey: destination.config.secretKey,
                prefix: destination.config.prefix
            });
        case 'sftp':
            return new SFTPProvider({
                name: destination.name,
                host: destination.config.host,
                port: destination.config.port,
                username: destination.config.username,
                password: destination.config.password,
                privateKey: destination.config.privateKey,
                remotePath: destination.config.remotePath
            });
        default:
            throw new Error(`Unknown cloud backup provider type: ${destination.type}`);
    }
}
