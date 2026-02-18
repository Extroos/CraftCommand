
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const PROXY_DIR = path.join(process.cwd(), 'proxy');
const CLOUDFLARED_EXE = path.join(PROXY_DIR, 'cloudflared.exe');
const CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

if (!fs.existsSync(PROXY_DIR)) {
    fs.mkdirSync(PROXY_DIR, { recursive: true });
}

async function downloadCloudflared() {
    if (fs.existsSync(CLOUDFLARED_EXE)) {
        const stats = fs.statSync(CLOUDFLARED_EXE);
        if (stats.size > 1024) return;
        fs.unlinkSync(CLOUDFLARED_EXE);
    }

    console.log('[Install] Downloading Cloudflare Tunnel (via PowerShell)...');
    execSync(`powershell -Command "Invoke-WebRequest -Uri '${CLOUDFLARED_URL}' -OutFile '${CLOUDFLARED_EXE}'"`, {
        stdio: 'inherit'
    });
}

(async () => {
    try {
        await downloadCloudflared();
        
        console.log('[Tunnel] Starting temporary tunnel...');
        console.log('[Info] This will expose your localhost:3000 to the internet.');
        
        const tunnel = spawn(CLOUDFLARED_EXE, ['tunnel', '--url', 'http://localhost:3000'], {
            stdio: 'inherit'
        });
        
        tunnel.on('close', (code) => {
            console.log(`[Tunnel] Process exited with code ${code}`);
        });

    } catch (e) {
        console.error('[Error]', e.message);
    }
})();
