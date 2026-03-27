
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
    console.log("\x1b[36m%s\x1b[0m", "   CRAFTCOMMAND DEEP STABILITY AUDIT - v3.0 (STABILIZED)");
    console.log("\x1b[36m%s\x1b[0m", "====================================================================");
    console.log("");
    console.log("\x1b[90m This tool performs an exhaustive scan of your platform's health.\x1b[0m");
    console.log("\x1b[90m It verifies your environment (Java/Docker), data integrity, and\x1b[0m");
    console.log("\x1b[90m network connectivity to ensure production-level stability.\x1b[0m");
    console.log("");

    const issues: string[] = [];

    // --- 1. CORE RUNTIME & DOCKER ---
    console.log("\x1b[37m[1] CORE RUNTIME & ENVIRONMENT\x1b[0m");
    
    // Java Check
    try {
        const javaVer = execSync('java -version 2>&1', { encoding: 'utf8' });
        const verMatch = javaVer.match(/version "([^"]+)"/);
        const version = verMatch ? verMatch[1] : "Unknown";
        console.log(`  - Java Runtime:    [\x1b[32m${version}\x1b[0m]`);
        if (!version.startsWith('21') && !version.startsWith('25')) {
            issues.push(`WARNING: Java ${version} detected. Recommended: Java 21 or 25 LTS.`);
        }
    } catch (e) {
        console.log("  - Java Runtime:    [\x1b[31mMISSING\x1b[0m]");
        issues.push("CRITICAL: Java is not installed or not in PATH.");
    }

    // Docker Check
    try {
        const dockerVer = execSync('docker --version', { encoding: 'utf8' }).trim();
        let daemonOk = false;
        try {
            execSync('docker ps', { stdio: 'ignore' });
            daemonOk = true;
        } catch (e) {}
        
        console.log(`  - Docker Engine:   [\x1b[32m${dockerVer.split(' ')[2].replace(',', '')}\x1b[0m] (Daemon: ${daemonOk ? '\x1b[32mRUNNING\x1b[0m' : '\x1b[31mSTOPPED\x1b[0m'})`);
        if (!daemonOk) issues.push("WARNING: Docker daemon is not running. Containerized servers will fail to start.");
    } catch (e) {
        console.log("  - Docker Engine:   [\x1b[90mNOT INSTALLED\x1b[0m]");
    }
    console.log("");

    // --- 2. DATA INTEGRITY (FRAGMENTED) ---
    console.log("\x1b[37m[2] DATA & STORAGE INTEGRITY\x1b[0m");
    const settingsFile = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsFile)) {
        try {
            fs.readJsonSync(settingsFile);
            console.log("  - System Settings: [\x1b[32mVALID\x1b[0m]");
        } catch (e) {
            console.log("  - System Settings: [\x1b[31mCORRUPTED\x1b[0m]");
            issues.push("CRITICAL: settings.json is corrupted.");
        }
    }

    const serverDataDir = path.join(DATA_DIR, 'servers');
    if (fs.existsSync(serverDataDir)) {
        const files = fs.readdirSync(serverDataDir).filter(f => f.endsWith('.json'));
        let corrupted = 0;
        files.forEach(f => {
            try { fs.readJsonSync(path.join(serverDataDir, f)); }
            catch (e) { corrupted++; }
        });
        console.log(`  - Server Registry: [\x1b[32mFRAGMENTED\x1b[0m] (${files.length} active, ${corrupted} corrupted)`);
        if (corrupted > 0) issues.push(`CRITICAL: ${corrupted} server configuration files are corrupted!`);
    } else {
        const legacyFile = path.join(DATA_DIR, 'servers.json');
        if (fs.existsSync(legacyFile)) {
            console.log("  - Server Registry: [\x1b[33mLEGACY\x1b[0m]");
            issues.push("NOTICE: System is using legacy monolithic servers.json. Migration recommended.");
        } else {
            console.log("  - Server Registry: [\x1b[90mEMPTY\x1b[0m]");
        }
    }
    console.log("");

    // --- 3. SYSTEM CONNECTIVITY & HEALTH ---
    console.log("\x1b[37m[3] SERVICE CONNECTIVITY\x1b[0m");
    const bPort = 3001;
    const fPort = 3000;
    
    const bActive = await checkPort(bPort);
    const fActive = await checkPort(fPort);
    
    console.log(`  - Backend API:     [${bActive ? '\x1b[32mONLINE\x1b[0m' : '\x1b[90mOFFLINE\x1b[0m'}] (Port ${bPort})`);
    console.log(`  - Frontend Web:    [${fActive ? '\x1b[32mONLINE\x1b[0m' : '\x1b[90mOFFLINE\x1b[0m'}] (Port ${fPort})`);

    if (bActive) {
        try {
            const health = await axios.get(`http://127.0.0.1:${bPort}/api/system/health`, { timeout: 1000 });
            console.log(`  - API Response:    [\x1b[32m${health.status} OK\x1b[0m]`);
        } catch (e) {
            console.log(`  - API Response:    [\x1b[31mTIMEOUT/ERROR\x1b[0m]`);
            issues.push("WARNING: Backend API is reachable but not responding to health checks.");
        }
    }

    const hasNet = await checkInternet();
    console.log(`  - Internet Access: [${hasNet ? '\x1b[32mREACHABLE\x1b[0m' : '\x1b[31mOFFLINE\x1b[0m'}]`);
    
    if (fs.statfsSync) {
        const stats = fs.statfsSync(ROOT_DIR);
        const freeGb = (Number(stats.bfree * stats.bsize) / (1024**3)).toFixed(1);
        console.log(`  - Disk Storage:    [${freeGb} GB FREE]`);
        if (Number(freeGb) < 5) issues.push("WARNING: Low disk space detected (< 5GB).");
    }
    console.log("");

    // --- SUMMARY ---
    console.log("\x1b[36m%s\x1b[0m", "====================================================================");
    if (issues.length === 0) {
        console.log("\x1b[32m%s\x1b[0m", "   RESULT: SYSTEM IS STABLE");
        console.log("   Ready for production environment.");
    } else {
        console.log("\x1b[33m%s\x1b[0m", `   RESULT: ${issues.length} ADVISORY NOTICE(S)`);
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
