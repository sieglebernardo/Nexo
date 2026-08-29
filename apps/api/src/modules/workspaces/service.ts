import { createHash, randomBytes } from "node:crypto";

import {
  type DatabaseConnection,
  invitations,
  memberships,
  projectAccess,
  projects,
  teams,
  users,
  workspaces,
} from "@nexo/database";
import {
  can,
  canCreateProject,
  canDeactivateMembership,
  canInviteAs,
  type WorkspaceAction,
  type WorkspaceRole,
} from "@nexo/domain";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { ApiConfig } from "../../config.js";
import type { EmailDelivery } from "../identity/email.js";
import type { AuthenticatedUser } from "../identity/session.js";
import { ApiProblem } from "../shared/api-problem.js";

type ActorMembership = Readonly<{
  id: string;
  role: WorkspaceRole;
}>;

function workspaceAbilities(role: WorkspaceRole) {
  return {
    canCreateProjects: canCreateProject(role),
    canDeactivateMembers: can(role, "membership:deactivate"),
    canInviteMembers: can(role, "membership:invite"),
    canListMembers: can(role, "membership:list"),
    canManageTeams: can(role, "team:manage"),
    canManageWorkspace: can(role, "workspace:manage"),
    canViewTeams: can(role, "team:view"),
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class WorkspaceService {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly emailDelivery: EmailDelivery,
    private readonly config: ApiConfig,
  ) {}

  async listWorkspaces(userId: string) {
    const rows = await this.database.db
      .select({
        generalTeamId: teams.id,
        id: workspaces.id,
        membershipId: memberships.id,
        name: workspaces.name,
        role: memberships.role,
        timezone: workspaces.timezone,
      })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .innerJoin(teams, and(eq(teams.workspaceId, workspaces.id), eq(teams.isGeneral, true)))
      .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt)))
      .orderBy(workspaces.name, workspaces.id);

    return rows.map((workspace) => {
      const abilities = workspaceAbilities(workspace.role);
      return {
        ...workspace,
        abilities,
        generalTeamId: abilities.canViewTeams ? workspace.generalTeamId : null,
      };
    });
  }

  async createWorkspace(userId: string, input: Readonly<{ name: string; timezone: string }>) {
    const name = input.name.trim();
    const timezone = input.timezone.trim();
    const now = new Date();

    if (name.length === 0) {
      throw new ApiProblem(400, "invalid_workspace_name", "Workspace name is required");
    }

    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now);
    } catch {
      throw new ApiProblem(400, "invalid_timezone", "Timezone must be a valid IANA timezone");
    }

    const workspace = await this.database.db.transaction(async (transaction) => {
      const workspaceId = uuidv7();
      const membershipId = uuidv7();
      const generalTeamId = uuidv7();

      await transaction.insert(workspaces).values({
        createdAt: now,
        id: workspaceId,
        name,
        timezone,
        updatedAt: now,
      });
      await transaction.insert(memberships).values({
        createdAt: now,
        id: membershipId,
        role: "owner",
        updatedAt: now,
        userId,
        workspaceId,
      });
      await transaction.insert(teams).values({
        createdAt: now,
        id: generalTeamId,
        isGeneral: true,
        name: "General",
        updatedAt: now,
        workspaceId,
      });

      return {
        abilities: workspaceAbilities("owner"),
        generalTeamId,
        id: workspaceId,
        membershipId,
        name,
        role: "owner" as const,
        timezone,
      };
    });

    return workspace;
  }

  async getSettings(userId: string, workspaceId: string) {
    await this.requireOwner(userId, workspaceId);
    const rows = await this.database.db
      .select({ taskBoardVisibility: workspaces.taskBoardVisibility })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const settings = rows[0];
    if (!settings) {
      throw new ApiProblem(404, "workspace_not_found", "Workspace was not found");
    }
    return settings;
  }

  async updateSettings(
    userId: string,
    workspaceId: string,
    input: Readonly<{ taskBoardVisibility: "collaborative" | "private" }>,
  ) {
    await this.requireOwner(userId, workspaceId);
    const rows = await this.database.db
      .update(workspaces)
      .set({ taskBoardVisibility: input.taskBoardVisibility, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning({ taskBoardVisibility: workspaces.taskBoardVisibility });
    const settings = rows[0];
    if (!settings) {
      throw new ApiProblem(404, "workspace_not_found", "Workspace was not found");
    }
    return settings;
  }

  async listMembers(userId: string, workspaceId: string) {
    await this.requireActor(userId, workspaceId, "membership:list");

    return this.database.db
      .select({
        deactivatedAt: memberships.deactivatedAt,
        email: users.email,
        id: memberships.id,
        name: users.name,
        role: memberships.role,
        userId: users.id,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, workspaceId))
      .orderBy(memberships.createdAt, memberships.id);
  }

  async listInvitations(userId: string, workspaceId: string) {
    await this.requireActor(userId, workspaceId, "membership:invite");
    const now = new Date();

    return this.database.db
      .select({
        email: invitations.email,
        expiresAt: invitations.expiresAt,
        id: invitations.id,
        role: invitations.role,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.workspaceId, workspaceId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .orderBy(invitations.createdAt, invitations.id);
  }

  async inviteMember(
    actorUser: AuthenticatedUser,
    workspaceId: string,
    input: Readonly<{ email: string; role: WorkspaceRole }>,
  ) {
    const actor = await this.requireActor(actorUser.id, workspaceId, "membership:invite");
    if (!canInviteAs(actor.role, input.role)) {
      throw new ApiProblem(403, "role_not_assignable", "You cannot invite this workspace role");
    }

    const email = normalizeEmail(input.email);
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashInvitationToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.invitationTtlHours * 60 * 60 * 1_000);

    const result = await this.database.db.transaction(async (transaction) => {
      const existingMember = await transaction
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(users.email, email),
            isNull(memberships.deactivatedAt),
          ),
        )
        .limit(1);

      if (existingMember.length > 0) {
        throw new ApiProblem(409, "already_a_member", "This user is already a workspace member");
      }

      const workspaceRows = await transaction
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      const workspace = workspaceRows[0];
      if (!workspace) {
        throw new ApiProblem(404, "workspace_not_found", "Workspace was not found");
      }

      const pending = await transaction
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.workspaceId, workspaceId),
            eq(invitations.email, email),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .limit(1);
      const invitationId = pending[0]?.id ?? uuidv7();

      if (pending.length > 0) {
        await transaction
          .update(invitations)
          .set({
            expiresAt,
            invitedByMembershipId: actor.id,
            role: input.role,
            tokenHash,
            updatedAt: now,
          })
          .where(eq(invitations.id, invitationId));
      } else {
        await transaction.insert(invitations).values({
          createdAt: now,
          email,
          expiresAt,
          id: invitationId,
          invitedByMembershipId: actor.id,
          role: input.role,
          tokenHash,
          updatedAt: now,
          workspaceId,
        });
      }

      return { invitationId, workspaceName: workspace.name };
    });

    await this.emailDelivery.sendWorkspaceInvitation({
      invitedByName: actorUser.name,
      role: input.role,
      to: email,
      url: `${this.config.webOrigin}/?invitation=${encodeURIComponent(rawToken)}`,
      workspaceName: result.workspaceName,
    });

    return { email, expiresAt, id: result.invitationId, role: input.role };
  }

  async acceptInvitation(user: AuthenticatedUser, token: string) {
    const tokenHash = hashInvitationToken(token);
    const now = new Date();

    return this.database.db.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          email: invitations.email,
          expiresAt: invitations.expiresAt,
          id: invitations.id,
          role: invitations.role,
          timezone: workspaces.timezone,
          workspaceId: invitations.workspaceId,
          workspaceName: workspaces.name,
        })
        .from(invitations)
        .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
        .where(
          and(
            eq(invitations.tokenHash, tokenHash),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .limit(1);
      const invitation = rows[0];

      if (!invitation || invitation.expiresAt <= now) {
        throw new ApiProblem(404, "invitation_not_found", "Invitation is invalid or expired");
      }
      if (normalizeEmail(user.email) !== invitation.email) {
        throw new ApiProblem(
          403,
          "invitation_email_mismatch",
          "Sign in with the email address that received this invitation",
        );
      }

      const existingRows = await transaction
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(eq(memberships.workspaceId, invitation.workspaceId), eq(memberships.userId, user.id)),
        )
        .limit(1);
      const membershipId = existingRows[0]?.id ?? uuidv7();

      if (existingRows.length > 0) {
        await transaction
          .update(memberships)
          .set({
            deactivatedAt: null,
            deactivatedByMembershipId: null,
            role: invitation.role,
            updatedAt: now,
          })
          .where(eq(memberships.id, membershipId));
      } else {
        await transaction.insert(memberships).values({
          createdAt: now,
          id: membershipId,
          role: invitation.role,
          updatedAt: now,
          userId: user.id,
          workspaceId: invitation.workspaceId,
        });
      }

      const accepted = await transaction
        .update(invitations)
        .set({ acceptedAt: now, acceptedByMembershipId: membershipId, updatedAt: now })
        .where(
          and(
            eq(invitations.id, invitation.id),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .returning({ id: invitations.id });

      if (accepted.length !== 1) {
        throw new ApiProblem(409, "invitation_already_used", "Invitation was already accepted");
      }

      const generalTeamRows = await transaction
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.workspaceId, invitation.workspaceId), eq(teams.isGeneral, true)))
        .limit(1);
      const generalTeam = generalTeamRows[0];
      if (!generalTeam) {
        throw new Error("Workspace is missing its General team");
      }

      return {
        abilities: workspaceAbilities(invitation.role),
        generalTeamId: can(invitation.role, "team:view") ? generalTeam.id : null,
        id: invitation.workspaceId,
        membershipId,
        name: invitation.workspaceName,
        role: invitation.role,
        timezone: invitation.timezone,
      };
    });
  }

  async deactivateMember(userId: string, workspaceId: string, targetMembershipId: string) {
    const actor = await this.requireActor(userId, workspaceId, "membership:deactivate");
    const targets = await this.database.db
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.id, targetMembershipId),
          eq(memberships.workspaceId, workspaceId),
          isNull(memberships.deactivatedAt),
        ),
      )
      .limit(1);
    const target = targets[0];

    if (!target) {
      throw new ApiProblem(404, "membership_not_found", "Active membership was not found");
    }
    if (
      !canDeactivateMembership({
        actorMembershipId: actor.id,
        actorRole: actor.role,
        targetMembershipId: target.id,
        targetRole: target.role,
      })
    ) {
      throw new ApiProblem(403, "membership_protected", "This membership cannot be deactivated");
    }

    const ledProjects = await this.database.db
      .select({ id: projects.id })
      .from(projectAccess)
      .innerJoin(
        projects,
        and(eq(projects.id, projectAccess.projectId), eq(projects.workspaceId, workspaceId)),
      )
      .where(
        and(
          eq(projectAccess.workspaceId, workspaceId),
          eq(projectAccess.membershipId, targetMembershipId),
          eq(projectAccess.role, "lead"),
        ),
      );
    for (const project of ledProjects) {
      const otherLeads = await this.database.db
        .select({ id: projectAccess.membershipId })
        .from(projectAccess)
        .innerJoin(
          memberships,
          and(
            eq(memberships.id, projectAccess.membershipId),
            eq(memberships.workspaceId, projectAccess.workspaceId),
            isNull(memberships.deactivatedAt),
          ),
        )
        .where(
          and(
            eq(projectAccess.projectId, project.id),
            eq(projectAccess.role, "lead"),
            ne(projectAccess.membershipId, targetMembershipId),
          ),
        )
        .limit(1);
      if (otherLeads.length === 0) {
        throw new ApiProblem(
          409,
          "membership_is_last_project_lead",
          "Assign another Lead to every project this member leads before deactivating them",
        );
      }
    }

    const now = new Date();
    await this.database.db
      .update(memberships)
      .set({ deactivatedAt: now, deactivatedByMembershipId: actor.id, updatedAt: now })
      .where(
        and(
          eq(memberships.id, targetMembershipId),
          eq(memberships.workspaceId, workspaceId),
          isNull(memberships.deactivatedAt),
        ),
      );

    return { deactivatedAt: now };
  }

  private async requireActor(
    userId: string,
    workspaceId: string,
    action: WorkspaceAction,
  ): Promise<ActorMembership> {
    const rows = await this.database.db
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, userId),
          isNull(memberships.deactivatedAt),
        ),
      )
      .limit(1);
    const actor = rows[0];

    if (!actor) {
      throw new ApiProblem(404, "workspace_not_found", "Workspace was not found");
    }
    if (!can(actor.role, action)) {
      throw new ApiProblem(403, "forbidden", "You do not have permission for this action");
    }

    return actor;
  }

  private async requireOwner(userId: string, workspaceId: string): Promise<ActorMembership> {
    const actor = await this.requireActor(userId, workspaceId, "workspace:manage");
    if (actor.role !== "owner") {
      throw new ApiProblem(403, "forbidden", "Only the workspace owner can manage settings");
    }
    return actor;
  }
}
