const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

/**
 * CraftCommand Runtime Provisioner
 * Handles automated JRE management for Minecraft Servers
 */

const BASE_DIR = path.resolve(__dirname, '../../');
const RUNTIME_DIR = path.join(BASE_DIR, '.runtimes/java');

const VERSION_MAP = {
    '8': '8',
    '11': '11',
    '16': '17', // Minecraft 1.17 switched to 16, but 17 is the LTS fallback
    '17': '17',
    '21': '21'
};

/**
 * Detect OS and Arch for Adoptium API
 */
function getPlatform() {
    let os = process.platform;
    let arch = process.arch;

    if (os === 'win32') os = 'windows';
    if (arch === 'x64') arch = 'x64';
    if (arch === 'arm64') arch = 'aarch64';
    
    return { os, arch };
}

/**
 * Construct Adoptium Download URL
 */
function getDownloadUrl(javaVersion) {
    const { os, arch } = getPlatform();
    return `https://api.adoptium.net/v3/binary/latest/${javaVersion}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
}

/**
 * Download a file with redirect support
 */
async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download: ${res.statusCode}`));
                return;
            }

            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', reject);
    });
}

/**
 * Provision a specific Java version
 */
async function provisionJava(version) {
    const javaVer = VERSION_MAP[version] || version;
    const targetDir = path.join(RUNTIME_DIR, javaVer);
    
    const binName = process.platform === 'win32' ? 'java.exe' : 'java';
    const binPath = path.join(targetDir, 'bin', binName);
    
    if (fs.existsSync(targetDir) && fs.existsSync(binPath)) {
        return getJavaEnv(javaVer);
    }

    console.log(`[Runtime] Provisioning Java ${javaVer}...`);
    fs.mkdirSync(targetDir, { recursive: true });

    const archiveName = process.platform === 'win32' ? 'jre.zip' : 'jre.tar.gz';
    const archivePath = path.join(targetDir, archiveName);

    try {
        await downloadFile(getDownloadUrl(javaVer), archivePath);
        
        console.log(`[Runtime] Extracting Java ${javaVer}...`);
        if (process.platform === 'win32') {
            // Use PowerShell for zero-dep extraction
            execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${targetDir}' -Force"`);
            
            // Flatten: Find the deepest directory that contains 'bin' and move its contents to targetDir
            const findBinCmd = `powershell -Command "(Get-ChildItem -Path '${targetDir}' -Recurse -Directory -Filter 'bin' | Select-Object -First 1).Parent.FullName"`;
            const sourceParent = execSync(findBinCmd).toString().trim();
            
            if (sourceParent && sourceParent.toLowerCase() !== targetDir.toLowerCase()) {
                console.log(`[Runtime] Flattening directory structure from ${sourceParent}...`);
                execSync(`powershell -Command "Move-Item -Path '${sourceParent}\\*' -Destination '${targetDir}' -Force -ErrorAction SilentlyContinue"`);
            }
        } else {
            execSync(`tar -xzf "${archivePath}" -C "${targetDir}" --strip-components=1`);
        }
        
        if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
        
        // Final verification check
        const binPath = path.join(targetDir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
        if (!fs.existsSync(binPath)) {
            throw new Error(`Extraction failed: Java binary not found at ${binPath}`);
        }

        console.log(`[Runtime] Java ${javaVer} ready.`);
        return getJavaEnv(javaVer);
    } catch (err) {
        console.error(`[Runtime] Failed to provision Java ${javaVer}:`, err.message);
        // Cleanup failed directory to allow retry
        if (fs.existsSync(targetDir)) {
            try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch (e) {}
        }
        throw err;
    }
}

/**
 * Get Environment Injection Object
 */
function getJavaEnv(javaVer) {
    const javaHome = path.join(RUNTIME_DIR, javaVer);
    const javaBin = path.join(javaHome, 'bin');
    
    // Construct isolated PATH
    const separator = process.platform === 'win32' ? ';' : ':';
    const newPath = `${javaBin}${separator}${process.env.PATH}`;

    return {
        JAVA_HOME: javaHome,
        PATH: newPath,
        CRAFT_RUNTIME: 'true'
    };
}

module.exports = {
    provisionJava,
    getJavaEnv,
    RUNTIME_DIR
};

// CLI Support
if (require.main === module) {
    const ver = process.argv[2] || '21';
    provisionJava(ver).then(env => {
        console.log('Environment Ready:', env.JAVA_HOME);
    }).catch(() => process.exit(1));
}
