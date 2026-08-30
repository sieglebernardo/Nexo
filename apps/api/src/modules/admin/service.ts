import {
  administrativeAuditLogs,
  companies,
  companyMemberships,
  type DatabaseConnection,
  platformAdmins,
  projects,
  tasks,
  users,
  workflows,
  workspaces,
} from "@nexo/database";
import { asc, count, desc, eq, ilike } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { ApiProblem } from "../shared/api-problem.js";

export class AdminService {
  constructor(private readonly database: DatabaseConnection) {}

  async requirePlatformAdmin(userId: string): Promise<void> {
    const grant = await this.database.db
      .select({ userId: platformAdmins.userId })
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, userId))
      .limit(1);
    if (!grant[0]) {
      throw new ApiProblem(403, "forbidden", "You do not have permission for this action");
    }
  }

  async listCompanies(
    userId: string,
    input: Readonly<{ limit: number; offset: number; search?: string }>,
  ) {
    await this.requirePlatformAdmin(userId);
    const search = input.search?.trim();
    const condition = search
      ? ilike(companies.name, `%${search.replace(/[%_\\]/g, "\\$&")}%`)
      : undefined;
    const totalRows = await this.database.db
      .select({ value: count() })
      .from(companies)
      .where(condition);
    const rows = await this.database.db
      .select({
        createdAt: companies.createdAt,
        id: companies.id,
        name: companies.name,
        requiresReview: companies.requiresReview,
        workspaceCount: count(workspaces.id),
      })
      .from(companies)
      .leftJoin(workspaces, eq(workspaces.companyId, companies.id))
      .where(condition)
      .groupBy(companies.id)
      .orderBy(asc(companies.name), asc(companies.id))
      .limit(input.limit)
      .offset(input.offset);
    const total = totalRows[0]?.value ?? 0;
    return {
      companies: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      nextOffset: input.offset + rows.length < total ? input.offset + rows.length : null,
      total,
    };
  }

  async getCompany(userId: string, companyId: string) {
    await this.requirePlatformAdmin(userId);
    const company = await this.getCompanyRow(companyId);
    const [
      companyUsers,
      companyWorkspaces,
      companyProjects,
      companyWorkflows,
      companyTasks,
      auditLog,
    ] = await Promise.all([
      this.database.db
        .select({
          email: users.email,
          id: users.id,
          name: users.name,
          role: companyMemberships.role,
        })
        .from(companyMemberships)
        .innerJoin(users, eq(users.id, companyMemberships.userId))
        .where(eq(companyMemberships.companyId, companyId))
        .orderBy(asc(users.name), asc(users.id)),
      this.database.db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          taskBoardVisibility: workspaces.taskBoardVisibility,
          timezone: workspaces.timezone,
        })
        .from(workspaces)
        .where(eq(workspaces.companyId, companyId))
        .orderBy(asc(workspaces.name), asc(workspaces.id)),
      this.database.db
        .select({
          id: projects.id,
          key: projects.projectKey,
          name: projects.name,
          workspaceId: projects.workspaceId,
        })
        .from(projects)
        .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
        .where(eq(workspaces.companyId, companyId))
        .orderBy(asc(projects.name), asc(projects.id)),
      this.database.db
        .select({
          id: workflows.id,
          name: workflows.name,
          projectId: workflows.projectId,
          workspaceId: workflows.workspaceId,
        })
        .from(workflows)
        .innerJoin(workspaces, eq(workspaces.id, workflows.workspaceId))
        .where(eq(workspaces.companyId, companyId))
        .orderBy(asc(workflows.name), asc(workflows.id)),
      this.database.db
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          title: tasks.title,
          workspaceId: tasks.workspaceId,
        })
        .from(tasks)
        .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
        .where(eq(workspaces.companyId, companyId))
        .orderBy(desc(tasks.createdAt), desc(tasks.id))
        .limit(100),
      this.database.db
        .select({
          action: administrativeAuditLogs.action,
          adminName: users.name,
          occurredAt: administrativeAuditLogs.occurredAt,
        })
        .from(administrativeAuditLogs)
        .innerJoin(users, eq(users.id, administrativeAuditLogs.adminUserId))
        .where(eq(administrativeAuditLogs.companyId, companyId))
        .orderBy(desc(administrativeAuditLogs.occurredAt), desc(administrativeAuditLogs.id))
        .limit(50),
    ]);
    return {
      auditLog: auditLog.map((entry) => ({ ...entry, occurredAt: entry.occurredAt.toISOString() })),
      company: { ...company, createdAt: company.createdAt.toISOString() },
      projects: companyProjects,
      tasks: companyTasks,
      users: companyUsers as Array<{
        email: string;
        id: string;
        name: string;
        role: "owner" | "member";
      }>,
      workflows: companyWorkflows,
      workspaces: companyWorkspaces,
    };
  }

  async updateCompany(userId: string, companyId: string, input: Readonly<{ name: string }>) {
    await this.requirePlatformAdmin(userId);
    const name = input.name.trim();
    if (!name) throw new ApiProblem(400, "invalid_company_name", "Company name is required");
    await this.getCompanyRow(companyId);
    const now = new Date();
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .update(companies)
        .set({ name, updatedAt: now })
        .where(eq(companies.id, companyId));
      await transaction.insert(administrativeAuditLogs).values({
        action: "company.name_updated",
        adminUserId: userId,
        companyId,
        details: { name },
        id: uuidv7(),
        occurredAt: now,
      });
    });
    return this.getCompany(userId, companyId);
  }

  private async getCompanyRow(companyId: string) {
    const rows = await this.database.db
      .select({
        createdAt: companies.createdAt,
        id: companies.id,
        name: companies.name,
        requiresReview: companies.requiresReview,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    const company = rows[0];
    if (!company) throw new ApiProblem(404, "company_not_found", "Company was not found");
    return company;
  }
}
