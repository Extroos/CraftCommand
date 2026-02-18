
import { crossPlayService } from '../features/network/CrossPlayService';
import { serverRepository } from '../storage/ServerRepository';
import { pluginService } from '../features/plugins/PluginService';
import fs from 'fs-extra';
import path from 'path';

async function verify() {
    console.log('Starting Cross-Play Verification...');
    
    // 1. Create Test Server
    const id = `local-${Date.now()}`;
    const serverDir = path.join(process.cwd(), 'minecraft_servers', id);
    await fs.ensureDir(serverDir);
    
    serverRepository.create({
        id,
        name: 'CrossPlay Verify',
        software: 'Paper',
        version: '1.20.4',
        port: 25565,
        status: 'OFFLINE',
        workingDirectory: serverDir,
        createdAt: Date.now(),
        updatedAt: Date.now()
    } as any);
    
    console.log(`Created test server: ${id}`);
    
    try {
        // 2. Enable Cross-Play
        console.log('Enabling Cross-Play...');
        const result = await crossPlayService.enable(id);
        console.log('Enable Result:', result);
        
        if (!result.success) throw new Error('Failed to enable cross-play');

        // 3. Verify Geyser Config
        const geyserConfigPath = path.join(serverDir, 'plugins', 'Geyser-Spigot', 'config.yml');
        if (await fs.pathExists(geyserConfigPath)) {
            console.log('✅ Geyser config found.');
        } else {
            console.error('❌ Geyser config MISSING!');
        }

        // 4. Verify Plugins Installed
        const plugins = pluginService.getInstalled(id);
        const hasGeyser = plugins.some(p => p.name.toLowerCase().includes('geyser'));
        const hasFloodgate = plugins.some(p => p.name.toLowerCase().includes('floodgate'));
        
        console.log(`Geyser Installed: ${hasGeyser}`);
        console.log(`Floodgate Installed: ${hasFloodgate}`);

        if (hasGeyser && hasFloodgate) {
            console.log('✅ Both plugins installed successfully.');
        } else {
            console.error('❌ Plugin installation incomplete.');
        }

        // 5. Verify Server Config Update
        const updatedServer = serverRepository.findById(id);
        if (updatedServer?.crossPlay?.enabled) {
            console.log('✅ ServerConfig updated with crossPlay: enabled.');
        } else {
            console.error('❌ ServerConfig crossPlay field missing/false.');
        }

    } catch (e: any) {
        console.error('VERIFICATION FAILED:', e);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Data:', JSON.stringify(e.response.data));
        }
    } finally {
        // Cleanup
        console.log('Cleaning up...');
        serverRepository.delete(id);
        await fs.remove(serverDir);
        console.log('Server removed.');
    }
}

verify();
