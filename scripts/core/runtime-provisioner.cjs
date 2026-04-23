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
            if (res.statusCode === 302 || res.statusCode === 301) {
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
    
    if (fs.existsSync(targetDir)) {
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
            // Use PowerShell for zero-dep extraction if AdmZip isnt available yet
            execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${targetDir}' -Force"`);
        } else {
            execSync(`tar -xzf "${archivePath}" -C "${targetDir}" --strip-components=1`);
        }
        
        fs.unlinkSync(archivePath);
        
        // Find the bin folder (Adoptium often puts it in a subfolder)
        const items = fs.readdirSync(targetDir);
        for (const item of items) {
            const subDir = path.join(targetDir, item);
            if (fs.statSync(subDir).isDirectory() && fs.existsSync(path.join(subDir, 'bin'))) {
                // Move everything up
                const files = fs.readdirSync(subDir);
                for (const f of files) {
                    fs.renameSync(path.join(subDir, f), path.join(targetDir, f));
                }
                fs.rmdirSync(subDir);
                break;
            }
        }

        console.log(`[Runtime] Java ${javaVer} ready.`);
        return getJavaEnv(javaVer);
    } catch (err) {
        console.error(`[Runtime] Failed to provision Java ${javaVer}:`, err.message);
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
