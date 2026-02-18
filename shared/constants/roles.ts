export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'VIEWER';

export type Permission = 
    | 'server.view' 
    | 'server.start' 
    | 'server.stop' 
    | 'server.restart'
    | 'server.console.read' 
    | 'server.console.write' 
    | 'server.files.read' 
    | 'server.files.write' 
    | 'server.settings' 
    | 'server.settings.manage'
    | 'server.players.manage' 
    | 'server.backups.read'
    | 'server.backups.manage'
    | 'server.schedules.read'
    | 'server.schedules.manage'
    | 'server.plugins.read'
    | 'server.plugins.view'
    | 'server.plugins.manage'
    | 'server.proxy.manage'
    | 'server.integrations.manage'
    | 'server.integrations.read'
    | 'server.map.view'
    | 'server.map.manage'
    | 'server.create' 
    | 'server.delete' 
    | 'server.manage'
    | 'users.manage'
    | 'system.settings.manage'
    | 'system.audit.view'
    | 'system.audit.read'
    | 'system.nodes.manage'
    | 'system.integrations.manage'
    | 'system.remote_access.manage';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
    'OWNER': 3,
    'ADMIN': 2,
    'MANAGER': 1,
    'VIEWER': 0
};

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    'OWNER': [
        'server.view', 'server.start', 'server.stop', 'server.restart',
        'server.console.read', 'server.console.write', 'server.files.read', 'server.files.write',
        'server.settings', 'server.settings.manage', 'server.players.manage', 
        'server.backups.read', 'server.backups.manage', 'server.schedules.read', 'server.schedules.manage',
        'server.plugins.read', 'server.plugins.view', 'server.plugins.manage', 
        'server.proxy.manage', 'server.integrations.manage', 'server.integrations.read',
        'server.map.view', 'server.map.manage',
        'server.create', 'server.delete', 'server.manage', 'users.manage',
        'system.settings.manage', 'system.audit.view', 'system.audit.read', 'system.nodes.manage', 'system.integrations.manage',
        'system.remote_access.manage'
    ],
    'ADMIN': [
        'server.view', 'server.start', 'server.stop', 'server.restart',
        'server.console.read', 'server.console.write', 'server.files.read', 'server.files.write',
        'server.settings', 'server.settings.manage', 'server.players.manage', 
        'server.backups.read', 'server.backups.manage', 'server.schedules.read', 'server.schedules.manage',
        'server.plugins.read', 'server.plugins.view', 'server.plugins.manage', 
        'server.proxy.manage', 'server.integrations.manage', 'server.integrations.read',
        'server.map.view', 'server.map.manage',
        'server.create', 'server.delete', 'server.manage', 'users.manage',
        'system.settings.manage', 'system.audit.view', 'system.audit.read', 'system.nodes.manage', 'system.integrations.manage'
    ],
    'MANAGER': [
        'server.view', 'server.start', 'server.stop', 'server.restart',
        'server.console.read', 'server.console.write', 'server.files.read', 'server.files.write',
        'server.settings', 'server.settings.manage', 'server.players.manage', 
        'server.backups.read', 'server.backups.manage', 'server.schedules.read', 'server.schedules.manage',
        'server.plugins.read', 'server.plugins.view', 'server.plugins.manage', 
        'server.proxy.manage', 'server.integrations.manage', 'server.integrations.read',
        'server.map.view', 'server.map.manage'
    ],
    'VIEWER': [
        'server.view', 'server.console.read', 'server.files.read', 'server.plugins.view', 'server.plugins.read',
        'server.backups.read', 'server.schedules.read', 'server.integrations.read', 'server.map.view'
    ]
};
