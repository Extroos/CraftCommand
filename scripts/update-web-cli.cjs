
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('CraftCommand Web Asset Sync');
console.log('---------------------------');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const distDir = path.join(frontendDir, 'dist');

// Check if we need to build
if (!fs.existsSync(distDir)) {
    console.log('[Info] Frontend build not found. Building assets...');
    try {
        execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
        console.log('[Success] Assets built successfully.');
    } catch (e) {
        console.error('[Error] Failed to build frontend assets:', e.message);
        process.exit(1);
    }
} else {
    console.log('[Info] Frontend assets already exist.');
}

// In a real scenario, this might copy dist to backend/public or similar
// But for now, ensuring the build exists is the primary "update" action for a local run.
console.log('[Done] Web assets are ready.');
