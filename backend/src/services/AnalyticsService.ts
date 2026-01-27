
export interface ServerMetrics {
    cpu: number;      // Percentage 0-100
    memory: number;   // Used in MB
    allocated: number;// Max in MB
    tps: number;
    uptime: number;
}

export interface AnalysisResult {
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    issues: string[];
    environment: {
        java?: string;
        loader?: string;
    };
}

export class AnalyticsService {

    analyze(metrics: ServerMetrics, recentLogs: string[], serverStatus: string = 'ONLINE'): AnalysisResult {
        const issues: string[] = [];
        let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';

        const setStatus = (newStatus: 'WARNING' | 'CRITICAL') => {
            if (status === 'CRITICAL') return; // Already max severity
            if (newStatus === 'CRITICAL') status = 'CRITICAL';
            else if (status === 'HEALTHY') status = 'WARNING';
        };

        // If server is initializing (Modpacks can take 5+ mins), suppress performance alerts.
        const isStarting = serverStatus === 'STARTING' || serverStatus === 'OFFLINE';
        
        if (!isStarting) {
            // 1. Performance Heuristics
            const memPercent = (metrics.memory / metrics.allocated) * 100;
            
            // GC Thrashing / LOW RAM
            if (memPercent > 95 && metrics.tps < 18) {
                issues.push('⚠️ Critical Memory Pressure (GC Thrashing detected)');
                setStatus('CRITICAL');
            } else if (memPercent > 90) {
                issues.push('⚠️ Low RAM Headroom (<10% free)');
                setStatus('WARNING');
            }

            // CPU Bottleneck
            if (metrics.cpu > 90 && metrics.tps < 18) {
                issues.push('⚠️ CPU Overload (Thread Starvation)');
                setStatus('CRITICAL');
            }

            // TPS degradation
            // Ignore during startup (first 60s) or if measurement is 0 (no data)
            if (metrics.uptime > 60) {
                if (metrics.tps < 10 && metrics.tps > 0.0) {
                    issues.push('⚠️ Severe Checkpoint Lag (TPS < 10)');
                    setStatus('CRITICAL');
                } else if (metrics.tps < 17 && metrics.tps >= 10) {
                     issues.push('⚠️ Server lagging (TPS dropped)');
                     setStatus('WARNING');
                }
            }
        } else {
            // Optional: Add an "Initializing" hint if desired, but user wants silence.
        }

        // 2. Log Heuristics (Scan last 50 lines)
        const recent = recentLogs.slice(-50);
        
        // "Can't keep up!"
        const lagSpam = recent.filter(l => l.includes("Can't keep up!")).length;
        if (lagSpam > 3) {
            issues.push('⚠️ Server ticking behind (Can\'t keep up)');
            setStatus('WARNING');
        }

        // 3. Environment Checks
        if (recent.some(l => l.includes('You are using an unsupported Java version'))) {
            issues.push('⚠️ Unsupported Java Version detected');
            setStatus('WARNING');
        }

        const environment = this.detectEnvironment(recentLogs);

        return { status, issues, environment };
    }

    analyzeCrash(logs: string[]): string {
        const recent = logs.slice(-100);
        const text = recent.join('\n');
        
        if (text.includes('OutOfMemoryError')) return 'Out of Memory - Increase RAM allocated to the server.';
        if (text.includes('Address already in use')) return 'Port Conflict - The port is already being used by another server.';
        if (text.includes('UnsupportedClassVersionError')) return 'Java Version Mismatch - You are running a mod/plugin that requires a newer Java version.';
        if (text.includes('FileList')) return 'Corrupted File Detected - Check logs for details.';
        
        return 'Unknown Crash - Please check the console logs for "Exception" or "Error".';
    }

    detectEnvironment(logs: string[]): { java?: string, loader?: string } {
        const result: { java?: string, loader?: string } = {};
        
        // Scan logs for environment details
        for (const line of logs) {
            const lower = line.toLowerCase();
            
            // 1. Loader Detection
            if (lower.includes('paper version') || line.includes('git-Paper')) {
                result.loader = 'Paper';
            } else if (lower.includes('forge') && (lower.includes('modlauncher') || lower.includes('fml'))) {
                result.loader = 'Forge';
            } else if (lower.includes('fabric loader')) {
                result.loader = 'Fabric';
            } else if (lower.includes('spigot')) {
                result.loader = 'Spigot';
            } 
            // Vanilla Detection (Weak check)
            else if (lower.includes('starting minecraft server version')) {
                 if (!result.loader) result.loader = 'Vanilla';
            }

            // 2. Java Version (Heuristic)
            if (line.includes('Java HotSpot') || line.includes('OpenJDK')) {
                // Try to extract version number if possible, or just note it's detected
                // Example: "OpenJDK 64-Bit Server VM"
                if (line.includes('64-Bit')) result.java = 'Java (64-Bit)';
            }
        }
        
        return result;
    }
}

export const analyticsService = new AnalyticsService();
