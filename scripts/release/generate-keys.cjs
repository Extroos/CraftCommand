const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.join(__dirname, '../../backend/keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'update_private_key.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'update_public_key.pem');

console.log('Generating Ed25519 Keypair for Update Signing...');

if (fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('ERROR: Private key already exists. Refusing to overwrite.');
    console.error(`Path: ${PRIVATE_KEY_PATH}`);
    process.exit(1);
}

// Ensure dir
if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
}

// Generate
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    modulusLength: 4096, // Not used for Ed25519 but standard option
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
    }
});

// Save
fs.writeFileSync(PRIVATE_KEY_PATH, privateKey);
fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);

console.log('✅ Keys generated successfully!');
console.log(`Private Key: ${PRIVATE_KEY_PATH} (KEEP SECURE!)`);
console.log(`Public Key:  ${PUBLIC_KEY_PATH} (Ship with backend)`);
