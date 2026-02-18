
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROXY_DIR = path.join(process.cwd(), 'proxy');
const CADDY_EXE = path.join(PROXY_DIR, 'caddy.exe');
const CADDY_ZIP = path.join(PROXY_DIR, 'caddy.zip');

// Stable release - more reliable than dynamic API
const CADDY_VERSION = '2.8.4';
const CADDY_URL = `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_windows_amd64.zip`;

if (!fs.existsSync(PROXY_DIR)) {
    fs.mkdirSync(PROXY_DIR, { recursive: true });
}

// Force re-download if corrupt
if (fs.existsSync(CADDY_EXE)) {
    try {
        execSync(`"${CADDY_EXE}" version`, { stdio: 'ignore' });
        console.log('[Info] Caddy is already installed and working.');
        process.exit(0);
    } catch (e) {
        console.log('[Install] Existing Caddy binary is corrupt. Re-installing...');
        try { fs.unlinkSync(CADDY_EXE); } catch (e) {}
    }
}

console.log(`[Install] Downloading Caddy v${CADDY_VERSION} from GitHub...`);

try {
    // 1. Download ZIP
    execSync(`powershell -Command "Invoke-WebRequest -Uri '${CADDY_URL}' -OutFile '${CADDY_ZIP}'"`, {
        stdio: 'inherit'
    });

    if (!fs.existsSync(CADDY_ZIP)) {
        throw new Error('Download failed - ZIP file missing.');
    }

    // 2. Extract ZIP
    console.log('[Install] Extracting caddy.exe...');
    execSync(`powershell -Command "Expand-Archive -Path '${CADDY_ZIP}' -DestinationPath '${PROXY_DIR}' -Force"`, {
        stdio: 'inherit'
    });

    // 3. Cleanup
    if (fs.existsSync(CADDY_ZIP)) {
        fs.unlinkSync(CADDY_ZIP);
    }
    
    // 4. Verify
    if (fs.existsSync(CADDY_EXE)) {
        execSync(`"${CADDY_EXE}" version`, { stdio: 'inherit' });
        console.log('[Success] Caddy installed successfully.');
    } else {
        console.error('[Error] caddy.exe not found after extraction.');
        process.exit(1);
    }

} catch (e) {
    console.error('[Error] Installation failed:', e.message);
    process.exit(1);
}
