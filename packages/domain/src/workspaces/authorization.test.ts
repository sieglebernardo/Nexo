import { describe, expect, it } from "vitest";

import { abilitiesFor, canDeactivateMembership, canInviteAs } from "./authorization.js";

describe("workspace authorization", () => {
  it("keeps workspace administration with owners", () => {
    expect(abilitiesFor("owner")["workspace:manage"]).toBe(true);
    expect(abilitiesFor("member")["membership:invite"]).toBe(false);
    expect(abilitiesFor("guest")["membership:list"]).toBe(false);
  });

  it("lets owners invite workspace members", () => {
    expect(canInviteAs("owner", "member")).toBe(true);
    expect(canInviteAs("owner", "guest")).toBe(true);
    expect(canInviteAs("owner", "owner")).toBe(false);
  });

  it("protects owners and self-deactivation", () => {
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
