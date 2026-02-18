
const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const ACTION = ARGS[0];
const DOMAIN = ARGS[1];

if (!ACTION) {
    console.error('Usage: node manage-caddy.js <setup|disable> [domain]');
    process.exit(1);
}

const DATA_DIR = path.join(process.cwd(), 'backend', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PROXY_DIR = path.join(process.cwd(), 'proxy');
const CADDY_FILE = path.join(PROXY_DIR, 'Caddyfile');

// Helper to read/write settings
function updateSettings(updater) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    
    let settings = { app: { https: {} } };
    if (fs.existsSync(SETTINGS_FILE)) {
        try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) {}
    }
    
    if (!settings.app) settings.app = {};
    if (!settings.app.https) settings.app.https = {};
    
    updater(settings);
    
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 4));
}

if (ACTION === 'disable') {
    updateSettings(s => {
        s.app.https.enabled = false;
    });
    console.log('[Info] HTTPS disabled in settings.');
    // Optionally delete Caddyfile
    if (fs.existsSync(CADDY_FILE)) fs.unlinkSync(CADDY_FILE);
    
} else if (ACTION === 'setup') {
    if (!DOMAIN) {
        console.error('[Error] Domain required for setup.');
        process.exit(1);
    }
    
    // Sanitize Domain: Prevent port 3000 conflict
    let cleanDomain = DOMAIN;
    if (cleanDomain.includes(':3000')) {
        console.log('[Warning] Detected port 3000 in domain. Stripping to prevent conflict with frontend.');
        cleanDomain = cleanDomain.replace(':3000', '');
    }
    
    // Validation: Block incompatible domains
    if (cleanDomain.endsWith('.trycloudflare.com') || cleanDomain.endsWith('.playit.gg')) {
        console.error('\n[Error] Invalid domain for Caddy.');
        console.error(`  You cannot use '${cleanDomain}' with Caddy because you don't own it.`);
        console.error('  - Cloudflare Tunnels provide their own HTTPS automatically.');
        console.error('  - Playit.gg handles its own connection.');
        console.error('\n  > Solution: Use Option 3 (Remote Access) -> 3 (Web Share) instead.');
        process.exit(1);
    }

    // Generate Caddyfile
    const caddyConfig = `${cleanDomain} {
    reverse_proxy localhost:3000
    
    handle /api/* {
        reverse_proxy localhost:3000
    }
    
    handle /socket.io/* {
        reverse_proxy localhost:3000
    }
    
    header {
        Strict-Transport-Security "max-age=31536000;"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }
}`;
    
    if (!fs.existsSync(PROXY_DIR)) fs.mkdirSync(PROXY_DIR, { recursive: true });
    fs.writeFileSync(CADDY_FILE, caddyConfig);
    console.log(`[Success] Caddyfile generated for ${DOMAIN}`);
    
    // Update Settings
    updateSettings(s => {
        s.app.https.enabled = true;
        s.app.https.mode = 'bridge';
        s.app.https.domain = cleanDomain;
    });
    console.log('[Success] Settings updated for Caddy HTTPS.');

} else {
    console.error('Unknown action:', ACTION);
    process.exit(1);
}
