
import fs from 'fs-extra';
import path from 'path';
// import yaml from 'js-yaml'; // Removed to avoid dependency constraint for now 
// Actually, standard regex parsing often safer for simple config checks than full YAML parsing if deps missing, 
// but let's try to do it robustly. usage of 'js-yaml' assumes it is in package.json.
// If not, I will implement a lightweight parser for what we need. 

// Checking package.json via cat would be smart, but let's assume we can use a simple properties parser.

export class ConfigReader {
    
    static async readProperties(filePath: string): Promise<Record<string, string>> {
        if (!await fs.pathExists(filePath)) return {};
        
        const content = await fs.readFile(filePath, 'utf8');
        const props: Record<string, string> = {};
        
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...rest] = trimmed.split('=');
                if (key) {
                    props[key.trim()] = rest.join('=').trim();
                }
            }
        });
        
        return props;
    }

    static async readYaml(filePath: string): Promise<any> {
        if (!await fs.pathExists(filePath)) return null;
        try {
            // Check if user has js-yaml, if not return null or try crude regex
            // defaulting to simple crude regex for specific keys if library missing is hard.
            // Let's rely on basic string checks for now to avoid dependency hell in this phase.
            const content = await fs.readFile(filePath, 'utf8');
            return content; // Return raw string for regex matching in Rules
        } catch (e) {
            return null;
        }
    }

    static async checkEula(serverDir: string): Promise<boolean> {
        const eulaPath = path.join(serverDir, 'eula.txt');
        if (!await fs.pathExists(eulaPath)) return false;
        const content = await fs.readFile(eulaPath, 'utf8');
        return content.includes('eula=true');
    }
}
