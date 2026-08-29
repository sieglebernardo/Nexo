import { describe, expect, it } from "vitest";

import { abilitiesFor, canDeactivateMembership, canInviteAs } from "./authorization.js";

describe("workspace authorization", () => {
  it("keeps workspace administration with owners", () => {
    expect(abilitiesFor("owner")["workspace:manage"]).toBe(true);
    expect(abilitiesFor("admin")["workspace:manage"]).toBe(false);
    expect(abilitiesFor("member")["membership:invite"]).toBe(false);
    expect(abilitiesFor("guest")["membership:list"]).toBe(false);
  });

  it("limits the roles an admin can invite", () => {
    expect(canInviteAs("admin", "member")).toBe(true);
    expect(canInviteAs("admin", "guest")).toBe(true);
    expect(canInviteAs("admin", "admin")).toBe(false);
    expect(canInviteAs("owner", "admin")).toBe(true);
    expect(canInviteAs("owner", "owner")).toBe(false);
  });

  it("protects owners, self-deactivation, and peers from admins", () => {
    expect(
      canDeactivateMembership({
        actorMembershipId: "actor",
        actorRole: "admin",
        targetMembershipId: "member",
        targetRole: "member",
      }),
    ).toBe(true);
    expect(
      canDeactivateMembership({
        actorMembershipId: "actor",
        actorRole: "admin",
        targetMembershipId: "admin",
        targetRole: "admin",
      }),
    ).toBe(false);
    expect(
      canDeactivateMembership({
        actorMembershipId: "owner",
        actorRole: "owner",
        targetMembershipId: "owner",
        targetRole: "owner",
      }),
    ).toBe(false);
  });
});
