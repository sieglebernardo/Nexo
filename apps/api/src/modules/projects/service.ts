import {
  type DatabaseConnection,
  memberships,
  projectAccess,
  projects,
  teams,
  users,
  workflowStatuses,
  workflows,
} from "@nexo/database";
import {
  canAccessProject,
  canAssignProjectRole,
  canCreateProject,
  effectiveProjectRole,
  type ProjectAction,
  type ProjectRole,
  type ProjectVisibility,
  projectAbilitiesFor,
  type StatusCategory,
  type WorkspaceRole,
  workflowConfigurationError,
} from "@nexo/domain";
import { and, asc, count, eq, isNull, or, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { ApiProblem } from "../shared/api-problem.js";

type ActorMembership = Readonly<{
  id: string;
  role: WorkspaceRole;
}>;

type ProjectRow = Readonly<{
  explicitRole: ProjectRole | null;
  id: string;
  key: string;
  name: string;
  teamId: string;
  teamName: string;
  visibility: ProjectVisibility;
  workspaceId: string;
}>;

type WorkflowUpdate = Readonly<{
  name: string;
  statuses: ReadonlyArray<{
    category: StatusCategory;
    color: string;
    id: string;
    isDefault: boolean;
    isRetired: boolean;
    name: string;
  }>;
  version: number;
}>;

const defaultStatuses = [
  { category: "backlog", color: "#8B95A1", isDefault: false, name: "Backlog" },
  { category: "unstarted", color: "#6B7BE9", isDefault: true, name: "To do" },
  { category: "started", color: "#E59B3B", isDefault: false, name: "In progress" },
  { category: "completed", color: "#36A269", isDefault: false, name: "Done" },
  { category: "canceled", color: "#B26B72", isDefault: false, name: "Canceled" },
] as const;

function isUniqueViolation(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 5 && candidate; depth += 1) {
    if (
      (typeof candidate === "object" && "code" in candidate && candidate.code === "23505") ||
      String(candidate).includes("duplicate key")
    ) {
      return true;
    }
    candidate = typeof candidate === "object" && "cause" in candidate ? candidate.cause : undefined;
  }
  return false;
}

function toProjectSummary(row: ProjectRow, workspaceRole: WorkspaceRole) {
  const context = {
    explicitRole: row.explicitRole,
    visibility: row.visibility,
    workspaceRole,
  };
  const effectiveRole = effectiveProjectRole(context);
  if (!effectiveRole) {
    throw new Error("A project summary cannot be created without project access");
  }

  return {
    abilities: projectAbilitiesFor(context),
    effectiveRole,
    explicitRole: row.explicitRole,
    id: row.id,
    key: row.key,
    name: row.name,
    teamId: row.teamId,
    teamName: row.teamName,
    visibility: row.visibility,
    workspaceId: row.workspaceId,
  };
}

export class ProjectService {
  constructor(private readonly database: DatabaseConnection) {}

  async listProjects(userId: string, workspaceId: string) {
    const actor = await this.requireWorkspaceActor(userId, workspaceId);
    const accessCondition = eq(projectAccess.membershipId, actor.id);
    const visibilityCondition =
      actor.role === "guest"
        ? accessCondition
        : or(eq(projects.visibility, "workspace"), accessCondition);

    const rows = await this.database.db
      .select({
        explicitRole: projectAccess.role,
        id: projects.id,
        key: projects.projectKey,
        name: projects.name,
        teamId: projects.teamId,
        teamName: teams.name,
        visibility: projects.visibility,
        workspaceId: projects.workspaceId,
      })
      .from(projects)
      .innerJoin(teams, and(eq(teams.id, projects.teamId), eq(teams.workspaceId, workspaceId)))
      .leftJoin(
        projectAccess,
        and(
          eq(projectAccess.projectId, projects.id),
          eq(projectAccess.workspaceId, workspaceId),
          accessCondition,
        ),
      )
      .where(and(eq(projects.workspaceId, workspaceId), visibilityCondition))
      .orderBy(asc(projects.name), asc(projects.id));

    return rows.map((row) => toProjectSummary(row, actor.role));
  }

