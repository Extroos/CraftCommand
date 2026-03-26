const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

async function verifyPurpurJar() {
    const version = '1.21.11';
    const url = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
    const dest = path.join(__dirname, 'test_purpur.jar');

    try {
        console.log(`Downloading Purpur from: ${url}`);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        await fs.writeFile(dest, response.data);
        console.log(`Download complete. Size: ${response.data.length} bytes`);

        const zip = new AdmZip(dest);
        const entries = zip.getEntries();
        
        console.log('--- Jar Insights ---');
        const hasPurpurYml = entries.some(e => e.entryName === 'purpur.yml');
        const hasPaperclip = entries.some(e => e.entryName.includes('paperclip'));
        
        console.log('Has purpur.yml:', hasPurpurYml);
        console.log('Has paperclip entries:', hasPaperclip);
        
        // Check version.json or similar if exists
        const versionEntry = entries.find(e => e.entryName === 'version.json');
        if (versionEntry) {
            console.log('version.json content:', versionEntry.getData().toString());
        }

        // Clean up
        await fs.remove(dest);
    } catch (e) {
        console.error('Verification failed:', e.message);
    }
}

verifyPurpurJar();
