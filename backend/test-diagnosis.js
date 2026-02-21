const log = `[04:31:31] [main/ERROR]: Incompatible mods found!
net.fabricmc.loader.impl.FormattedException: Some of your mods are incompatible with the game or each other!
A potential solution has been determined, this may resolve your problem:
	 - Install fabric-api, version 0.100.0+1.21 or later.
	 - Replace 'Minecraft' (minecraft) 1.20.1 with any version between 1.21.1 (inclusive) and 1.22- (exclusive).
	 - Replace 'OpenJDK 64-Bit Server VM' (java) 17 with version 21 or later.
More details:
	 - Mod 'ProjectJJK' (projectjjk) 1.2.0-1.21.1-fabric-beta requires any version between 1.21.1 (inclusive) and 1.22- (exclusive) of 'Minecraft' (minecraft), but only the wrong version is present: 1.20.1!
	 - Mod 'ProjectJJK' (projectjjk) 1.2.0-1.21.1-fabric-beta requires version 21 or later of 'OpenJDK 64-Bit Server VM' (java), but only the wrong version is present: 17!
	 - Mod 'ProjectJJK' (projectjjk) 1.2.0-1.21.1-fabric-beta requires any version of fabric-api, which is missing!
	 - Mod 'BossBarLib' (bossbarlib) v2.0.2 requires any version between 1.21.1 (inclusive) and 1.22- (exclusive) of 'Minecraft' (minecraft), but only the wrong version is present: 1.20.1!`;

console.log('Trigger 1:', /Some of your mods are incompatible with the game or each other/i.test(log));
console.log('Trigger 2:', /FormattedException/i.test(log));

if (/Some of your mods are incompatible with the game or each other!/i.test(log)) {
    console.log('Main if statement passed!');
    const solutionBlockMatch = log.match(/A potential solution has been determined(?:.*?)\n((?:\s*-\s*.*\n?)+)/i);
    console.log('Match result:', solutionBlockMatch ? 'Found' : 'Not found');
    if (solutionBlockMatch) {
       console.log('RAW MATCH:\n' + solutionBlockMatch[1]);
       const solutions = solutionBlockMatch[1]
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.startsWith('-'))
                .map(l => l.replace(/^- /, '• '))
                .join('\n');
       console.log('FORMATTED:\n' + solutions);
    }
} else {
    console.log('Main if statement failed');
}
