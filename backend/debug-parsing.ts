
const content = `
[servers]
	# Auto-Discovered Backends
	paparo1 = "127.0.0.1:25565"
	try = ["paparo1", "paparo2"]
	paparo2 = "127.0.0.1:25566"
# "mc.example.com" = ["lobby"]
[advanced]
`;

console.log("--- START DEBUG ---");
const serverSectionMatch = content.match(/\[servers\]([\s\S]*?)(\[|$)/);

if (!serverSectionMatch) {
    console.log("No [servers] section found");
} else {
    console.log("Section found:", serverSectionMatch[1]);
    const lines = serverSectionMatch[1].split('\n');
    console.log(`Total lines: ${lines.length}`);
    const addresses = [];

    for (const line of lines) {
        const clean = line.trim();
        console.log(`Line: "${clean}"`);
        
        if (clean.includes('=') && !clean.startsWith('#') && !clean.startsWith('try')) {
            const parts = clean.split('=');
            if (parts.length >= 2) {
                let addr = parts[1].trim().replace(/"/g, '').replace(/'/g, '');
                if (addr.includes(':')) {
                    addr = addr.replace('localhost', '127.0.0.1');
                    addresses.push(addr);
                    console.log(`  -> Found Address: ${addr}`);
                } else {
                     console.log(`  -> No port in address: ${addr}`);
                }
            } else {
                 console.log(`  -> Split failed, parts: ${parts.length}`);
            }
        } else {
            console.log("  -> Skipped (comment, try, or no =)");
        }
    }
    console.log("Final Addresses:", addresses);
}
