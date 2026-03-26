
const fs = require('fs');
const path = require('path');
const id = process.argv[2];
const logPath = path.join(process.cwd(), 'logs', 'latest.log');

if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath), { recursive: true });

console.log('Dummy Server ' + id + ' started with PID ' + process.pid);

// Simulate log activity
setInterval(() => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] [Server thread/INFO]: Player ${id}_user joined the game\n`);
    fs.appendFileSync(logPath, `[${timestamp}] [Server thread/INFO]: ${id}_user issued server command: /tps\n`);
    fs.appendFileSync(logPath, `[${timestamp}] [Server thread/INFO]: TPS from last 1m: 19.95\n`);
}, 2000);

// Keep process alive
setInterval(() => {}, 1000);
