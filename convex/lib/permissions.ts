export const NEXUS_ROLES = ["knowledge_reader", "nexus_admin"] as const;
export type NexusRole = (typeof NEXUS_ROLES)[number];

export const NEXUS_PERMISSIONS = {
  "nexus.access": "nexus.access",
  "knowledge.read": "knowledge.read",
  "task.history.read_own": "task.history.read_own",
  "sources.read": "sources.read",
  "users.read": "users.read",
  "users.approve": "users.approve",
  "users.suspend": "users.suspend",
  "roles.manage": "roles.manage",
  "identity.audit.read": "identity.audit.read",
} as const;

export type NexusPermission = (typeof NEXUS_PERMISSIONS)[keyof typeof NEXUS_PERMISSIONS];

const ROLE_PERMISSIONS: Record<NexusRole, readonly NexusPermission[]> = {
  knowledge_reader: [
    NEXUS_PERMISSIONS["nexus.access"],
    NEXUS_PERMISSIONS["knowledge.read"],
    NEXUS_PERMISSIONS["task.history.read_own"],
    NEXUS_PERMISSIONS["sources.read"],
  ],
  nexus_admin: [
    NEXUS_PERMISSIONS["nexus.access"],
    NEXUS_PERMISSIONS["users.read"],
    NEXUS_PERMISSIONS["users.approve"],
    NEXUS_PERMISSIONS["users.suspend"],
    NEXUS_PERMISSIONS["roles.manage"],
    NEXUS_PERMISSIONS["identity.audit.read"],
  ],
};

export function permissionsForRoles(roles: readonly NexusRole[]): NexusPermission[] {
  const set = new Set<NexusPermission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      set.add(permission);
    }
  }
  return [...set];
}

export function roleHasPermission(role: NexusRole, permission: NexusPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
