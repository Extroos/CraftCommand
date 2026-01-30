import selfsigned from 'selfsigned';
import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger';

const SSL_DIR = path.join(process.cwd(), 'data', 'ssl');

export const sslUtils = {
    /**
     * Ensures SSL certificates exist. If missing, generates a self-signed pair.
     * @returns { certPath: string, keyPath: string }
     */
    async getOrCreateCertificates(customCertPath?: string, customKeyPath?: string) {
        // If user provided custom paths, verify they exist
        if (customCertPath && customKeyPath) {
            const certExists = fs.existsSync(path.resolve(process.cwd(), customCertPath));
            const keyExists = fs.existsSync(path.resolve(process.cwd(), customKeyPath));
            
            if (certExists && keyExists) {
                return {
                    certPath: path.resolve(process.cwd(), customCertPath),
                    keyPath: path.resolve(process.cwd(), customKeyPath),
                    isSelfSigned: false
                };
            }
            logger.warn(`[SSL] Custom certificates not found at provided paths. Falling back to auto-generation.`);
        }

        // Default Auto-Generation Logic
        const certPath = path.join(SSL_DIR, 'cert.pem');
        const keyPath = path.join(SSL_DIR, 'key.pem');

        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            return { certPath, keyPath, isSelfSigned: true };
        }

        logger.info('[SSL] Generating self-signed certificates for Zero-Config HTTPS...');
        fs.ensureDirSync(SSL_DIR);

        const attrs = [{ name: 'commonName', value: 'craftcommand.local' }];
        const pems = selfsigned.generate(attrs, { days: 365 });

        fs.writeFileSync(certPath, pems.cert);
        fs.writeFileSync(keyPath, pems.private);

        logger.info(`[SSL] Certificates generated successfully at ${SSL_DIR}`);

        return { certPath, keyPath, isSelfSigned: true };
    }
};
