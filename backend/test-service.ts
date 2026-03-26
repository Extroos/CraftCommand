
import { minecraftVersionService } from './src/features/system/MinecraftVersionService';
import { logger } from './src/utils/logger';

async function test() {
    console.log('--- STARTING MINECRAFT VERSION SERVICE TEST ---');
    try {
        const versions = await minecraftVersionService.getGroupedVersions();
        console.log('SUCCESS: Fetched versions from service.');
        console.log('Latest Release:', versions.latest);
        console.log('Release Count:', versions.releases.length);
        console.log('Snapshot Count:', versions.snapshots.length);
        console.log('Beta Count:', versions.beta.length);
        console.log('Alpha Count:', versions.alpha.length);
        
        if (versions.releases.length > 0) {
            console.log('Sample Release:', versions.releases[0]);
        } else {
            console.error('ERROR: No releases found!');
        }
    } catch (err: any) {
        console.error('FAILED: Service threw an error:', err.message);
    }
    console.log('--- TEST COMPLETE ---');
}

test();
