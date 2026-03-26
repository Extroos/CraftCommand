const axios = require('axios');

async function debug261() {
    console.log('--- Debugging 26.1 Installation Availability (No Imports) ---');

    // 1. Check Vanilla manifest for 26.1
    try {
        const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
        console.log(`Checking Mojang Manifest: ${manifestUrl}`);
        const response = await axios.get(manifestUrl);
        const v261 = response.data.versions.find(v => v.id === '26.1');
        
        if (!v261) {
            console.log('❌ 26.1 NOT found in Mojang manifest.');
            console.log('Latest Release in Manifest:', response.data.latest.release);
        } else {
            console.log(`✅ 26.1 found in Mojang manifest. URL: ${v261.url}`);
            const detailRes = await axios.get(v261.url);
            const serverJar = detailRes.data.downloads?.server?.url;
            if (serverJar) {
                console.log(`✅ Vanilla Server Jar URL: ${serverJar}`);
            } else {
                console.log('❌ Vanilla Server Jar URL NOT FOUND in version detail.');
            }
        }
    } catch (e) {
        console.log(`❌ Vanilla Check Error: ${e.message}`);
    }

    // 2. Check Paper API for 26.1
    try {
        console.log('\nChecking PaperMC API for 26.1...');
        const paperRes = await axios.get('https://api.papermc.io/v2/projects/paper/versions/26.1', { validateStatus: () => true });
        if (paperRes.status === 200) {
            console.log('✅ Paper 26.1 exists on PaperMC API.');
        } else {
            console.log(`❌ Paper 26.1 NOT found on PaperMC API (Status: ${paperRes.status}).`);
        }
    } catch (e) {
        console.log(`❌ Paper Check Error: ${e.message}`);
    }

    // 3. Check Purpur API for 26.1
    try {
        console.log('\nChecking Purpur API for 26.1...');
        const purpurRes = await axios.get('https://api.purpurmc.org/v2/purpur/26.1', { validateStatus: () => true });
        if (purpurRes.status === 200) {
            console.log('✅ Purpur 26.1 exists on Purpur API.');
        } else {
            console.log(`❌ Purpur 26.1 NOT found on Purpur API (Status: ${purpurRes.status}).`);
        }
    } catch (e) {
        console.log(`❌ Purpur Check Error: ${e.message}`);
    }

    console.log('\n--- Debugging Finished ---');
}

debug261();
