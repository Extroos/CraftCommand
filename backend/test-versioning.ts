import { minecraftVersionService } from './src/features/system/MinecraftVersionService';
import { bedrockVersionService } from './src/features/system/BedrockVersionService';
import { javaManager } from './src/features/processes/JavaManager';

async function runTests() {
    console.log('--- Starting Versioning System Verification ---');

    // 1. Test Minecraft Java Versioning
    try {
        console.log('\n[Test 1] Fetching Java Versions...');
        const javaVersions = await minecraftVersionService.getGroupedVersions();
        console.log(`Latest Release: ${javaVersions.latest}`);
        console.log(`Latest Snapshot: ${javaVersions.latestSnapshot}`);
        console.log(`Releases Count: ${javaVersions.releases.length}`);
        
        if (javaVersions.latest.startsWith('26') || javaVersions.latest.startsWith('1.21')) { // 26.x or 1.21.x
            console.log('✅ Java Version Fetch: SUCCESS');
        } else {
            console.log('❌ Java Version Fetch: FAILED (Unexpected latest version)');
        }
    } catch (e: any) {
        console.log(`❌ Java Version Fetch: ERROR - ${e.message}`);
    }

    // 2. Test Bedrock Versioning
    try {
        console.log('\n[Test 2] Fetching Bedrock Versions...');
        const bedrockVersions = await bedrockVersionService.getVersions();
        console.log(`Latest Release: ${bedrockVersions.latest}`);
        console.log(`Versions Count: ${bedrockVersions.versions.length}`);

        if (bedrockVersions.latest.startsWith('26') || bedrockVersions.latest.startsWith('1.26')) {
            console.log('✅ Bedrock Version Fetch: SUCCESS');
        } else {
            console.log('❌ Bedrock Version Fetch: FAILED (Unexpected latest version)');
        }
    } catch (e: any) {
        console.log(`❌ Bedrock Version Fetch: ERROR - ${e.message}`);
    }

    // 3. Test Java Recommendation Heuristic
    console.log('\n[Test 3] Verifying Java Recommendations...');
    const tests = [
        { v: '26.1', expected: 'Java 21' },
        { v: '1.21.1', expected: 'Java 21' },
        { v: '1.20.6', expected: 'Java 21' },
        { v: '1.20.1', expected: 'Java 17' },
        { v: '1.17', expected: 'Java 17' },
        { v: '1.16.5', expected: 'Java 11' },
        { v: '1.8.9', expected: 'Java 8' }
    ];

    let recoPassed = 0;
    for (const test of tests) {
        const result = javaManager.getRecommendedJavaVersion(test.v);
        if (result === test.expected) {
            console.log(`  v${test.v} -> ${result} (Match)`);
            recoPassed++;
        } else {
            console.log(`  v${test.v} -> ${result} (Expected ${test.expected}) ❌`);
        }
    }

    if (recoPassed === tests.length) {
        console.log('✅ Java Recommendation: SUCCESS');
    } else {
        console.log(`❌ Java Recommendation: FAILED (${recoPassed}/${tests.length})`);
    }

    console.log('\n--- Verification Finished ---');
}

runTests().catch(err => {
    console.error('Critical Test Failure:', err);
    process.exit(1);
});
