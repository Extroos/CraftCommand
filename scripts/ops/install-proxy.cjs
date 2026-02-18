
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROXY_DIR = path.join(process.cwd(), 'proxy');
const PLAYIT_EXE = path.join(PROXY_DIR, 'playit.exe');
const PLAYIT_URL = 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64.exe';

if (!fs.existsSync(PROXY_DIR)) {
    fs.mkdirSync(PROXY_DIR, { recursive: true });
}

// Always remove 0-byte files
if (fs.existsSync(PLAYIT_EXE)) {
    const stats = fs.statSync(PLAYIT_EXE);
    if (stats.size < 1024) {
        console.log('[Install] Existing file appears corrupted (too small). Re-downloading...');
        fs.unlinkSync(PLAYIT_EXE);
    } else {
        console.log('[Info] Playit agent already installed.');
        process.exit(0);
    }
}

console.log('[Install] Downloading Playit Agent (via PowerShell)...');

try {
    // robust download
    execSync(`powershell -Command "Invoke-WebRequest -Uri '${PLAYIT_URL}' -OutFile '${PLAYIT_EXE}'"`, {
        stdio: 'inherit'
    });
    
    if (fs.existsSync(PLAYIT_EXE)) {
        console.log('[Success] Playit agent installed.');
    } else {
        console.error('[Error] File not found after download.');
        process.exit(1);
    }
} catch (e) {
    console.error('[Error] Download failed:', e.message);
    process.exit(1);
}
