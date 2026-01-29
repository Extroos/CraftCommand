const RESERVED_NAMES = [
    'backend', 'frontend', 'node_modules', 'data', 'logs', 'backups', 
    'config', 'public', 'src', 'dist', 'build', 'temp', 'tmp',
    'auth', 'system', 'api', 'server', 'servers', 'minecraft_servers'
];

export const validateFolderName = (name: string): boolean => {
    // 1. Basic Regex: Alphanumeric, underscores, dashes only.
    if (!/^[a-zA-Z0-9_\-]+$/.test(name)) return false;

    // 2. Reserved Names Check (Case-insensitive)
    if (RESERVED_NAMES.includes(name.toLowerCase())) return false;

    return true;
};

export const validateBuildId = (build: string): boolean => {
    // Prevent path traversal in build IDs (e.g. "../")
    // Allow dots, numbers, dashes. 
    // Typical build: "1.2.3", "47.1.0", "1.20.1-47.1.0"
    return /^[a-zA-Z0-9.\-]+$/.test(build) && !build.includes('..');
};
