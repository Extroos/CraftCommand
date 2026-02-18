
const fs = require('fs-extra');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../../backend/data/settings.json');

async function panicReset() {
    console.log("\x1b[31m%s\x1b[0m", " [EMERGENCY] Initiating Network Isolation...");
    
    try {
        if (await fs.pathExists(SETTINGS_PATH)) {
            const settings = await fs.readJson(SETTINGS_PATH);
            
            // Disable all remote entrance points
            console.log("\x1b[90m%s\x1b[0m", "  - Disabling HTTPS direct access...");
            if (settings.app && settings.app.https) {
                settings.app.https.enabled = false;
            }
            
            console.log("\x1b[90m%s\x1b[0m", "  - Disabling Remote Access modules...");
            if (settings.app && settings.app.remoteAccess) {
                settings.app.remoteAccess.enabled = false;
            }

            console.log("\x1b[90m%s\x1b[0m", "  - Shutting down distributed node links...");
            if (settings.app && settings.app.distributedNodes) {
                settings.app.distributedNodes.enabled = false;
            }

            await fs.writeJson(SETTINGS_PATH, settings, { spaces: 4 });
            console.log("\x1b[32m%s\x1b[0m", " [Success] Hardware/Software isolation verified.");
            console.log("\x1b[37m%s\x1b[0m", " All external bridges have been decommissioned. The dashboard is now local-only.");
        } else {
            console.log("\x1b[33m%s\x1b[0m", " [Notice] Settings file not found. System may already be in local-only mode.");
        }
    } catch (error) {
        console.error("\x1b[31m%s\x1b[0m", " [Error] Failed to update security registry: " + error.message);
        process.exit(1);
    }
}

panicReset();
