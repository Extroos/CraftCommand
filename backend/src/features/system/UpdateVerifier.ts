import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';

export interface UpdateManifest {
    version: string;
    buildDate: string;
    minFrontendVersion?: string; // Minimum frontend version required
    minAgentVersion?: string;    // Minimum agent version required
    files: { [filePath: string]: string }; // relative path -> sha256 hash
}

export class UpdateVerifier {
    private publicKey: string | null = null;
    private static KEY_PATH = path.join(process.cwd(), 'keys', 'update_public_key.pem');

    constructor() {
        this.loadPublicKey();
    }

    private loadPublicKey() {
        try {
            if (fs.existsSync(UpdateVerifier.KEY_PATH)) {
                this.publicKey = fs.readFileSync(UpdateVerifier.KEY_PATH, 'utf-8');
            } else {
                logger.warn('[UpdateVerifier] No public key found. Updates will fail verification.');
            }
        } catch (e: any) {
            logger.error(`[UpdateVerifier] Failed to load public key: ${e.message}`);
        }
    }

    /**
     * Verifies the signature of the manifest content.
     * @param manifestContent - The raw Buffer/string of the manifest.json file
     * @param signatureBase64 - The Ed25519 signature in Base64
     */
    public verifySignature(manifestContent: Buffer | string, signatureBase64: string): boolean {
        if (!this.publicKey) {
            logger.error('[UpdateVerifier] Cannot verify signature: Public key missing.');
            return false;
        }

        try {
            // For Ed25519, we don't use a hash algorithm like 'sha256'
            return crypto.verify(null, manifestContent instanceof Buffer ? manifestContent : Buffer.from(manifestContent), this.publicKey, Buffer.from(signatureBase64, 'base64'));
        } catch (e: any) {
            logger.error(`[UpdateVerifier] Signature verification error: ${e.message}`);
            return false;
        }
    }

    /**
     * Verifies the integrity of a file against its hash in the manifest.
     * @param filePath - Absolute path to the file
     * @param expectedHash - SHA256 hash from manifest
     */
    public async verifyFileIntegrity(filePath: string, expectedHash: string): Promise<boolean> {
        try {
            if (!fs.existsSync(filePath)) return false;

            const fileBuffer = await fs.readFile(filePath);
            const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

            return hash.toLowerCase() === expectedHash.toLowerCase();
        } catch (e) {
             return false;
        }
    }

    /**
     * Helper to parse manifest safely
     */
    public parseManifest(content: string): UpdateManifest {
        return JSON.parse(content) as UpdateManifest;
    }
}

export const updateVerifier = new UpdateVerifier();
