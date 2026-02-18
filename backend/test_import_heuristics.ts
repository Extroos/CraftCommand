
import path from 'path';
import fs from 'fs-extra';
import { importService } from './src/features/installer/ImportService';

async function runTests() {
    const testRoot = path.join(process.cwd(), 'temp_test_imports');
    
    try {
        await fs.ensureDir(testRoot);

        // Test 1: Bedrock Detection
        console.log('\n--- Test 1: Bedrock Detection ---');
        const bedrockDir = path.join(testRoot, 'bedrock-srv');
        await fs.ensureDir(bedrockDir);
        await fs.writeFile(path.join(bedrockDir, 'bedrock_server.exe'), '');
        await fs.writeFile(path.join(bedrockDir, 'server.properties'), 'server-port=19133\nlevel-name=My Bedrock World');
        
        const res1 = await importService.analyzeFolder(bedrockDir);
        console.log('Result:', JSON.stringify(res1, null, 2));
        if (res1.software === 'Bedrock' && res1.port === 19133) {
            console.log('✅ Bedrock detection passed!');
        } else {
            console.error('❌ Bedrock detection failed!');
        }

        // Test 2: Velocity Detection
        console.log('\n--- Test 2: Velocity Detection ---');
        const velocityDir = path.join(testRoot, 'velocity-proxy');
        await fs.ensureDir(velocityDir);
        await fs.writeFile(path.join(velocityDir, 'velocity.jar'), '');
        
        const res2 = await importService.analyzeFolder(velocityDir);
        console.log('Result:', JSON.stringify(res2, null, 2));
        if (res2.software === 'Velocity' && res2.port === 25577) {
            console.log('✅ Velocity detection passed!');
        } else {
            console.error('❌ Velocity detection failed!');
        }

        // Test 3: Pterodactyl Marker Detection
        console.log('\n--- Test 3: Pterodactyl Marker Detection ---');
        const pteroDir = path.join(testRoot, 'ptero-server');
        await fs.ensureDir(pteroDir);
        await fs.writeFile(path.join(pteroDir, 'paper.jar'), '');
        await fs.writeFile(path.join(pteroDir, 'egg-server.json'), '{}');
        
        const res3 = await importService.analyzeFolder(pteroDir);
        console.log('Result:', JSON.stringify(res3, null, 2));
        if (res3.pterodactylDetected) {
            console.log('✅ Pterodactyl detection passed!');
        } else {
            console.error('❌ Pterodactyl detection failed!');
        }

        // Test 4: Path Safety Check
        console.log('\n--- Test 4: Path Safety Check ---');
        try {
            const systemPath = path.join(process.cwd(), 'backend');
            await importService.importLocal('System Hack', systemPath);
            console.error('❌ Path safety check failed (it allowed system path)!');
        } catch (e: any) {
            console.log('Expected Error:', e.message);
            if (e.message.includes('Safety Protection')) {
                console.log('✅ Path safety check passed!');
            }
        }

    } finally {
        await fs.remove(testRoot);
    }
}

runTests().catch(console.error);
