
const fs = require('fs-extra');
const path = require('path');

const file = path.join(__dirname, 'backend', 'data', 'servers.json');

async function clean() {
    if (!await fs.pathExists(file)) {
        console.log('No servers.json found.');
        return;
    }
    
    const servers = await fs.readJSON(file);
    let changed = false;
    
    servers.forEach(s => {
        if (s.securityConfig && s.securityConfig.tempOfflineOverride) {
            console.log(`Cleaning temp override for ${s.name}`);
            delete s.securityConfig.tempOfflineOverride;
            // Also reset onlineMode to true to force a re-detection
            s.onlineMode = true; 
            s.enforceSecureProfile = true;
            changed = true;
        }
        
        // Fix test server manually if needed
        if (s.name === 'test' && s.enforceSecureProfile !== true) {
             s.enforceSecureProfile = true;
             s.onlineMode = true;
             changed = true;
        }
    });
    
    if (changed) {
        await fs.writeJSON(file, servers, { spaces: 2 });
        console.log('Cleaned servers.json');
    } else {
        console.log('No cleanup needed.');
    }
}

clean();
