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
    upload(localFilePath: string, remoteFileName: string, metadata: Record<string, any>): Promise<CloudUploadResult>;
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
// Uses the built-in Node.js https module for minimal dependency footprint.

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
            // S3 PUT via AWS SDK
            // This implementation uses @aws-sdk/client-s3 for reliable cloud storage.
            const fileSize = (await fs.stat(localFilePath)).size;
            
            logger.info(`[S3Provider] Upload queued: ${remotePath} (${(fileSize / 1024 / 1024).toFixed(1)}MB) → ${this.endpoint}/${this.bucket}`);

            // Use @aws-sdk/client-s3
            try {
                const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
                const client = new S3Client({
                    endpoint: this.endpoint.startsWith('http') ? this.endpoint : `https://${this.endpoint}`,
                    region: this.region,
                    credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
                    forcePathStyle: true
                });

                const fileStream = fs.createReadStream(localFilePath);
                await client.send(new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: remotePath,
                    Body: fileStream,
                    ContentType: 'application/zip'
                }));

                logger.success(`[S3Provider] Uploaded ${remotePath} successfully.`);
                return {
                    destination: this.name,
                    type: this.type,
                    success: true,
                    remotePath: `s3://${this.bucket}/${remotePath}`,
                    durationMs: Date.now() - start
                };
            } catch (sdkError: any) {
                if (sdkError.code === 'MODULE_NOT_FOUND') {
                    // Fallback for edge cases if somehow unlinked
                    logger.warn(`[S3Provider] AWS SDK not found in runtime. Ensure @aws-sdk/client-s3 is installed.`);
                    return {
                        destination: this.name,
                        type: this.type,
                        success: false,
                        error: 'S3 SDK required but not found in runtime.',
                        durationMs: Date.now() - start
                    };
                }
                throw sdkError;
            }
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
            const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
            const client = new S3Client({
                endpoint: this.endpoint.startsWith('http') ? this.endpoint : `https://${this.endpoint}`,
                region: this.region,
                credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
                forcePathStyle: true
            });
            await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
            return { success: true, message: `Connected to bucket "${this.bucket}" at ${this.endpoint}` };
        } catch (e: any) {
            if (e.code === 'MODULE_NOT_FOUND') {
                return { success: false, message: 'S3 SDK not installed. Run: npm install @aws-sdk/client-s3' };
            }
            return { success: false, message: `S3 connection failed: ${e.message}` };
        }
    }

    async listRemoteBackups(): Promise<Array<{ name: string; size: number; modified: string }>> {
        try {
            const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
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
                size: obj.Size,
                modified: obj.LastModified.toISOString()
            }));
        } catch {
            return [];
        }
    }

    async deleteRemote(remoteFileName: string): Promise<void> {
        const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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
    }
}

// --- SFTP Provider ---
// Uses ssh2-sftp-client for remote server backups

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
            const SFTPClient = require('ssh2-sftp-client');
            const sftp = new SFTPClient();
            await sftp.connect(this.getConnectionConfig());
            await sftp.mkdir(this.remotePath, true);
            await sftp.put(localFilePath, remoteFile);
            await sftp.end();

            return {
                destination: this.name,
                type: this.type,
                success: true,
                remotePath: `sftp://${this.host}:${this.port}${remoteFile}`,
                durationMs: Date.now() - start
            };
        } catch (e: any) {
            if (e.code === 'MODULE_NOT_FOUND') {
                return {
                    destination: this.name,
                    type: this.type,
                    success: false,
                    error: 'SFTP client not installed. Run: npm install ssh2-sftp-client',
                    durationMs: Date.now() - start
                };
            }
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
        const SFTPClient = require('ssh2-sftp-client');
        const sftp = new SFTPClient();
        await sftp.connect(this.getConnectionConfig());
        await sftp.delete(`${this.remotePath}/${remoteFileName}`);
        await sftp.end();
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
