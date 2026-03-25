import { installerService } from '../features/installer/InstallerService';
import fs from 'fs-extra';
import path from 'path';
import { SERVERS_ROOT } from '../constants';

async function testPurpurInstall() {
    const serverId = 'test-purpur-install';
    const serverDir = path.join(SERVERS_ROOT, 'local-' + serverId);
    const version = '1.21.11';

    console.log(`[Test] Starting Purpur ${version} installation test...`);

    try {
        await fs.ensureDir(serverDir);
        
        await installerService.installPurpur(serverId, serverDir, version, 'latest', (msg, percent) => {
            console.log(`[Progress] ${msg} ${percent !== undefined ? percent + '%' : ''}`);
        });

        const jarPath = path.join(serverDir, 'server.jar');
        if (await fs.pathExists(jarPath)) {
            console.log(`[Success] server.jar found at ${jarPath}`);
            
            // Basic check if it's a jar (ends with PK)
            const stats = await fs.stat(jarPath);
            console.log(`[Info] Jar size: ${stats.size} bytes`);

            // Read first few bytes to check if it's a ZIP/JAR
            const buffer = Buffer.alloc(4);
            const fd = await fs.open(jarPath, 'r');
            await fs.read(fd, buffer, 0, 4, 0);
            await fs.close(fd);

            if (buffer.toString('hex') === '504b0304') {
                console.log('[Success] File is a valid ZIP/JAR');
            } else {
                console.error('[Failure] File is NOT a valid ZIP/JAR');
            }

            // We could try to read the manifest or some classes, but for now we'll assume the URL was correct.
        } else {
            console.error('[Failure] server.jar NOT found!');
        }

    } catch (e) {
        console.error('[Error] Test failed:', e);
    } finally {
        // Cleanup? Maybe keep it for manual inspection
        // await fs.remove(serverDir);
    }
}

testPurpurInstall();
