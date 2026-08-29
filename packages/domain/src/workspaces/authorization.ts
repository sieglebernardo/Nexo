export const workspaceRoles = ["owner", "admin", "member", "guest"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspaceActions = [
  "workspace:view",
  "workspace:manage",
  "team:view",
  "team:manage",
  "membership:list",
  "membership:invite",
  "membership:deactivate",
] as const;

export type WorkspaceAction = (typeof workspaceActions)[number];

const abilities: Readonly<Record<WorkspaceRole, ReadonlySet<WorkspaceAction>>> = {
  owner: new Set(workspaceActions),
  admin: new Set([
    "workspace:view",
    "team:view",
    "team:manage",
    "membership:list",
    "membership:invite",
    "membership:deactivate",
  ]),
  member: new Set(["workspace:view", "team:view", "membership:list"]),
  guest: new Set(["workspace:view"]),
};

export function can(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return abilities[role].has(action);
}

export function abilitiesFor(role: WorkspaceRole): Readonly<Record<WorkspaceAction, boolean>> {
  return Object.fromEntries(
    workspaceActions.map((action) => [action, can(role, action)]),
  ) as Record<WorkspaceAction, boolean>;
}

export function canInviteAs(actorRole: WorkspaceRole, invitedRole: WorkspaceRole): boolean {
  if (!can(actorRole, "membership:invite") || invitedRole === "owner") {
    return false;
  }

  if (actorRole === "admin") {
    return invitedRole === "member" || invitedRole === "guest";
  }

  return actorRole === "owner";
}

export function canDeactivateMembership(
  input: Readonly<{
    actorMembershipId: string;
    actorRole: WorkspaceRole;
    targetMembershipId: string;
    targetRole: WorkspaceRole;
  }>,
): boolean {
  if (
    input.actorMembershipId === input.targetMembershipId ||
    input.targetRole === "owner" ||
    !can(input.actorRole, "membership:deactivate")
  ) {
    return false;
  }

  if (input.actorRole === "admin") {
    return input.targetRole === "member" || input.targetRole === "guest";
  }

  return input.actorRole === "owner";
}
