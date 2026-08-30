import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import type { TaskSummary, Workflow } from "@nexo/contracts";
import { type DatabaseConnection, schema } from "@nexo/database";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { v7 as uuidv7 } from "uuid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import type { ApiConfig } from "../../config.js";
import type { EmailDelivery } from "../identity/email.js";
import type { AuthenticatedUser } from "../identity/session.js";

const config: ApiConfig = {
  authBaseUrl: "http://localhost:3000",
  authSecret: "test-secret-that-is-at-least-32-characters",
  databaseUrl: "postgresql://unused",
  emailFrom: "Nexo <test@nexo.local>",
  host: "127.0.0.1",
  invitationTtlHours: 168,
  port: 3000,
  secureCookies: false,
  smtpHost: "localhost",
  smtpPort: 1025,
  smtpSecure: false,
  webOrigin: "http://localhost:5173",
};

const alice = user("alice@example.com", "Alice Owner");
const bob = user("bob@example.com", "Bob Member");
const charlie = user("charlie@example.com", "Charlie Elsewhere");
const usersByHeader = new Map([
  ["alice", alice],
  ["bob", bob],
  ["charlie", charlie],
]);

function user(email: string, name: string): AuthenticatedUser {
  return { email, emailVerified: true, id: uuidv7(), name };
}

class NoopEmailDelivery implements EmailDelivery {
  async sendVerificationEmail(): Promise<void> {}
  async sendWorkspaceInvitation(): Promise<void> {}
}

