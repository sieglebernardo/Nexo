import { describe, expect, it } from "vitest";

import {
  canAccessProject,
  canAssignProjectRole,
  canCreateProject,
  effectiveProjectRole,
  projectAbilitiesFor,
} from "./authorization.js";

describe("project authorization", () => {
  it("gives non-guests baseline Viewer access only to workspace-visible projects", () => {
    expect(
      effectiveProjectRole({
        explicitRole: null,
        visibility: "workspace",
        workspaceRole: "member",
      }),
    ).toBe("viewer");
    expect(
      effectiveProjectRole({ explicitRole: null, visibility: "private", workspaceRole: "owner" }),
    ).toBeNull();
    expect(
      effectiveProjectRole({ explicitRole: null, visibility: "workspace", workspaceRole: "guest" }),
    ).toBeNull();
  });

  it("uses explicit Lead, Contributor, and Viewer roles as the project authority", () => {
    expect(
      projectAbilitiesFor({ explicitRole: "lead", visibility: "private", workspaceRole: "member" }),
    ).toEqual({
      canContribute: true,
      canManageAccess: true,
      canManageProject: true,
      canManageWorkflow: true,
    });
    expect(
      canAccessProject(
        { explicitRole: "contributor", visibility: "private", workspaceRole: "guest" },
        "project:contribute",
      ),
    ).toBe(true);
    expect(
      canAccessProject(
        { explicitRole: "viewer", visibility: "private", workspaceRole: "admin" },
        "workflow:manage",
      ),
    ).toBe(false);
  });

  it("allows non-guests to create projects and prevents Guest Leads", () => {
    expect(canCreateProject("owner")).toBe(true);
    expect(canCreateProject("admin")).toBe(true);
    expect(canCreateProject("member")).toBe(true);
    expect(canCreateProject("guest")).toBe(false);
    expect(canAssignProjectRole("guest", "lead")).toBe(false);
    expect(canAssignProjectRole("guest", "contributor")).toBe(true);
  });
});
