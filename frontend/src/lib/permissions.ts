/**
 * Client-side permission checking — mirrors backend ROLE_PERMISSIONS.
 */

const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  owner: new Set(['*']),
  admin: new Set(['*']),
  hr: new Set([
    'jd:create', 'jd:edit', 'jd:view',
    'resume:upload', 'resume:view',
    'interview:create', 'interview:edit', 'interview:evaluate', 'interview:view',
    'campaign:create', 'campaign:edit', 'campaign:view',
    'test:create', 'test:edit', 'test:view',
    'pipeline:manage', 'pipeline:view',
    'settings:view',
  ]),
  interviewer: new Set([
    'interview:evaluate', 'interview:view',
    'jd:view', 'resume:view', 'campaign:view', 'test:view',
    'pipeline:view', 'settings:view',
  ]),
  viewer: new Set([
    'jd:view', 'resume:view', 'interview:view',
    'campaign:view', 'test:view', 'pipeline:view',
    'settings:view',
  ]),
}

export function has_permission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role]
  if (!perms) return false
  if (perms.has('*')) return true
  if (perms.has(permission)) return true
  return false
}