  async createProject(
    userId: string,
    workspaceId: string,
    input: Readonly<{
      key: string;
      name: string;
      teamId: string;
      visibility: ProjectVisibility;
    }>,
  ) {
    const actor = await this.requireWorkspaceActor(userId, workspaceId);
    if (!canCreateProject(actor.role)) {
      throw new ApiProblem(403, "project_creation_forbidden", "Guests cannot create projects");
    }

    const name = input.name.trim();
    const key = input.key.trim();
    if (name.length === 0) {
      throw new ApiProblem(400, "invalid_project_name", "Project name is required");
    }
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) {
      throw new ApiProblem(
        400,
        "invalid_project_key",
        "Project key must be 2–10 uppercase letters or numbers and start with a letter",
      );
    }
    const teamRows = await this.database.db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId)))
      .limit(1);
    const team = teamRows[0];
    if (!team) {
      throw new ApiProblem(404, "team_not_found", "Team was not found");
    }

    const now = new Date();
    try {
      const project = await this.database.db.transaction(async (transaction) => {
        const projectId = uuidv7();
        const workflowId = uuidv7();

        await transaction.insert(projects).values({
          createdAt: now,
          createdByMembershipId: actor.id,
          id: projectId,
          name,
          projectKey: key,
          teamId: team.id,
          updatedAt: now,
          visibility: input.visibility,
          workspaceId,
        });
        await transaction.insert(projectAccess).values({
          createdAt: now,
          grantedByMembershipId: actor.id,
          membershipId: actor.id,
          projectId,
          role: "lead",
          updatedAt: now,
          workspaceId,
        });
        await transaction.insert(workflows).values({
          createdAt: now,
          id: workflowId,
          name: `${name} workflow`,
          projectId,
          updatedAt: now,
          version: 1,
          workspaceId,
        });
        await transaction.insert(workflowStatuses).values(
          defaultStatuses.map((status, position) => ({
            ...status,
            createdAt: now,
            id: uuidv7(),
            sortOrder: position,
            updatedAt: now,
            workflowId,
            workspaceId,
          })),
        );

        return toProjectSummary(
          {
            explicitRole: "lead",
            id: projectId,
            key,
            name,
            teamId: team.id,
            teamName: team.name,
            visibility: input.visibility,
            workspaceId,
          },
          actor.role,
        );
      });

      return project;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiProblem(
          409,
          "project_key_conflict",
          "That project key is already used in this workspace",
        );
      }
      throw error;
    }
  }

  async getProject(userId: string, workspaceId: string, projectId: string) {
    const { actor, project } = await this.requireProject(
      userId,
      workspaceId,
      projectId,
      "project:view",
    );
    return toProjectSummary(project, actor.role);
  }

  async updateProject(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: Readonly<{ name?: string; visibility?: ProjectVisibility }>,
  ) {
    const { actor } = await this.requireProject(userId, workspaceId, projectId, "project:manage");
    const name = input.name?.trim();
    if (name !== undefined && name.length === 0) {
      throw new ApiProblem(400, "invalid_project_name", "Project name is required");
    }
    const updatedRows = await this.database.db
      .update(projects)
      .set({
        ...(name === undefined ? {} : { name }),
        ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
      .returning({
        id: projects.id,
        key: projects.projectKey,
        name: projects.name,
        teamId: projects.teamId,
        visibility: projects.visibility,
        workspaceId: projects.workspaceId,
      });
    const updated = updatedRows[0];
    if (!updated) {
      throw new ApiProblem(404, "project_not_found", "Project was not found");
    }
    const teamRows = await this.database.db
      .select({ name: teams.name })
      .from(teams)
      .where(and(eq(teams.id, updated.teamId), eq(teams.workspaceId, workspaceId)))
      .limit(1);
    const team = teamRows[0];
    if (!team) {
      throw new Error("Project team is missing");
    }

    return toProjectSummary({ ...updated, explicitRole: "lead", teamName: team.name }, actor.role);
  }

  async listProjectAccess(userId: string, workspaceId: string, projectId: string) {
    const { project } = await this.requireProject(
      userId,
      workspaceId,
      projectId,
      "project-access:manage",
    );
    const rows = await this.database.db
      .select({
        email: users.email,
        membershipId: memberships.id,
        name: users.name,
        projectRole: projectAccess.role,
        userId: users.id,
        workspaceRole: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(
        projectAccess,
        and(eq(projectAccess.projectId, projectId), eq(projectAccess.membershipId, memberships.id)),
      )
      .where(and(eq(memberships.workspaceId, workspaceId), isNull(memberships.deactivatedAt)))
      .orderBy(asc(users.name), asc(memberships.id));

    return rows.map((member) => ({
      ...member,
      effectiveRole: effectiveProjectRole({
        explicitRole: member.projectRole,
        visibility: project.visibility,
        workspaceRole: member.workspaceRole,
      }),
    }));
  }

  async setProjectAccess(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: Readonly<{ membershipId: string; role: ProjectRole }>,
  ) {
    const { actor } = await this.requireProject(
      userId,
      workspaceId,
      projectId,
      "project-access:manage",
    );
    const targetRows = await this.database.db
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.id, input.membershipId),
          eq(memberships.workspaceId, workspaceId),
          isNull(memberships.deactivatedAt),
        ),
      )
      .limit(1);
    const target = targetRows[0];
    if (!target) {
      throw new ApiProblem(404, "membership_not_found", "Active membership was not found");
    }
    if (!canAssignProjectRole(target.role, input.role)) {
      throw new ApiProblem(400, "guest_lead_forbidden", "Guests cannot be Project Leads");
    }

    const now = new Date();
    await this.database.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select id from projects where id = ${projectId} and workspace_id = ${workspaceId} for update`,
      );
      const existingRows = await transaction
        .select({ role: projectAccess.role })
        .from(projectAccess)
        .where(
          and(
            eq(projectAccess.projectId, projectId),
            eq(projectAccess.membershipId, input.membershipId),
          ),
        )
        .limit(1);
      if (existingRows[0]?.role === "lead" && input.role !== "lead") {
        await this.ensureAnotherLead(transaction, projectId, input.membershipId);
      }

      await transaction
        .insert(projectAccess)
        .values({
          createdAt: now,
          grantedByMembershipId: actor.id,
          membershipId: input.membershipId,
          projectId,
          role: input.role,
          updatedAt: now,
          workspaceId,
        })
        .onConflictDoUpdate({
          set: { grantedByMembershipId: actor.id, role: input.role, updatedAt: now },
          target: [projectAccess.projectId, projectAccess.membershipId],
        });
    });

    return { membershipId: input.membershipId, role: input.role };
  }

  async removeProjectAccess(
    userId: string,
    workspaceId: string,
    projectId: string,
    targetMembershipId: string,
  ) {
    await this.requireProject(userId, workspaceId, projectId, "project-access:manage");

    await this.database.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select id from projects where id = ${projectId} and workspace_id = ${workspaceId} for update`,
      );
      const existingRows = await transaction
        .select({ role: projectAccess.role })
        .from(projectAccess)
        .where(
          and(
            eq(projectAccess.projectId, projectId),
            eq(projectAccess.membershipId, targetMembershipId),
            eq(projectAccess.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new ApiProblem(404, "project_access_not_found", "Project access was not found");
      }
      if (existing.role === "lead") {
        await this.ensureAnotherLead(transaction, projectId, targetMembershipId);
      }
      await transaction
        .delete(projectAccess)
        .where(
          and(
            eq(projectAccess.projectId, projectId),
            eq(projectAccess.membershipId, targetMembershipId),
            eq(projectAccess.workspaceId, workspaceId),
          ),
        );
    });
  }

  async getWorkflow(userId: string, workspaceId: string, projectId: string) {
    await this.requireProject(userId, workspaceId, projectId, "project:view");
    return this.loadWorkflow(workspaceId, projectId);
  }

  async updateWorkflow(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: WorkflowUpdate,
  ) {
    await this.requireProject(userId, workspaceId, projectId, "workflow:manage");
    const configurationError = workflowConfigurationError(input.name, input.statuses);
    if (configurationError) {
      throw new ApiProblem(400, "invalid_workflow", configurationError);
    }

    await this.database.db.transaction(async (transaction) => {
      const workflowRows = await transaction
        .select({ id: workflows.id })
        .from(workflows)
        .where(and(eq(workflows.projectId, projectId), eq(workflows.workspaceId, workspaceId)))
        .limit(1);
      const workflow = workflowRows[0];
      if (!workflow) {
        throw new ApiProblem(404, "workflow_not_found", "Workflow was not found");
      }
      const existingStatuses = await transaction
        .select({ id: workflowStatuses.id, retiredAt: workflowStatuses.retiredAt })
        .from(workflowStatuses)
        .where(eq(workflowStatuses.workflowId, workflow.id));
      const existingIds = new Set(existingStatuses.map((status) => status.id));
      const retirementById = new Map(
        existingStatuses.map((status) => [status.id, status.retiredAt] as const),
      );
      if (
        existingIds.size !== input.statuses.length ||
        input.statuses.some((status) => !existingIds.has(status.id))
      ) {
        throw new ApiProblem(
          400,
          "workflow_status_set_mismatch",
          "The workflow update must include every existing status exactly once",
        );
      }

      const now = new Date();
      const claimed = await transaction
        .update(workflows)
        .set({ name: input.name.trim(), updatedAt: now, version: input.version + 1 })
        .where(
          and(
            eq(workflows.id, workflow.id),
            eq(workflows.workspaceId, workspaceId),
            eq(workflows.version, input.version),
          ),
        )
        .returning({ id: workflows.id });
      if (claimed.length !== 1) {
        throw new ApiProblem(
          409,
          "workflow_version_conflict",
          "The workflow changed since you loaded it. Refresh and try again",
        );
      }

      await transaction
        .update(workflowStatuses)
        .set({
          isDefault: false,
          sortOrder: sql`${workflowStatuses.sortOrder} + 1000`,
          updatedAt: now,
        })
        .where(eq(workflowStatuses.workflowId, workflow.id));

      for (const [position, status] of input.statuses.entries()) {
        await transaction
          .update(workflowStatuses)
          .set({
            category: status.category,
            color: status.color.toUpperCase(),
            isDefault: status.isDefault,
            name: status.name.trim(),
            retiredAt: status.isRetired ? (retirementById.get(status.id) ?? now) : null,
            sortOrder: position,
            updatedAt: now,
          })
          .where(
            and(eq(workflowStatuses.id, status.id), eq(workflowStatuses.workflowId, workflow.id)),
          );
      }
    });

    return this.loadWorkflow(workspaceId, projectId);
  }

  private async ensureAnotherLead(
    transaction: Parameters<Parameters<DatabaseConnection["db"]["transaction"]>[0]>[0],
    projectId: string,
    excludedMembershipId: string,
  ) {
    const leadRows = await transaction
      .select({ value: count() })
      .from(projectAccess)
      .innerJoin(
        memberships,
        and(
          eq(memberships.id, projectAccess.membershipId),
          eq(memberships.workspaceId, projectAccess.workspaceId),
        ),
      )
      .where(
        and(
          eq(projectAccess.projectId, projectId),
          eq(projectAccess.role, "lead"),
          isNull(memberships.deactivatedAt),
          sql`${projectAccess.membershipId} <> ${excludedMembershipId}`,
        ),
      );
    if ((leadRows[0]?.value ?? 0) < 1) {
      throw new ApiProblem(409, "last_project_lead", "A project must keep at least one Lead");
    }
  }

  private async loadWorkflow(workspaceId: string, projectId: string) {
    const workflowRows = await this.database.db
      .select({
        id: workflows.id,
        name: workflows.name,
        projectId: workflows.projectId,
        version: workflows.version,
      })
      .from(workflows)
      .where(and(eq(workflows.projectId, projectId), eq(workflows.workspaceId, workspaceId)))
      .limit(1);
    const workflow = workflowRows[0];
    if (!workflow) {
      throw new ApiProblem(404, "workflow_not_found", "Workflow was not found");
    }
    const statuses = await this.database.db
      .select({
        category: workflowStatuses.category,
        color: workflowStatuses.color,
        id: workflowStatuses.id,
        isDefault: workflowStatuses.isDefault,
        name: workflowStatuses.name,
        position: workflowStatuses.sortOrder,
        retiredAt: workflowStatuses.retiredAt,
      })
      .from(workflowStatuses)
      .where(
        and(
          eq(workflowStatuses.workflowId, workflow.id),
          eq(workflowStatuses.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(workflowStatuses.sortOrder), asc(workflowStatuses.id));

    return {
      ...workflow,
      statuses: statuses.map(({ retiredAt, ...status }) => ({
        ...status,
        isRetired: retiredAt !== null,
      })),
    };
  }

  private async requireWorkspaceActor(
    userId: string,
    workspaceId: string,
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
    return actor;
  }

  private async requireProject(
    userId: string,
    workspaceId: string,
    projectId: string,
    action: ProjectAction,
  ): Promise<{ actor: ActorMembership; project: ProjectRow }> {
    const actor = await this.requireWorkspaceActor(userId, workspaceId);
    const rows = await this.database.db
      .select({
        explicitRole: projectAccess.role,
        id: projects.id,
        key: projects.projectKey,
        name: projects.name,
        teamId: projects.teamId,
        teamName: teams.name,
        visibility: projects.visibility,
        workspaceId: projects.workspaceId,
      })
      .from(projects)
      .innerJoin(teams, and(eq(teams.id, projects.teamId), eq(teams.workspaceId, workspaceId)))
      .leftJoin(
        projectAccess,
        and(
          eq(projectAccess.projectId, projects.id),
          eq(projectAccess.workspaceId, workspaceId),
          eq(projectAccess.membershipId, actor.id),
        ),
      )
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
      .limit(1);
    const project = rows[0];
    if (!project) {
      throw new ApiProblem(404, "project_not_found", "Project was not found");
    }
    const context = {
      explicitRole: project.explicitRole,
      visibility: project.visibility,
      workspaceRole: actor.role,
    };
    if (!canAccessProject(context, "project:view")) {
      throw new ApiProblem(404, "project_not_found", "Project was not found");
    }
    if (!canAccessProject(context, action)) {
      throw new ApiProblem(403, "forbidden", "You do not have permission for this action");
    }

    return { actor, project };
  }
}
