
import os from 'os';
import net from 'net';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const DATA_DIR = path.join(BACKEND_DIR, 'data');

// --- UTILS ---

async function checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(800);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.connect(port, '127.0.0.1');
    });
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const netInterface = interfaces[name];
        if (netInterface) {
            for (const iface of netInterface) {
                if (iface.family === 'IPv4' && !iface.internal) return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

async function checkInternet(): Promise<boolean> {
    try {
        await axios.get('https://1.1.1.1', { timeout: 2000 });
        return true;
    } catch (e) {
        return false;
    }
}

// --- CHECKS ---

async function runAudit() {
    console.clear();
    console.log("\x1b[36m%s\x1b[0m", "====================================================================");
    console.log("\x1b[36m%s\x1b[0m", "   CRAFTCOMMAND DEEP STABILITY AUDIT - INTEGRATED SYSTEM ANALYSIS");
    console.log("\x1b[36m%s\x1b[0m", "====================================================================");
    console.log("");

    const issues: string[] = [];

    // --- 1. CONFIGURATION SCHEMA VALIDATION ---
    console.log("\x1b[37m[1] CONFIGURATION INTEGRITY\x1b[0m");
    const settingsFile = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsFile)) {
        try {
            const settings = fs.readJsonSync(settingsFile);
            const app = settings.app;
            
            let configOk = true;
            if (!app) { issues.push("CRITICAL: settings.json missing 'app' root object"); configOk = false; }
            else {
                if (typeof app.theme !== 'string') { issues.push("CONFIG: 'app.theme' should be a string"); configOk = false; }
                if (typeof app.hostMode !== 'boolean') { issues.push("CONFIG: 'app.hostMode' should be boolean"); configOk = false; }
                if (app.https && typeof app.https.enabled !== 'boolean') { issues.push("CONFIG: 'app.https.enabled' should be boolean"); configOk = false; }
            }
            console.log(`  - Settings Schema: [${configOk ? '\x1b[32mVALID\x1b[0m' : '\x1b[31mMALFORMED\x1b[0m'}]`);
        } catch (e) {
            console.log("  - Settings Schema: [\x1b[31mCORRUPTED\x1b[0m]");
            issues.push("CRITICAL: settings.json is not valid JSON.");
        }
    } else {
        console.log("  - Settings Schema: [\x1b[33mMISSING\x1b[0m]");
        // Not strictly an issue as backend regenerates it, but worth noting
    }

    const serversFile = path.join(DATA_DIR, 'servers.json');
    if (fs.existsSync(serversFile)) {
        try {
            const servers = fs.readJsonSync(serversFile);
            if (!Array.isArray(servers)) {
                issues.push("CRITICAL: servers.json must be an array");
                console.log("  - Server Registry: [\x1b[31mINVALID\x1b[0m]");
            } else {
                console.log(`  - Server Registry: [\x1b[32mVALID\x1b[0m] (${servers.length} entries)`);
            }
        } catch (e) {
            console.log("  - Server Registry: [\x1b[31mCORRUPTED\x1b[0m]");
            issues.push("CRITICAL: servers.json is corrupted.");
        }
    }
    console.log("");

    // --- 2. ENVIRONMENT SECURITY ---
    console.log("\x1b[37m[2] ENVIRONMENT SECURITY\x1b[0m");
    const envFile = path.join(ROOT_DIR, '.env');
    if (fs.existsSync(envFile)) {
        const envContent = fs.readFileSync(envFile, 'utf8');
        const hasSecret = envContent.includes('JWT_SECRET=');
        
        // Naive parsing for check
        let secretVal = '';
        envContent.split('\n').forEach(line => {
            if (line.startsWith('JWT_SECRET=')) secretVal = line.split('=')[1]?.trim();
        });

        if (!hasSecret || secretVal.length < 8) {
            console.log(`  - JWT Secret:      [\x1b[31mWEAK\x1b[0m]`);
            issues.push("SECURITY: JWT_SECRET in .env is missing or too short.");
        } else if (secretVal === 'change-me' || secretVal === 'stable-dev-secret-key-12345') {
            console.log(`  - JWT Secret:      [\x1b[33mDEFAULT\x1b[0m]`);
            issues.push("SECURITY: You are using a default/example JWT_SECRET. Please change it.");
        } else {
            console.log(`  - JWT Secret:      [\x1b[32mSECURE\x1b[0m]`);
        }
    } else {
        console.log(`  - Environment:     [\x1b[31mMISSING\x1b[0m]`);
        issues.push("CRITICAL: .env file is missing. System cannot start.");
    }
    console.log("");

    // --- 3. WEB ASSET VERIFICATION ---
    console.log("\x1b[37m[3] WEB ASSETS\x1b[0m");
    const distDir = path.join(FRONTEND_DIR, 'dist');
    const indexHtml = path.join(distDir, 'index.html');
    const assetsDir = path.join(distDir, 'assets');

    const distExists = fs.existsSync(distDir);
    const indexExists = fs.existsSync(indexHtml);
    const assetsExists = fs.existsSync(assetsDir);

    if (distExists && indexExists && assetsExists) {
        console.log(`  - Frontend Build:  [\x1b[32mREADY\x1b[0m]`);
    } else {
        console.log(`  - Frontend Build:  [\x1b[31mINCOMPLETE\x1b[0m]`);
        issues.push("ACTION REQUIRED: Frontend assets missing. Run 'npm run build' in /frontend, or use the launcher.");
    }
    console.log("");

    // --- 4. NETWORK & HEALTH ---
    console.log("\x1b[37m[4] SYSTEM CONNECTIVITY\x1b[0m");
    const ports = [
        { port: 3000, name: "Frontend" },
        { port: 3001, name: "Backend API" }
    ];
    for (const p of ports) {
        const inUse = await checkPort(p.port);
        console.log(`  - Port ${p.port} (${p.name}): [${inUse ? '\x1b[33mACTIVE\x1b[0m' : '\x1b[90mIDLE\x1b[0m'}]`);
    }

    const hasNet = await checkInternet();
    console.log(`  - Internet Access: [${hasNet ? '\x1b[32mONLINE\x1b[0m' : '\x1b[31mOFFLINE\x1b[0m'}]`);
    if (!hasNet) issues.push("WARNING: No internet access detected. Updates and remote features will fail.");

    try {
        const freeSpace = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
        // Very basic check - just looking for the current drive letter
        const drive = ROOT_DIR.split(path.sep)[0];
        const lines = freeSpace.split('\n').filter(l => l.trim() !== '');
        const currentDriveLine = lines.find(l => l.includes(drive));
        if (currentDriveLine) {
            // Caption FreeSpace Size
            // C:      1000      2000
            const parts = currentDriveLine.trim().split(/\s+/);
            // parts often: [Caption, FreeSpace, Size] or similar order depending on header
            // Default wmic order is usually Caption, FreeSpace, Size alphabetically? No.
            // Let's just warn if we can't parse or if it looks low
            // Actually, Node fs.statfs is available in newer node, checking that
             if (fs.statfsSync) {
                const stats = fs.statfsSync(ROOT_DIR);
                 const freeGb = (Number(stats.bfree * stats.bsize) / (1024**3)).toFixed(1);
                 console.log(`  - Disk Space:      [${freeGb} GB Free]`);
                 if (Number(freeGb) < 2) issues.push("WARNING: Low disk space (< 2GB).");
             }
        }
    } catch (e) {
        // Fallback or ignore if wmic fails
    }
     console.log("");

    // --- SUMMARY ---
    console.log("\x1b[36m%s\x1b[0m", "====================================================================");
    if (issues.length === 0) {
        console.log("\x1b[32m%s\x1b[0m", "   RESULT: SYSTEM IS STABLE");
        console.log("   No critical issues detected.");
    } else {
        console.log("\x1b[33m%s\x1b[0m", `   RESULT: ${issues.length} ISSUE(S) DETECTED`);
        console.log("");
        issues.forEach(msg => console.log(`   [!] ${msg}`));
    }
    console.log("\x1b[36m%s\x1b[0m", "====================================================================");
    console.log("");
    console.log("Press any key to return to menu...");
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(0));
}

runAudit().catch(e => {
    console.error("Audit failed:", e);
    process.exit(1);
});
