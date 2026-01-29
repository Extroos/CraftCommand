const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../backend/data/settings.json');
const DATA_DIR = path.join(__dirname, '../backend/data');

const args = process.argv.slice(2);
const certPath = args[0];
const keyPath = args[1];
const passphrase = args[2] === "EMPTY" ? undefined : args[2];

// 1. Validation: Keys must exist
if (!certPath || !keyPath) {
    console.error('[Error] Missing Certificate or Key path.');
    process.exit(1);
}

// Strip quotes just in case
const cleanCert = certPath.replace(/"/g, '');
const cleanKey = keyPath.replace(/"/g, '');

if (!fs.existsSync(cleanCert)) {
    console.error(`[Error] Certificate file not found: ${cleanCert}`);
    process.exit(1);
}
if (!fs.existsSync(cleanKey)) {
    console.error(`[Error] Key file not found: ${cleanKey}`);
    process.exit(1);
}

try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Default Settings (Mirroring SystemSettingsService)
    const defaults = { 
        app: { theme: 'dark', autoUpdate: true, hostMode: true },
        discordBot: { enabled: false } 
    };

    let settings = { ...defaults };

    if (fs.existsSync(SETTINGS_PATH)) {
        const disk = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        
        // Deep Merge-ish (Only top level for now, assuming structure)
        settings = {
            ...defaults,
            ...disk,
            app: { ...defaults.app, ...(disk.app || {}) },
            discordBot: { ...defaults.discordBot, ...(disk.discordBot || {}) }
        };
    }

    // Update HTTPS Config
    settings.app.https = {
        enabled: true,
        certPath: cleanCert,
        keyPath: cleanKey,
        passphrase: passphrase
    };

    // Atomic-ish Write
    const tempPath = `${SETTINGS_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 4));
    fs.renameSync(tempPath, SETTINGS_PATH);

    console.log('[Success] HTTPS configuration validated and updated.');
    console.log('[Info] Certificate paths checked and settings merged.');
    console.log('[Info] Please restart the server for changes to take effect.');

} catch (e) {
    console.error('[Error] Failed to update settings:', e.message);
    process.exit(1);
}
