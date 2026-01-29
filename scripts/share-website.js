
import fs from 'fs';
import path from 'path';
import https from 'https';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const PROXY_DIR = path.join(__dirname, '../proxy');
const EXE_PATH = path.join(PROXY_DIR, 'cloudflared.exe');
// Official Cloudflare Download
const DOWNLOAD_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"; 

// --- 1. Downloader Logic (PowerShell Fallback) ---
async function ensureCloudflared() {
    if (!fs.existsSync(PROXY_DIR)) fs.mkdirSync(PROXY_DIR, { recursive: true });

    if (fs.existsSync(EXE_PATH)) {
        const stats = fs.statSync(EXE_PATH);
        // Cloudflared is ~16MB. If less than 10MB, it's likely corrupt.
        if (stats.size > 10000000) return true;
        console.log('[Cloudflare] Detecting corrupt file. Deleting...');
        fs.unlinkSync(EXE_PATH);
    }

    console.log('[Cloudflare] Downloading Cloudflare Tunnel (via PowerShell)...');
    
    return new Promise((resolve, reject) => {
        // Use PowerShell's Invoke-WebRequest which handles redirects/SSL natively and robustly
        const psCommand = `powershell -Command "Invoke-WebRequest -Uri '${DOWNLOAD_URL}' -OutFile '${EXE_PATH}'"`;
        
        const child = spawn(psCommand, { shell: true, stdio: 'inherit' });
        
        child.on('close', (code) => {
            if (code === 0) {
                 console.log('[Cloudflare] Download Complete.');
                 resolve(true);
            } else {
                 reject(new Error(`PowerShell download failed with code ${code}`));
            }
        });
        
        child.on('error', (err) => reject(err));
    });
}

// --- 2. Runner Logic ---
async function run() {
    try {
        await ensureCloudflared();
        
        console.log('\n[Cloudflare] Starting Quick Tunnel...');
        console.log('[Info] Note: This is for the WEBSITE (Dashboard) Only.');
        console.log('[Info] Generating your public link...\n');

        const tunnel = spawn(EXE_PATH, ['tunnel', '--url', 'http://localhost:3000'], {
            stdio: ['ignore', 'pipe', 'pipe'] // Pipe stderr because Cloudflare logging is there
        });

        tunnel.stderr.on('data', (data) => {
            const output = data.toString();
            // Cloudflare outputs URL like: https://<random>.trycloudflare.com
            // Regex to find it
            const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) {
                console.log('\n======================================================');
                console.log(' [SUCCESS] WEBSITE LINK READY');
                console.log('======================================================');
                console.log(` LINK:   ${match[0]}`);
                console.log('======================================================');
                console.log('\n[Important] KEEP THIS WINDOW OPEN.');
                console.log('            If you close this window, the link stops working.');
                console.log('\n[Tip] If the link says "DNS_PROBE_FINISHED_NXDOMAIN", wait 30 seconds.');
                console.log('      It takes a moment to travel around the world!\n');
            }
        });

        tunnel.on('exit', (code) => {
             console.log(`\n[Cloudflare] process exited with code ${code}.`);
             console.log('[Info] Tunnel closed. The link is now offline.');
        });
        
        tunnel.on('error', (err) => {
            console.error('[Error] Tunnel process failed to spawn:', err);
        });

    } catch (e) {
        console.error('[Error] Failed to start Cloudflare:', e.message);
    }
}

run();
