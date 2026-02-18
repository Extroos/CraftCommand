
/**
 * StatsRingBuffer — Lightweight time-series storage for predictive diagnosis.
 * 
 * Stores the last N stats snapshots per server (default: 60 = 1 minute at 1Hz).
 * Provides linear regression for trend analysis with zero external dependencies.
 */

export interface StatsSnapshot {
    cpu: number;
    memory: number;   // MB
    tps: number;
    players: number;  // Online player count
    timestamp: number; // Date.now()
}

export interface TrendResult {
    slope: number;      // Change per second (positive = increasing)
    current: number;    // Latest value
    predicted: number;  // Projected value at `horizonSeconds` into the future
    samples: number;    // Number of data points used
    r2: number;         // Goodness of fit (0-1, higher = more reliable trend)
}

const DEFAULT_BUFFER_SIZE = 60; // 60 seconds of history at 1Hz

class StatsRingBuffer {
    private buffers: Map<string, StatsSnapshot[]> = new Map();
    private maxSize: number;

    constructor(maxSize: number = DEFAULT_BUFFER_SIZE) {
        this.maxSize = maxSize;
    }

    /**
     * Push a new stats snapshot for a server
     */
    push(serverId: string, snapshot: StatsSnapshot): void {
        let buffer = this.buffers.get(serverId);
        if (!buffer) {
            buffer = [];
            this.buffers.set(serverId, buffer);
        }

        buffer.push(snapshot);

        // Ring buffer: evict oldest when full
        if (buffer.length > this.maxSize) {
            buffer.shift();
        }
    }

    /**
     * Get all stored snapshots for a server
     */
    getSamples(serverId: string): StatsSnapshot[] {
        return this.buffers.get(serverId) || [];
    }

    /**
     * Get the number of stored samples
     */
    getSampleCount(serverId: string): number {
        return this.buffers.get(serverId)?.length || 0;
    }

    /**
     * Get aggregate statistics across all stored samples for a server.
     * Useful for resource advisors that need summary data rather than trends.
     */
    getStats(serverId: string): {
        avgCpu: number; avgMemory: number; peakMemory: number;
        avgTps: number; minTps: number; avgPlayers: number;
        peakPlayers: number; samples: number;
    } | null {
        const samples = this.getSamples(serverId);
        if (samples.length < 10) return null; // Need minimum data

        const n = samples.length;
        let sumCpu = 0, sumMem = 0, peakMem = 0;
        let sumTps = 0, minTps = 20;
        let sumPlayers = 0, peakPlayers = 0;

        for (const s of samples) {
            sumCpu += s.cpu;
            sumMem += s.memory;
            if (s.memory > peakMem) peakMem = s.memory;
            sumTps += s.tps;
            if (s.tps < minTps) minTps = s.tps;
            sumPlayers += s.players;
            if (s.players > peakPlayers) peakPlayers = s.players;
        }

        return {
            avgCpu: sumCpu / n,
            avgMemory: sumMem / n,
            peakMemory: peakMem,
            avgTps: sumTps / n,
            minTps,
            avgPlayers: sumPlayers / n,
            peakPlayers,
            samples: n
        };
    }

    /**
     * Clear history for a server (e.g. on stop/restart)
     */
    clear(serverId: string): void {
        this.buffers.delete(serverId);
    }

    /**
     * Compute a linear regression trend for a specific metric.
     * Returns slope (change per second), predicted future value, and R² fit quality.
     * 
     * @param serverId - Server to analyze
     * @param metric - Which metric to trend ('cpu' | 'memory' | 'tps')
     * @param horizonSeconds - How far into the future to predict (default: 300 = 5 min)
     * @param minSamples - Minimum samples required for reliable trend (default: 20)
     */
    getTrend(serverId: string, metric: keyof Pick<StatsSnapshot, 'cpu' | 'memory' | 'tps'>, horizonSeconds: number = 300, minSamples: number = 20): TrendResult | null {
        const samples = this.getSamples(serverId);
        if (samples.length < minSamples) return null;

        const n = samples.length;
        const t0 = samples[0].timestamp;

        // Extract x (time in seconds) and y (metric values)
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

        for (let i = 0; i < n; i++) {
            const x = (samples[i].timestamp - t0) / 1000; // seconds since first sample
            const y = samples[i][metric];
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
            sumY2 += y * y;
        }

        const xMean = sumX / n;
        const yMean = sumY / n;

        const denominator = sumX2 - n * xMean * xMean;
        if (Math.abs(denominator) < 1e-10) return null; // No variance in time (shouldn't happen)

        const slope = (sumXY - n * xMean * yMean) / denominator;
        const intercept = yMean - slope * xMean;

        // R² — goodness of fit
        const ssRes = samples.reduce((sum, s, i) => {
            const x = (s.timestamp - t0) / 1000;
            const predicted = slope * x + intercept;
            return sum + (s[metric] - predicted) ** 2;
        }, 0);
        const ssTot = sumY2 - n * yMean * yMean;
        const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

        const current = samples[n - 1][metric];
        const currentX = (samples[n - 1].timestamp - t0) / 1000;
        const predicted = slope * (currentX + horizonSeconds) + intercept;

        return { slope, current, predicted, samples: n, r2 };
    }
}

export const statsRingBuffer = new StatsRingBuffer();
