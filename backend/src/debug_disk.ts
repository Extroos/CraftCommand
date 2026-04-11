
import si from 'systeminformation';
import path from 'path';

async function debugDisk() {
    console.log('--- Disk Debug Scan ---');
    const fs = await si.fsSize();
    console.log('All Partitions:');
    fs.forEach((f, i) => {
        console.log(`[${i}] Mount: ${f.mount}, Size: ${f.size}, Available: ${f.available}, Use%: ${f.use}%`);
    });

    const workingPath = process.cwd();
    const normalizedPath = path.resolve(workingPath).toLowerCase();
    console.log(`\nWorking Path: ${normalizedPath}`);

    const sortedFs = fs.sort((a, b) => b.mount.length - a.mount.length);
    let targetFs = sortedFs.find(f => {
        const mount = f.mount.toLowerCase();
        return normalizedPath === mount || normalizedPath.startsWith(mount);
    });

    if (targetFs) {
        console.log(`Match Found! Target Mount: ${targetFs.mount}`);
    } else {
        console.log('No direct match found.');
        const largest = fs.sort((a, b) => b.size - a.size)[0];
        console.log(`Fallback to largest: ${largest?.mount} (${largest?.size} bytes)`);
    }
}

debugDisk();
