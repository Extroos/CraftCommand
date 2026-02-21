import fs from 'fs';
import { CoreRules } from './src/features/diagnosis/DiagnosisRules';
import { DiagnosisBrain } from './src/features/diagnosis/DiagnosisBrain';

const brain = new DiagnosisBrain();

async function run() {
    console.log('Reading logs...');
    const logContent = fs.readFileSync('C:/Users/user/Desktop/Craft-Commands/backend/minecraft_servers/local-1771560421885/logs/latest.log', 'utf8');
    const logs = logContent.split('\n');
    console.log(`Read ${logs.length} lines`);
    
    // Test the specific rule trigger
    const rule = CoreRules.find(r => r.id === 'incompatible_mods');
    console.log('Rule found:', !!rule);
    
    if (rule) {
        console.log('Triggers matched:', rule.triggers.some(t => t.test(logContent)));
        const mockServer = {id: 'test', version: '1.20', javaVersion: '17', software: 'Modpack', status: 'CRASHED'};
        const mockEnv = { memory: { free: 4000, total: 8000 } };
        
        try {
            const res = await rule.analyze(mockServer as any, logs, mockEnv as any);
            console.log('Rule Result:', JSON.stringify(res, null, 2));
        } catch (e) {
            console.error('Rule error:', e);
        }

        try {
            console.log('--- Running Full Brain ---');
            const fullRes = await brain.analyze(mockServer as any, CoreRules, logs, mockEnv as any);
            console.log('Brain Result:', JSON.stringify(fullRes, null, 2));
        } catch (e) {
            console.error('Brain Error:', e);
        }
    }
}

run().catch(console.error);
