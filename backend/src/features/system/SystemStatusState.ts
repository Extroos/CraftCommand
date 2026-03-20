/**
 * Shared transient state for the system status.
 * This avoids circular dependencies between server.ts and routes.
 */

export let protocol: string = 'http';
export let sslStatus: 'VALID' | 'SELF_SIGNED' | 'NONE' = 'NONE';
export let version: string = '0.0.0';

export const setSystemStatus = (newProtocol: string, newSslStatus: 'VALID' | 'SELF_SIGNED' | 'NONE', newVersion?: string) => {
    protocol = newProtocol;
    sslStatus = newSslStatus;
    if (newVersion) version = newVersion;
};
