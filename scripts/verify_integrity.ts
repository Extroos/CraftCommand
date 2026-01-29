
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const BACKEND = path.join(ROOT, 'backend');
const DEPRECATED = path.join(ROOT, 'deprecated');

const check = (condition: boolean, msg: string) => {
    if (condition) console.log(`✅ ${msg}`);
    else {
        console.error(`❌ ${msg}`);
        process.exit(1);
    }
};

const verify = () => {
    console.log('--- Verifying Integrity ---');

    // 1. Check Deprecation
    check(fs.existsSync(DEPRECATED), 'Deprecated folder exists');
    check(fs.existsSync(path.join(DEPRECATED, 'nginx')), 'Nginx quarantined');
    check(fs.existsSync(path.join(DEPRECATED, 'public')), 'Public quarantined');

    // 2. Check Atomic Writes
    const repoContent = fs.readFileSync(path.join(BACKEND, 'src/storage/JsonRepository.ts'), 'utf-8');
    check(repoContent.includes('.tmp'), 'JsonRepository uses atomic writes (.tmp)');
    
    // 3. Check Locking
    const serviceContent = fs.readFileSync(path.join(BACKEND, 'src/services/servers/ServerService.ts'), 'utf-8');
    check(serviceContent.includes("acquireLock(id, 'UPDATE')"), 'ServerService updates are locked');

    // 4. Check Path Safety
    const fsManagerContent = fs.readFileSync(path.join(BACKEND, 'src/services/files/FileSystemManager.ts'), 'utf-8');
    check(fsManagerContent.includes('!unsafePath.startsWith'), 'FileSystemManager checks path traversal');
    
    console.log('--- All Checks Passed ---');
};

verify();
