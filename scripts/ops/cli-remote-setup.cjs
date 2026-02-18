
const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const MODE = ARGS[0]; // vpn, proxy, direct

if (!MODE) {
    console.error('Usage: node cli-remote-setup.js <vpn|proxy|direct>');
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
        remoteAccess: {
            enabled: false,
            method: 'direct'
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
if (!settings.app.remoteAccess) settings.app.remoteAccess = {};

console.log(`[Config] Setting Remote Access Mode to: ${MODE.toUpperCase()}`);

settings.app.remoteAccess.enabled = true;
settings.app.remoteAccess.method = MODE;

// Save
try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 4));
    console.log('[Success] Configuration updated.');
} catch (e) {
    console.error('[Error] Failed to save settings:', e.message);
    process.exit(1);
}
