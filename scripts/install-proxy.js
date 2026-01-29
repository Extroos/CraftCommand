
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const PROXY_DIR = path.join(__dirname, '../proxy');
const EXE_PATH = path.join(PROXY_DIR, 'playit.exe');
// Direct link to Playit Agent v0.17.1 (Signed) - Hosted on GitHub
// Check https://github.com/playit-cloud/playit-agent/releases for newer versions if this fails.
const DOWNLOAD_URL = "https://github.com/playit-cloud/playit-agent/releases/download/v0.17.1/playit-windows-x86_64-signed.exe"; 
// Fallback or specific version. 0.15.26 is known stable.

// Ensure Directory
if (!fs.existsSync(PROXY_DIR)) {
    fs.mkdirSync(PROXY_DIR, { recursive: true });
}

console.log('[Proxy Setup] Checking for existing agent...');

if (fs.existsSync(EXE_PATH)) {
    console.log('[Info] Playit.exe already exists. Skipping download.');
    process.exit(0);
}

console.log(`[Proxy Setup] Downloading Playit.gg Agent ...`);
console.log(`[Source] ${DOWNLOAD_URL}`);

const file = fs.createWriteStream(EXE_PATH);

https.get(DOWNLOAD_URL, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle Redirects (GitHub often redirects)
        const newUrl = response.headers.location;
        console.log(`[Info] Redirecting to: ${newUrl}`);
        https.get(newUrl, (redirectResponse) => {
            redirectResponse.pipe(file);
            redirectResponse.on('end', finishCallback);
        });
    } else if (response.statusCode === 200) {
        response.pipe(file);
        response.on('end', finishCallback);
    } else {
        console.error(`[Error] Download Failed. Status Code: ${response.statusCode}`);
        fs.unlink(EXE_PATH, () => {}); // Delete partial file
        process.exit(1);
    }
}).on('error', (err) => {
    console.error(`[Fatal] Network Error: ${err.message}`);
    fs.unlink(EXE_PATH, () => {});
    process.exit(1);
});

function finishCallback() {
    file.close(() => {
        console.log('[Success] Playit.gg Agent downloaded successfully!');
        process.exit(0);
    });
}
