
const regex = /(?:\[.*\]:\s+|:\s+|^)([\w\d_]{3,16})\s+joined the game/i;

const samples = [
    "[17:45:30] [Server thread/INFO]: Steve joined the game",
    "[17:45:30] [Server thread/INFO] [minecraft/MinecraftServer]: Alex joined the game",
    "Player3 joined the game",
    ": Herobrine joined the game",
    "[10:10:10] [INFO]: spaced name joined the game", // Should fail (space)
    "[10:10:10] [INFO]: valid_name_123 joined the game",
    "\u001b[m[10:10:10] [INFO]: ColorCodeUser joined the game" // standard ansi?
];

console.log("--- Testing Regex ---");
samples.forEach(line => {
    const match = line.match(regex);
    console.log(`\nLine: "${line}"`);
    if (match) {
        console.log(`MATCH: "${match[1]}"`);
    } else {
        console.log("NO MATCH");
    }
});
