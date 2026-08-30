export const workspaceRoles = ["owner", "member", "guest"] as const;

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

  return input.actorRole === "owner";
}
