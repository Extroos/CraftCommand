const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const BACKEND_ROOT = path.join(PROJECT_ROOT, 'backend');
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release_artifacts');

const VERSION = process.argv[2];

if (!VERSION) {
    console.error('Usage: node build-release.cjs <version> (e.g. 1.2.0)');
    process.exit(1);
}

const KEYS_DIR = path.join(PROJECT_ROOT, 'backend/keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'update_private_key.pem');

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('ERROR: Private key not found. Run generate-keys.cjs first.');
    process.exit(1);
}

console.log(`\n📦 Building Release v${VERSION}...\n`);

// 1. Clean Release Dir
if (fs.existsSync(RELEASE_DIR)) {
    fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(RELEASE_DIR);

// 2. Build Backend
console.log('Building backend...');
try {
    execSync('npm run build', { cwd: BACKEND_ROOT, stdio: 'inherit' });
} catch (e) {
    console.error('Build failed.');
    process.exit(1);
}

// 3. Create Bundle Staging
const STAGING = path.join(RELEASE_DIR, 'staging');
fs.mkdirSync(STAGING);

// Copy Dist
console.log('Copying artifacts...');
fs.cpSync(path.join(BACKEND_ROOT, 'dist'), path.join(STAGING, 'backend/dist'), { recursive: true });
fs.cpSync(path.join(BACKEND_ROOT, 'package.json'), path.join(STAGING, 'backend/package.json'));
fs.cpSync(path.join(BACKEND_ROOT, 'tsconfig.json'), path.join(STAGING, 'backend/tsconfig.json')); // Needed for paths
// ... add frontend statics if needed

// 4. Zip Bundle
console.log('Zipping bundle...');
const BUNDLE_NAME = `craftcommand-v${VERSION}.zip`;
const BUNDLE_PATH = path.join(RELEASE_DIR, BUNDLE_NAME);

// Use PowerShell to zip (Windows compat)
const psCommand = `Compress-Archive -Path '${STAGING}/*' -DestinationPath '${BUNDLE_PATH}' -Force`;
try {
    execSync(`powershell -command "${psCommand}"`, { stdio: 'inherit' });
} catch (e) {
    console.error('Zipping failed.');
    process.exit(1);
}

// 5. Hash Bundle
const fileBuffer = fs.readFileSync(BUNDLE_PATH);
const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
console.log(`Bundle SHA256: ${hash}`);

// 6. Create Manifest
const manifest = {
    version: VERSION,
    buildDate: new Date().toISOString(),
    minFrontendVersion: '1.0.0', // TODO: Make dynamic
    minAgentVersion: '1.0.0',    // Minimum compatible agent version
    files: {
        [BUNDLE_NAME]: hash
    }
};

const MANIFEST_PATH = path.join(RELEASE_DIR, 'manifest.json');
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

// 7. Sign Manifest
console.log('Signing manifest...');
const manifestContent = fs.readFileSync(MANIFEST_PATH); // Read exactly what was written
const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
const signature = crypto.sign(null, manifestContent, privateKey);
const signatureBase64 = signature.toString('base64');

const SIG_PATH = path.join(RELEASE_DIR, 'manifest.sig');
fs.writeFileSync(SIG_PATH, signatureBase64);

// Cleanup Staging
fs.rmSync(STAGING, { recursive: true, force: true });

console.log(`\n✅ Release v${VERSION} Ready!`);
console.log(`📂 Output: ${RELEASE_DIR}`);
console.log(`   - ${BUNDLE_NAME}`);
console.log(`   - manifest.json`);
console.log(`   - manifest.sig`);
