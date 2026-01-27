
import axios from 'axios';

async function testDeployment() {
    try {
        console.log('1. Creating Server...');
        const createRes = await axios.post('http://localhost:3001/api/servers', {
            name: 'Test Server',
            port: 25570,
            ram: 2,
            javaVersion: 'Java 17',
            version: '1.20.4',
            executable: 'server.jar'
        });
        const server = createRes.data;
        console.log('Server Created:', server.id);

        console.log('2. Installing Paper...');
        await axios.post(`http://localhost:3001/api/servers/${server.id}/install`, {
            type: 'paper',
            version: '1.20.4'
        });
        console.log('Install request sent.');

        // Wait for download
        console.log('Waiting 15s for download...');
        await new Promise(r => setTimeout(r, 15000));

        console.log('3. Checking files...');
        const filesRes = await axios.get(`http://localhost:3001/api/servers/${server.id}/files`);
        const files = filesRes.data;
        console.log('Files found:', files.map(f => f.name));

        if (files.some(f => f.name === 'server.jar')) {
            console.log('SUCCESS: server.jar found!');
        } else {
            console.error('FAILURE: server.jar missing!');
            process.exit(1);
        }
    } catch (e) {
        console.error(e.message);
        if (e.response) console.error(e.response.data);
        process.exit(1);
    }
}

testDeployment();
