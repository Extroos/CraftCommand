
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// ==========================================
// CONFIGURATION
// ==========================================
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp_update');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups', 'updates');
const VERSION_FILE = path.join(PROJECT_ROOT, 'version.json');

// Paths to NEVER overwrite (relative to project root)
const PRESERVE_LIST = [
    'backend/data',
    'backend/minecraft_servers',
    'backend/servers', // Legacy support
    'backend/backups',
    'backend/logs',
    'backend/uploads',
    'backend/.env',
    '.env',
    'web/web_state.json',
    'run_CraftCommand.bat' // Don't overwrite the launcher itself to prevent lock issues
];

// Folders to fully replace (if they exist in update)
// "Safe" code folders that contain no user data
const REPLACE_TARGETS = [
    'backend/src',
    'backend/dist',
    'web/current'
];

// ANSI Colors
const C = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

// ==========================================
// MAIN LOGIC
// ==========================================
async function main() {
    console.log(`${C.cyan}╔════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.cyan}║   CraftCommand Safe System Updater     ║${C.reset}`);
    console.log(`${C.cyan}╚════════════════════════════════════════╝${C.reset}`);

    try {
        // 1. Pre-flight Checks
        checkPermissions();
        
        const currentVersion = require(VERSION_FILE).version;
        console.log(`${C.gray}Current Version: ${currentVersion}${C.reset}`);

        // 2. Check & Download
        console.log(`\n${C.yellow}[1/5] Checking for updates...${C.reset}`);
        const release = await getLatestRelease();
        
        if (!release) {
            console.log('No releases found.');
            return;
        }

        const remoteVersion = release.tag_name.replace('v', '');
        if (remoteVersion === currentVersion) {
            console.log(`${C.green}You are already on the latest version (v${currentVersion}).${C.reset}`);
            return;
        }

        console.log(`${C.green}New version found: v${remoteVersion}${C.reset}`);
        
        // Find asset
        const asset = release.assets.find(a => a.name.includes('bundle') || a.name.includes('release'));
        const downloadUrl = asset ? asset.browser_download_url : release.zipball_url;
        
        // Clean temp
        if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        fs.mkdirSync(TEMP_DIR, { recursive: true });

        const zipPath = path.join(TEMP_DIR, 'update.zip');
        console.log(`Downloading...`);
        await downloadFile(downloadUrl, zipPath);

        // 3. Extract
        console.log(`\n${C.yellow}[2/5] Extracting update...${C.reset}`);
        const extractPath = path.join(TEMP_DIR, 'extracted');
        fs.mkdirSync(extractPath);
        
        // Use PowerShell for reliable unzip on Windows
        execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`);
        
        // Handle zip structure (sometimes it's inside a subfolder like 'CraftCommands-v1.0.0/')
        let contentRoot = extractPath;
        const items = fs.readdirSync(extractPath);
        if (items.length === 1 && fs.statSync(path.join(extractPath, items[0])).isDirectory()) {
            contentRoot = path.join(extractPath, items[0]);
        }

        // 4. Backup
        console.log(`\n${C.yellow}[3/5] Creating safety backup...${C.reset}`);
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        
        const backupName = `backup-v${currentVersion}-${Date.now()}.zip`;
        const backupPath = path.join(BACKUP_DIR, backupName);
        
        // Compress current critical folders
        // We'll trust the user has their own full backups, but we snapshot code
        // For simplicity in this script, we'll skip complex zipping and just say:
        console.log(`${C.gray}Skipping full backup in this script iteration. Ensure you have backups!${C.reset}`);
        // TODO: Implement lightweight backup of 'backend/src' and 'web/current'

        // 5. Install (Smart Copy)
        console.log(`\n${C.yellow}[4/5] Installing updates...${C.reset}`);
        
        // Walk the new update and copy files
        copyRecursive(contentRoot, PROJECT_ROOT);

        // 6. Dependencies & Cleanup
        console.log(`\n${C.yellow}[5/5] Finalizing...${C.reset}`);
        
        // Check if package.json changed
        if (fs.existsSync(path.join(PROJECT_ROOT, 'backend', 'package.json'))) {
             console.log('Updating backend dependencies...');
             execSync('npm install --production', { cwd: path.join(PROJECT_ROOT, 'backend'), stdio: 'inherit' });
        }

        // Cleanup
        try {
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        } catch (e) {
            console.log(`${C.gray}Warning: Could not fully clean temp dir (file locked?)${C.reset}`);
        }

        console.log(`\n${C.green}SUCCESS! Updated to v${remoteVersion}${C.reset}`);
        console.log(`${C.cyan}Please restart the application.${C.reset}`);
        process.exit(0);

    } catch (e) {
        console.error(`\n${C.red}UPDATE FAILED${C.reset}`);
        console.error(e.message);
        console.error(e.stack);
        process.exit(1);
    }
}

// ==========================================
// HELPERS
// ==========================================

function checkPermissions() {
    try {
        fs.accessSync(PROJECT_ROOT, fs.constants.W_OK);
    } catch (e) {
        throw new Error(`No write permission to project root: ${PROJECT_ROOT}`);
    }
}

function getLatestRelease() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/Extroos/Craft-Commands/releases/latest',
            headers: { 'User-Agent': 'CraftCommand-Updater' }
        };
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) resolve(JSON.parse(data));
                else resolve(null);
            });
        }).on('error', reject);
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, { headers: { 'User-Agent': 'CraftCommand-Updater' } }, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

// The Core Logic: Smart Copy
function copyRecursive(src, dest, relativePath = '') {
    const exists = fs.existsSync(src);
    if (!exists) return;

    const stats = fs.statSync(src);
    
    // Check Preservation List
    // We match against "relativePath" which is like "backend/data/settings.json"
    // Normalize path separators
    const normalizedRel = relativePath.replace(/\\/g, '/');
    
    // 1. Direct Match Ignore (e.g., 'backend/data')
    if (PRESERVE_LIST.some(p => normalizedRel === p || normalizedRel.startsWith(p + '/'))) {
        // If it's a file that exists in destination, SKIP IT
        const destPath = path.join(dest, relativePath);
        if (fs.existsSync(destPath)) {
            // console.log(`${C.gray}Skipping preserved: ${normalizedRel}${C.reset}`);
            return; 
        }
        // If it doesn't exist in dest, we can copy it (it's new default config perhaps)
        // BUT strict preservation might say "never create default data if folder exists"
        // For now, "Preserve" means "Don't Overwrite".
    }

    if (stats.isDirectory()) {
        if (!fs.existsSync(path.join(dest, relativePath))) {
            fs.mkdirSync(path.join(dest, relativePath), { recursive: true });
        }
        
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursive(
                path.join(src, childItemName),
                dest,
                path.join(relativePath, childItemName)
            );
        });
    } else {
        // File Copy
        const destPath = path.join(dest, relativePath);
        
        // "REPLACE_TARGETS" Optimization
        // If we are in a folder that is meant to be fully replaced (like 'backend/src'),
        // we always overwrite.
        // The PRESERVE_LIST check above already protects data.
        
        fs.copyFileSync(src, destPath);
    }
}

main();
