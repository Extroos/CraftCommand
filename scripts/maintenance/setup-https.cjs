
const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const CERT_PATH = ARGS[0];
const KEY_PATH = ARGS[1];
const PASSPHRASE = ARGS[2];

if (!CERT_PATH || !KEY_PATH) {
    console.error('Usage: node setup-https.js <cert> <key> [passphrase]');
    process.exit(1);
}

const DATA_DIR = path.join(process.cwd(), 'backend', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let settings = {
    app: {
        https: {
            enabled: false,
            mode: 'native',
            keyPath: '',
            certPath: ''
        }
    }
};

if (fs.existsSync(SETTINGS_FILE)) {
    try {
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
        console.error('Failed to parse settings.json, creating new.');
    }
}

// Ensure structure
if (!settings.app) settings.app = {};
if (!settings.app.https) settings.app.https = {};

console.log(`[Config] Binding Manual Certificate...`);
console.log(`  Cert: ${CERT_PATH}`);
console.log(`  Key:  ${KEY_PATH}`);

settings.app.https.enabled = true;
settings.app.https.mode = 'native';
settings.app.https.certPath = CERT_PATH;
settings.app.https.keyPath = KEY_PATH;
if (PASSPHRASE) {
    settings.app.https.passphrase = PASSPHRASE;
}

// Save
try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 4));
    console.log('[Success] HTTPS configuration updated.');
} catch (e) {
    console.error('[Error] Failed to save settings:', e.message);
    process.exit(1);
}
