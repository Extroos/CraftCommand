
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('CraftCommand Web Asset Sync');
console.log('---------------------------');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const distDir = path.join(frontendDir, 'dist');

const FLAG_FILE = path.join(rootDir, 'update_applied.flag');
const webCurrentDir = path.join(rootDir, 'web', 'current');

// Check if we need to force build due to update
const forceBuild = fs.existsSync(FLAG_FILE) || process.argv.includes('--force');

if (!fs.existsSync(distDir) || forceBuild) {
    if (forceBuild) {
        console.log('[Info] Update detected. Performing clean build...');
    } else {
        console.log('[Info] Frontend build not found. Building assets...');
    }

    try {
        // Run build in frontend
        execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
        console.log('[Success] Assets built successfully.');
    } catch (e) {
        console.error('[Error] Failed to build frontend assets:', e.message);
        process.exit(1);
    }
} else {
    console.log('[Info] Frontend assets already exist.');
}

// Sync to web/current
console.log('[Info] Syncing assets to ' + webCurrentDir);
if (!fs.existsSync(webCurrentDir)) {
    fs.mkdirSync(webCurrentDir, { recursive: true });
}

// Simple copy for local stability
// In a real scenario, use fs-extra emptyDir + copy
try {
    // Clean current
    const files = fs.readdirSync(webCurrentDir);
    for (const file of files) {
        fs.rmSync(path.join(webCurrentDir, file), { recursive: true, force: true });
    }

    // Copy from dist
    const distFiles = fs.readdirSync(distDir);
    for (const file of distFiles) {
        const src = path.join(distDir, file);
        const dest = path.join(webCurrentDir, file);
        
        // Use PowerShell for recursive copy on Windows if it's a directory
        if (fs.statSync(src).isDirectory()) {
            execSync(`powershell -command "Copy-Item -Path '${src}' -Destination '${dest}' -Recurse -Force"`);
        } else {
            fs.copyFileSync(src, dest);
        }
    }
    console.log('[Success] Web assets synced to production directory.');
} catch (e) {
    console.error('[Error] Failed to sync web assets:', e.message);
}

console.log('[Done] Web assets are ready.');
