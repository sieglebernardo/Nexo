import type { WorkspaceRole } from "../workspaces/authorization.js";

export const projectRoles = ["lead", "contributor", "viewer"] as const;
export type ProjectRole = (typeof projectRoles)[number];

export const projectVisibilities = ["workspace", "private"] as const;
export type ProjectVisibility = (typeof projectVisibilities)[number];

export const projectActions = [
  "project:view",
  "project:contribute",
  "project:manage",
  "project-access:manage",
  "workflow:manage",
] as const;
export type ProjectAction = (typeof projectActions)[number];

export type ProjectAuthorizationContext = Readonly<{
  explicitRole: ProjectRole | null;
  visibility: ProjectVisibility;
  workspaceRole: WorkspaceRole;
}>;

const roleAbilities: Readonly<Record<ProjectRole, ReadonlySet<ProjectAction>>> = {
  lead: new Set(projectActions),
  contributor: new Set(["project:view", "project:contribute"]),
  viewer: new Set(["project:view"]),
};

export function canCreateProject(workspaceRole: WorkspaceRole): boolean {
  return workspaceRole !== "guest";
}

export function effectiveProjectRole(context: ProjectAuthorizationContext): ProjectRole | null {
  if (context.explicitRole) {
    return context.explicitRole;
  }

  if (context.visibility === "workspace" && context.workspaceRole !== "guest") {
    return "viewer";
  }

  return null;
}

export function canAccessProject(
  context: ProjectAuthorizationContext,
  action: ProjectAction,
): boolean {
  const role = effectiveProjectRole(context);
  return role ? roleAbilities[role].has(action) : false;
}

export function projectAbilitiesFor(context: ProjectAuthorizationContext) {
  return {
    canContribute: canAccessProject(context, "project:contribute"),
    canManageAccess: canAccessProject(context, "project-access:manage"),
    canManageProject: canAccessProject(context, "project:manage"),
    canManageWorkflow: canAccessProject(context, "workflow:manage"),
  };
}

export function canAssignProjectRole(
  targetWorkspaceRole: WorkspaceRole,
  projectRole: ProjectRole,
): boolean {
  return !(targetWorkspaceRole === "guest" && projectRole === "lead");
}
