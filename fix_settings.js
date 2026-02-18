const fs = require('fs');
const path = 'c:/Users/user/Desktop/Craft-Commands/frontend/src/features/servers/SettingsManager.tsx';
const content = fs.readFileSync(path, 'utf8').split('\n');
// We want to remove lines 768 and 769 (1-indexed)
// Which are indices 767 and 768
content.splice(767, 2);
fs.writeFileSync(path, content.join('\n'));
console.log('Fixed SettingsManager.tsx');
