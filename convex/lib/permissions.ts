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
  // P5 — private conversations, messages, tasks. All scoped to the owner; no
  // *_all variants exist, so no role can read another user's private content.
  "conversations.create": "conversations.create",
  "conversations.read_own": "conversations.read_own",
  "conversations.update_own": "conversations.update_own",
  "messages.create_own": "messages.create_own",
  "messages.read_own": "messages.read_own",
  "tasks.create_own": "tasks.create_own",
  "tasks.read_own": "tasks.read_own",
  "tasks.cancel_own": "tasks.cancel_own",
  "tasks.retry_own": "tasks.retry_own",
  "sources.read_own": "sources.read_own",
  "results.read_own": "results.read_own",
  // Aggregate, content-free queue/system health for administrators only.
  "diagnostics.read": "diagnostics.read",
} as const;

export type NexusPermission = (typeof NEXUS_PERMISSIONS)[keyof typeof NEXUS_PERMISSIONS];

const ROLE_PERMISSIONS: Record<NexusRole, readonly NexusPermission[]> = {
  knowledge_reader: [
    NEXUS_PERMISSIONS["nexus.access"],
    NEXUS_PERMISSIONS["knowledge.read"],
    NEXUS_PERMISSIONS["task.history.read_own"],
    NEXUS_PERMISSIONS["sources.read"],
    NEXUS_PERMISSIONS["conversations.create"],
    NEXUS_PERMISSIONS["conversations.read_own"],
    NEXUS_PERMISSIONS["conversations.update_own"],
    NEXUS_PERMISSIONS["messages.create_own"],
    NEXUS_PERMISSIONS["messages.read_own"],
    NEXUS_PERMISSIONS["tasks.create_own"],
    NEXUS_PERMISSIONS["tasks.read_own"],
    NEXUS_PERMISSIONS["tasks.cancel_own"],
    NEXUS_PERMISSIONS["tasks.retry_own"],
    NEXUS_PERMISSIONS["sources.read_own"],
    NEXUS_PERMISSIONS["results.read_own"],
  ],
  // nexus_admin governs identity (users + roles) and content-free diagnostics.
  // It deliberately does NOT receive any *_own or *_all private-content
  // permission: being an administrator never grants reading other users' chats.
  nexus_admin: [
    NEXUS_PERMISSIONS["nexus.access"],
    NEXUS_PERMISSIONS["users.read"],
    NEXUS_PERMISSIONS["users.approve"],
    NEXUS_PERMISSIONS["users.suspend"],
    NEXUS_PERMISSIONS["roles.manage"],
    NEXUS_PERMISSIONS["identity.audit.read"],
    NEXUS_PERMISSIONS["diagnostics.read"],
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