describe("task list vertical slice", () => {
  let app: FastifyInstance;
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let workspaceAId: string;
  let workspaceBId: string;
  let teamAId: string;
  let teamBId: string;
  let aliceMembershipId: string;
  let bobMembershipId: string;

  beforeEach(async () => {
    pglite = new PGlite();
    for (const migrationName of [
      "0001_identity_workspace.sql",
      "0002_project_workflow.sql",
      "0003_task_list.sql",
      "0004_kanban_visibility.sql",
      "0005_companies_platform_admin.sql",
    ]) {
      const migration = await readFile(
        new URL(`../../../../../packages/database/migrations/${migrationName}`, import.meta.url),
        "utf8",
      );
      await pglite.exec(migration);
    }
    db = drizzle({ client: pglite, schema });
    const database = {
      close: async () => pglite.close(),
      db: db as unknown as DatabaseConnection["db"],
      ping: async () => {
        await pglite.query("select 1");
      },
      pool: {} as DatabaseConnection["pool"],
    } satisfies DatabaseConnection;

    workspaceAId = uuidv7();
    workspaceBId = uuidv7();
    const companyAId = uuidv7();
    const companyBId = uuidv7();
    teamAId = uuidv7();
    teamBId = uuidv7();
    aliceMembershipId = uuidv7();
    bobMembershipId = uuidv7();
    const now = new Date();
    await db.insert(schema.users).values(
      [alice, bob, charlie].map((account) => ({
        createdAt: now,
        email: account.email,
        emailVerified: true,
        id: account.id,
        name: account.name,
        updatedAt: now,
      })),
    );
    await db.insert(schema.companies).values([
      { createdAt: now, id: companyAId, name: "Alpha Co", updatedAt: now },
      { createdAt: now, id: companyBId, name: "Beta Co", updatedAt: now },
    ]);
    await db.insert(schema.workspaces).values([
      {
        companyId: companyAId,
        createdAt: now,
        id: workspaceAId,
        name: "Alpha",
        timezone: "UTC",
        updatedAt: now,
      },
      {
        companyId: companyBId,
        createdAt: now,
        id: workspaceBId,
        name: "Beta",
        timezone: "UTC",
        updatedAt: now,
      },
    ]);
    await db.insert(schema.companyMemberships).values([
      { companyId: companyAId, createdAt: now, role: "owner", updatedAt: now, userId: alice.id },
      { companyId: companyAId, createdAt: now, role: "member", updatedAt: now, userId: bob.id },
      { companyId: companyBId, createdAt: now, role: "owner", updatedAt: now, userId: charlie.id },
    ]);
    await db.insert(schema.memberships).values([
      {
        createdAt: now,
        companyId: companyAId,
        id: aliceMembershipId,
        role: "owner",
        updatedAt: now,
        userId: alice.id,
        workspaceId: workspaceAId,
      },
      {
        createdAt: now,
        companyId: companyAId,
        id: bobMembershipId,
        role: "member",
        updatedAt: now,
        userId: bob.id,
        workspaceId: workspaceAId,
      },
      {
        createdAt: now,
        companyId: companyBId,
        id: uuidv7(),
        role: "owner",
        updatedAt: now,
        userId: charlie.id,
        workspaceId: workspaceBId,
      },
    ]);
    await db.insert(schema.teams).values([
      {
        createdAt: now,
        id: teamAId,
        isGeneral: true,
        name: "General",
        updatedAt: now,
        workspaceId: workspaceAId,
      },
      {
        createdAt: now,
        id: teamBId,
        isGeneral: true,
        name: "General",
        updatedAt: now,
        workspaceId: workspaceBId,
      },
    ]);

    app = await createApp({
      config,
      database,
      emailDelivery: new NoopEmailDelivery(),
      logger: false,
      sessionResolver: async (request) => {
        const account = usersByHeader.get(String(request.headers["x-test-user"]));
        if (!account) throw new Error("Test user header is missing");
        return account;
      },
    });
  });

  afterEach(async () => {
    await app.close();
    await pglite.close();
  });

  it("creates, edits, transitions, archives, and restores a lightweight task", async () => {
    const project = await createProject("alice", workspaceAId, teamAId, "NEX", "private");
    const workflow = await getWorkflow("alice", workspaceAId, project.id);
    const started = workflow.statuses.find((status) => status.category === "started");
    const completed = workflow.statuses.find((status) => status.category === "completed");
    if (!started || !completed) throw new Error("Expected workflow statuses are missing");

    const createResponse = await request("alice", "POST", tasksUrl(workspaceAId, project.id), {
      dueDate: "2026-09-10",
      title: "  Ship task list  ",
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json<TaskSummary>();
    expect(created).toMatchObject({
      assignee: null,
      archivedAt: null,
      dueDate: "2026-09-10",
      identifier: "NEX-1",
      status: { id: workflow.statuses.find((status) => status.isDefault)?.id },
      title: "Ship task list",
      version: 1,
    });
    expect(Object.keys(created)).not.toContain("description");
    expect(Object.keys(created)).not.toContain("activity");
    expect(Object.keys(created)).not.toContain("comments");

    const renamedResponse = await request(
      "alice",
      "PATCH",
      taskUrl(workspaceAId, project.id, created.id),
      { dueDate: null, title: "Release task list", version: created.version },
    );
    expect(renamedResponse.statusCode).toBe(200);
    const renamed = renamedResponse.json<TaskSummary>();
    expect(renamed).toMatchObject({ dueDate: null, title: "Release task list", version: 2 });
    const staleRename = await request(
      "alice",
      "PATCH",
      taskUrl(workspaceAId, project.id, created.id),
      { title: "Stale overwrite", version: created.version },
    );
    expect(staleRename.statusCode).toBe(409);
    expect(staleRename.json()).toMatchObject({ code: "task_version_conflict" });

    const startedResponse = await request(
      "alice",
      "POST",
      `${taskUrl(workspaceAId, project.id, created.id)}/transition`,
      { statusId: started.id, version: renamed.version },
    );
    expect(startedResponse.statusCode).toBe(200);
    const inProgress = startedResponse.json<TaskSummary>();
    expect(inProgress).toMatchObject({ status: { id: started.id }, version: 3 });

    const completedResponse = await request(
      "alice",
      "POST",
      `${taskUrl(workspaceAId, project.id, created.id)}/transition`,
      { statusId: completed.id, version: inProgress.version },
    );
    const done = completedResponse.json<TaskSummary>();
    expect(completedResponse.statusCode).toBe(200);
    expect(done).toMatchObject({ status: { id: completed.id }, version: 4 });

    const activities = await db
      .select({
        actorMembershipId: schema.taskActivities.actorMembershipId,
        payload: schema.taskActivities.payload,
        schemaVersion: schema.taskActivities.schemaVersion,
        type: schema.taskActivities.type,
      })
      .from(schema.taskActivities)
      .where(eq(schema.taskActivities.taskId, created.id))
      .orderBy(asc(schema.taskActivities.occurredAt), asc(schema.taskActivities.id));
    expect(activities).toEqual([
      {
        actorMembershipId: aliceMembershipId,
        payload: { statusId: created.status.id },
        schemaVersion: 1,
        type: "task-created",
      },
      {
        actorMembershipId: aliceMembershipId,
        payload: { fromStatusId: created.status.id, toStatusId: started.id },
        schemaVersion: 1,
        type: "task-status-changed",
      },
      {
        actorMembershipId: aliceMembershipId,
        payload: { fromStatusId: started.id, toStatusId: completed.id },
        schemaVersion: 1,
        type: "task-completed",
      },
    ]);
    const persisted = await db
      .select({
        completedAt: schema.tasks.completedAt,
        firstStartedAt: schema.tasks.firstStartedAt,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, created.id));
    expect(persisted[0]?.completedAt).toBeInstanceOf(Date);
    expect(persisted[0]?.firstStartedAt).toBeInstanceOf(Date);

    const archiveResponse = await request(
      "alice",
      "POST",
      `${taskUrl(workspaceAId, project.id, created.id)}/archive`,
      { version: done.version },
    );
    const archived = archiveResponse.json<TaskSummary>();
    expect(archiveResponse.statusCode).toBe(200);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.version).toBe(5);
    expect((await listTasks("alice", workspaceAId, project.id)).tasks).toHaveLength(0);
    expect((await listTasks("alice", workspaceAId, project.id, true)).tasks).toHaveLength(1);

    const archivedEdit = await request(
      "alice",
      "PATCH",
      taskUrl(workspaceAId, project.id, created.id),
      { title: "Should fail", version: archived.version },
    );
    expect(archivedEdit.statusCode).toBe(409);
    expect(archivedEdit.json()).toMatchObject({ code: "task_archived" });

    const restoreResponse = await request(
      "alice",
      "POST",
      `${taskUrl(workspaceAId, project.id, created.id)}/restore`,
      { version: archived.version },
    );
    expect(restoreResponse.statusCode).toBe(200);
    expect(restoreResponse.json<TaskSummary>()).toMatchObject({ archivedAt: null, version: 6 });
    expect((await listTasks("alice", workspaceAId, project.id)).tasks).toHaveLength(1);
  });

  it("uses a deterministic cursor without duplicating tasks", async () => {
    const project = await createProject("alice", workspaceAId, teamAId, "PAGE", "private");
    for (const title of ["First", "Second", "Third"]) {
      const response = await request("alice", "POST", tasksUrl(workspaceAId, project.id), {
        title,
      });
      expect(response.statusCode).toBe(201);
    }

    const firstPage = await listTasks("alice", workspaceAId, project.id, false, 2);
    expect(firstPage.tasks.map((task) => task.identifier)).toEqual(["PAGE-3", "PAGE-2"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = await listTasks(
      "alice",
      workspaceAId,
      project.id,
      false,
      2,
      firstPage.nextCursor ?? undefined,
    );
    expect(secondPage.tasks.map((task) => task.identifier)).toEqual(["PAGE-1"]);
    expect(secondPage.nextCursor).toBeNull();

    const invalidCursor = await request(
      "alice",
      "GET",
      `${tasksUrl(workspaceAId, project.id)}?cursor=not-a-cursor`,
    );
    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json()).toMatchObject({ code: "invalid_task_cursor" });
  });

  it("filters private boards by accountable assignee and keeps unassigned tasks hidden", async () => {
    const project = await createProject("alice", workspaceAId, teamAId, "BOARD", "workspace");
    const aliceTaskResponse = await request("alice", "POST", tasksUrl(workspaceAId, project.id), {
      assigneeId: aliceMembershipId,
      title: "Alice task",
    });
    const bobTaskResponse = await request("alice", "POST", tasksUrl(workspaceAId, project.id), {
      assigneeId: bobMembershipId,
      title: "Bob task",
    });
    const unassignedResponse = await request("alice", "POST", tasksUrl(workspaceAId, project.id), {
      title: "Unassigned task",
    });
    expect(aliceTaskResponse.statusCode).toBe(201);
    expect(bobTaskResponse.statusCode).toBe(201);
    expect(unassignedResponse.statusCode).toBe(201);
    expect(aliceTaskResponse.json<TaskSummary>().assignee).toEqual({
      id: aliceMembershipId,
      name: "Alice Owner",
    });

    const collaborativeTasks = await listTasks("bob", workspaceAId, project.id);
    expect(collaborativeTasks.tasks.map((task) => task.title).sort()).toEqual([
      "Alice task",
      "Bob task",
      "Unassigned task",
    ]);
    const assigneeResponse = await request(
      "alice",
      "GET",
      `/api/v1/workspaces/${workspaceAId}/projects/${project.id}/task-assignees`,
    );
    expect(assigneeResponse.statusCode).toBe(200);
    expect(assigneeResponse.json()).toMatchObject({
      assignees: [
        { id: aliceMembershipId, name: "Alice Owner" },
        { id: bobMembershipId, name: "Bob Member" },
      ],
    });
    expect(
      (
        await request(
          "bob",
          "GET",
          `/api/v1/workspaces/${workspaceAId}/projects/${project.id}/task-assignees`,
        )
      ).statusCode,
    ).toBe(403);

    const forbiddenSettingChange = await request(
      "bob",
      "PATCH",
      `/api/v1/workspaces/${workspaceAId}/settings`,
      { taskBoardVisibility: "private" },
    );
    expect(forbiddenSettingChange.statusCode).toBe(403);
    const settingChange = await request(
      "alice",
      "PATCH",
      `/api/v1/workspaces/${workspaceAId}/settings`,
      { taskBoardVisibility: "private" },
    );
    expect(settingChange.statusCode).toBe(200);
    expect(settingChange.json()).toEqual({ taskBoardVisibility: "private" });

    expect(
      (await listTasks("alice", workspaceAId, project.id)).tasks.map((task) => task.title),
    ).toEqual(["Alice task"]);
    expect(
      (await listTasks("bob", workspaceAId, project.id)).tasks.map((task) => task.title),
    ).toEqual(["Bob task"]);

    const aliceTask = aliceTaskResponse.json<TaskSummary>();
    const reassignResponse = await request(
      "alice",
      "PATCH",
      taskUrl(workspaceAId, project.id, aliceTask.id),
      { assigneeId: bobMembershipId, version: aliceTask.version },
    );
    expect(reassignResponse.statusCode).toBe(200);
    expect(reassignResponse.json<TaskSummary>().assignee?.id).toBe(bobMembershipId);
    expect((await listTasks("alice", workspaceAId, project.id)).tasks).toHaveLength(0);
    expect((await listTasks("bob", workspaceAId, project.id)).tasks).toHaveLength(2);

    const assignmentActivity = await db
      .select({ payload: schema.taskActivities.payload, type: schema.taskActivities.type })
      .from(schema.taskActivities)
      .where(eq(schema.taskActivities.taskId, aliceTask.id))
      .orderBy(asc(schema.taskActivities.occurredAt), asc(schema.taskActivities.id));
    expect(assignmentActivity.at(-1)).toEqual({
      payload: {
        fromAssigneeMembershipId: aliceMembershipId,
        toAssigneeMembershipId: bobMembershipId,
      },
      type: "task-assigned",
    });
  });

  it("enforces project roles and workspace isolation on task reads and writes", async () => {
    const privateProject = await createProject("alice", workspaceAId, teamAId, "SEC", "private");
    expect(
      (await request("bob", "GET", tasksUrl(workspaceAId, privateProject.id))).statusCode,
    ).toBe(404);
    const inaccessibleAssignee = await request(
      "alice",
      "POST",
      tasksUrl(workspaceAId, privateProject.id),
      { assigneeId: bobMembershipId, title: "Cannot assign outside project access" },
    );
    expect(inaccessibleAssignee.statusCode).toBe(400);
    expect(inaccessibleAssignee.json()).toMatchObject({ code: "invalid_task_assignee" });

    const sharedProject = await createProject("alice", workspaceAId, teamAId, "SHARE", "workspace");
    const createdResponse = await request(
      "alice",
      "POST",
      tasksUrl(workspaceAId, sharedProject.id),
      { title: "Visible but protected" },
    );
    const created = createdResponse.json<TaskSummary>();
    expect((await request("bob", "GET", tasksUrl(workspaceAId, sharedProject.id))).statusCode).toBe(
      200,
    );
    expect(
      (
        await request("bob", "PATCH", taskUrl(workspaceAId, sharedProject.id, created.id), {
          title: "Viewer overwrite",
          version: created.version,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request("bob", "POST", tasksUrl(workspaceAId, sharedProject.id), {
          title: "Viewer create",
        })
      ).statusCode,
    ).toBe(403);

    const grant = await request(
      "alice",
      "PUT",
      `/api/v1/workspaces/${workspaceAId}/projects/${sharedProject.id}/access`,
      { membershipId: bobMembershipId, role: "contributor" },
    );
    expect(grant.statusCode).toBe(200);
    expect(
      (
        await request("bob", "POST", tasksUrl(workspaceAId, sharedProject.id), {
          title: "Contributor create",
        })
      ).statusCode,
    ).toBe(201);

    const otherProject = await createProject("alice", workspaceAId, teamAId, "OTHER", "private");
    const otherWorkflow = await getWorkflow("alice", workspaceAId, otherProject.id);
    const foreignStatus = otherWorkflow.statuses.find((status) => status.isDefault);
    if (!foreignStatus) throw new Error("Other workflow default status is missing");
    const crossProjectTransition = await request(
      "alice",
      "POST",
      `${taskUrl(workspaceAId, sharedProject.id, created.id)}/transition`,
      { statusId: foreignStatus.id, version: created.version },
    );
    expect(crossProjectTransition.statusCode).toBe(400);
    expect(crossProjectTransition.json()).toMatchObject({ code: "invalid_task_status" });

    expect(
      (await request("charlie", "GET", tasksUrl(workspaceBId, sharedProject.id))).statusCode,
    ).toBe(404);
    const projectB = await createProject("charlie", workspaceBId, teamBId, "BETA", "private");
    const crossWorkspaceWrite = await request(
      "charlie",
      "PATCH",
      taskUrl(workspaceBId, projectB.id, created.id),
      { title: "Cross-tenant overwrite", version: created.version },
    );
    expect(crossWorkspaceWrite.statusCode).toBe(404);
    expect(crossWorkspaceWrite.json()).toMatchObject({ code: "task_not_found" });

    const persisted = await db
      .select({ title: schema.tasks.title })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, created.id));
    expect(persisted[0]?.title).toBe("Visible but protected");
  });

  async function request(
    actor: "alice" | "bob" | "charlie",
    method: "GET" | "PATCH" | "POST" | "PUT",
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      headers: { "x-test-user": actor },
      method,
      ...(payload === undefined ? {} : { payload }),
      url,
    });
  }

  async function createProject(
    actor: "alice" | "charlie",
    workspaceId: string,
    teamId: string,
    key: string,
    visibility: "private" | "workspace",
  ) {
    const response = await request(actor, "POST", `/api/v1/workspaces/${workspaceId}/projects`, {
      key,
      name: `${key} project`,
      teamId,
      visibility,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>();
  }

  async function getWorkflow(actor: "alice", workspaceId: string, projectId: string) {
    const response = await request(
      actor,
      "GET",
      `/api/v1/workspaces/${workspaceId}/projects/${projectId}/workflow`,
    );
    expect(response.statusCode).toBe(200);
    return response.json<Workflow>();
  }

  async function listTasks(
    actor: "alice" | "bob",
    workspaceId: string,
    projectId: string,
    archived = false,
    limit = 50,
    cursor?: string,
  ) {
    const query = new URLSearchParams({ archived: String(archived), limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    const response = await request(actor, "GET", `${tasksUrl(workspaceId, projectId)}?${query}`);
    expect(response.statusCode).toBe(200);
    return response.json<{ nextCursor: string | null; tasks: TaskSummary[] }>();
  }

  function tasksUrl(workspaceId: string, projectId: string) {
    return `/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`;
  }

  function taskUrl(workspaceId: string, projectId: string, taskId: string) {
    return `${tasksUrl(workspaceId, projectId)}/${taskId}`;
  }
});
