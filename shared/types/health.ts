export type RecoveryStage = 'TRIAGE' | 'REPAIR' | 'SCRUB' | 'START' | 'VERIFY' | 'STABLE' | 'SAFE_MODE';

export interface RecoveryState {
    serverId: string;
    stage: RecoveryStage;
    startTime: number;
    attempts: number;
    lastIssueId?: string;
    stabilityScore: number;
    appliedFix?: boolean;
}

export interface SystemHealthReport {
    cpuLoad: number;
    memoryPressure: number;
    isOverloaded: boolean;
    activeRecoveries: number;
}

export interface StabilityMarker {
    serverId: string;
    score: number; // 0 to 100
    lastCrash: number;
    consecutiveCrashes: number;
    isSafeMode: boolean;
}
