const axios = require('axios');

async function checkPurpur() {
    const version = '1.21.11';
    const url = `https://api.purpurmc.org/v2/purpur/${version}`;
    try {
        console.log(`Checking Purpur API for version: ${version}`);
        const res = await axios.get(url);
        console.log('Success!', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('Failed to fetch Purpur version:', e.message);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Data:', e.response.data);
        }
    }
}

checkPurpur();
