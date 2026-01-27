
const util = require('minecraft-server-util');

const port = 25565;
console.log(`Querying 127.0.0.1:${port}...`);


(async () => {
    try {
        const status = await util.status('127.0.0.1', port, { timeout: 2000 });
        console.log("--- STATUS RESULT ---");
        console.log(`Online: ${status.players.online} / ${status.players.max}`);
        console.log("Sample:", status.players.sample);
        console.log("Version:", status.version.name);
    } catch (e: any) {
        console.error("Status Failed:", e.message);
    }

    try {
        const q = await util.queryFull('127.0.0.1', port, { timeout: 2000 });
        console.log("\n--- QUERY FULL RESULT ---");
        console.log(`Online: ${q.players.online} / ${q.players.max}`);
        console.log("List:", q.players.list);
    } catch (e: any) {
        console.error("Query Full Failed:", e.message);
    }
})();
