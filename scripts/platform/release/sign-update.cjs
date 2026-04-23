const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.join(__dirname, '../../backend/keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'update_private_key.pem');

const TARGET_FILE = process.argv[2];

if (!TARGET_FILE) {
    console.error('Usage: node sign-update.cjs <path-to-file>');
    process.exit(1);
}

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('ERROR: Private key not found. Run generate-keys.cjs first.');
    process.exit(1);
}

if (!fs.existsSync(TARGET_FILE)) {
    console.error(`ERROR: Target file not found: ${TARGET_FILE}`);
    process.exit(1);
}

console.log(`Signing ${path.basename(TARGET_FILE)}...`);

const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
const fileContent = fs.readFileSync(TARGET_FILE);

const signature = crypto.sign(null, fileContent, privateKey);
const signatureBase64 = signature.toString('base64');

const sigFilePath = TARGET_FILE + '.sig';
fs.writeFileSync(sigFilePath, signatureBase64);

console.log('✅ Signature generated!');
console.log(`File:      ${TARGET_FILE}`);
console.log(`Signature: ${sigFilePath}`);
