import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const SETTINGS_PATH = path.join(__dirname, '../backend/data/settings.json');
const DATA_DIR = path.join(__dirname, '../backend/data');

// Get Arguments
const args = process.argv.slice(2);
const method = args[0]; // 'vpn', 'proxy', 'direct'

// --- Helper: Get Local IP ---
function getLocalExternalIP() {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip internal (i.e. 127.0.0.1) and non-ipv4
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1'; // Fallback
}

// --- Validation ---
const VALID_METHODS = ['vpn', 'proxy', 'direct'];
if (!VALID_METHODS.includes(method)) {
    console.error(`[Error] Invalid method: ${method}`);
    console.log(`Allowed: ${VALID_METHODS.join(', ')}`);
    process.exit(1);
}

try {
    // 1. Ensure Data Dir Exists
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // 2. Load Settings (or create defaults)
    const defaults = { 
        app: { theme: 'dark', autoUpdate: true, hostMode: true, remoteAccess: { enabled: false } }, 
        discordBot: { enabled: false } 
    };

    let settings = { ...defaults };
    if (fs.existsSync(SETTINGS_PATH)) {
        try {
            const diskSettings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
            // Deep merge app object specifically
            settings = {
                ...defaults,
                ...diskSettings,
                app: { ...defaults.app, ...(diskSettings.app || {}) }
            };
        } catch (e) {
            console.error('[Warning] Corrupt settings.json, resetting.');
        }
    }

    // 3. Update Settings
    settings.app.remoteAccess = {
        enabled: true,
        method: method
    };

    // 4. Write Back (Atomic)
    const tempPath = `${SETTINGS_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 4));
    fs.renameSync(tempPath, SETTINGS_PATH);

    // 5. Output Connection Info
    const localIP = getLocalExternalIP();
    console.log('\n[Success] Remote Access Configured!');
    console.log('------------------------------------------------');
    
    if (method === 'vpn') {
        console.log('Method: Mesh VPN (Tailscale/ZeroTier)');
        console.log(`Your Party IP: ${localIP} (Usually)`);
        console.log('Ensure you and your friends are in the SAME VPN network.');
    } else if (method === 'proxy') {
        console.log('Method: Reverse Proxy');
        console.log('Status: Ready for Proxy Agent');
        console.log('Action: Run your proxy tool (e.g., playit.gg) now.');
    } else if (method === 'direct') {
        console.log('Method: Direct Port Forwarding');
        console.log(`Local IP: ${localIP}`);
        console.log('Action: Forward port 3000 (TCP) in your Router.');
        console.log('Warning: Ensure your firewall allows Node.js.');
    }
    console.log('------------------------------------------------\n');

} catch (e) {
    console.error('[Fatal] Failed to update settings:', e.message);
    process.exit(1);
}
