const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const examplePath = path.join(rootDir, '.env.example');

if (!fs.existsSync(examplePath)) {
    console.error('[EnvSync] .env.example not found. Skipping.');
    process.exit(0);
}

if (!fs.existsSync(envPath)) {
    console.log('[EnvSync] .env not found. Creating from example...');
    fs.copyFileSync(examplePath, envPath);
    console.log('[EnvSync] Success.');
    process.exit(0);
}

// Merge logic
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
const exampleLines = fs.readFileSync(examplePath, 'utf-8').split('\n');

const envKeys = new Set();
envLines.forEach(line => {
    const match = line.match(/^([^#\s][^=]*)=/);
    if (match) envKeys.add(match[1].trim());
});

const newLines = [];
let addedCount = 0;

exampleLines.forEach(line => {
    const match = line.match(/^([^#\s][^=]*)=/);
    if (match) {
        const key = match[1].trim();
        if (!envKeys.has(key)) {
            newLines.push(line);
            addedCount++;
        }
    }
});

if (addedCount > 0) {
    console.log(`[EnvSync] Adding ${addedCount} missing variable(s) from .env.example...`);
    fs.appendFileSync(envPath, '\n# Added by System Update\n' + newLines.join('\n') + '\n');
    console.log('[EnvSync] .env synchronized.');
} else {
    console.log('[EnvSync] .env is up to date.');
}
