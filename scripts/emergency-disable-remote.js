import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SETTINGS_PATH = path.join(__dirname, '../backend/data/settings.json');

console.log('[Emergency] Disabling Remote Access...');

try {
    if (fs.existsSync(SETTINGS_PATH)) {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        
        // Ensure app object exists
        if (!settings.app) settings.app = {};
        
        // Disable Remote Access
        if (settings.app.remoteAccess) {
            settings.app.remoteAccess.enabled = false;
            console.log('[Success] Remote Access flag set to FALSE.');
        } else {
            console.log('[Info] Remote Access was not enabled.');
        }

        // Force bind address reset via ensuring hostMode is safe? 
        // Actually, the Service reads the flag, so just setting false is enough.
        
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 4));
        console.log('[Success] Settings saved. Please restart the server.');
    } else {
        console.error('[Error] settings.json not found! Is the server installed?');
        process.exit(1);
    }
} catch (e) {
    console.error('[Fatal] Failed to write settings:', e.message);
    process.exit(1);
}
