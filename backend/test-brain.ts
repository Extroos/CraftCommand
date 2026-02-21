import { diagnosisBrain } from './src/features/diagnosis/DiagnosisBrain';
import { CoreRules } from './src/features/diagnosis/DiagnosisRules';

const mockLogs = [
  '[04:31:31] [main/ERROR]: Incompatible mods found!',
  'net.fabricmc.loader.impl.FormattedException: Some of your mods are incompatible with the game or each other!',
  'A potential solution has been determined, this may resolve your problem:',
  '\t - Install fabric-api, version 0.100.0+1.21 or later.',
  '\t - Replace \'Minecraft\' (minecraft) 1.20.1 with any version between 1.21.1 (inclusive) and 1.22- (exclusive).',
  '\t - Replace \'OpenJDK 64-Bit Server VM\' (java) 17 with version 21 or later.',
  'More details:',
  '\t - Mod \'ProjectJJK\' (projectjjk) 1.2.0-1.21.1-fabric-beta requires any version between 1.21.1 (inclusive) and 1.22- (exclusive) of \'Minecraft\' (minecraft), but only the wrong version is present: 1.20.1!'
];

const mockServer = {
    id: 'test-123',
    version: '1.20.1',
    javaVersion: 'Java 17',
    software: 'Modpack',
    status: 'CRASHED',
    ram: 4096,
    port: 25565
} as any;

const mockEnv = { memory: { free: 4000, total: 8000 } } as any;

async function run() {
    const res = await diagnosisBrain.analyze(mockServer, CoreRules, mockLogs, mockEnv);
    console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);
