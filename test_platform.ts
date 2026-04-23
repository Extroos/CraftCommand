import { diagnosisService } from './backend/src/features/diagnosis/DiagnosisService';
import { networkService } from './backend/src/features/network/NetworkService';

async function runTest() {
    console.log('--- CRAFTCOMMAND PLATFORM TEST ---');
    try {
        // Direct access to system context as DiagnosisService doesn't have a 'getGlobalDiagnosis'
        const env = await (diagnosisService as any).getSystemContext(process.cwd(), true);
        console.log(`[✓] System Context: CPU ${Math.round(env.cpuUsage)}%, RAM ${Math.round(env.memoryUsed)}/${Math.round(env.memoryTotal)}MB`);
        console.log(`[✓] Free Disk: ${Math.round(env.diskFree / 1024)}GB available`);
        
        const net = networkService.getState();
        console.log(`[✓] Network Service: Public IP ${net.publicIp.current || 'Unknown'}`);
        
        console.log('\n--- TEST SUCCESS ---');
        process.exit(0);
    } catch (e: any) {
        console.error('\n--- TEST FAILED ---');
        console.error(e.message);
        process.exit(1);
    }
}

runTest();
