import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { type DatabaseConnection, schema } from "@nexo/database";
import { and, count, eq } from "drizzle-orm";
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
const guest = user("guest@example.com", "Greta Guest");
const usersByHeader = new Map([
  ["alice", alice],
  ["bob", bob],
  ["guest", guest],
]);

function user(email: string, name: string): AuthenticatedUser {
  return { email, emailVerified: true, id: uuidv7(), name };
}

type WorkflowUpdateStatus = Readonly<{
  category: "backlog" | "unstarted" | "started" | "completed" | "canceled";
  color: string;
  id: string;
  isDefault: boolean;
  isRetired: boolean;
  name: string;
}>;

class NoopEmailDelivery implements EmailDelivery {
  async sendVerificationEmail(): Promise<void> {}
  async sendWorkspaceInvitation(): Promise<void> {}
}

describe("project and workflow slice", () => {
  let app: FastifyInstance;
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let workspaceAId: string;
  let workspaceBId: string;
  let teamAId: string;
  let aliceMembershipId: string;
  let bobMembershipAId: string;
  let bobMembershipBId: string;
  let guestMembershipId: string;

  beforeEach(async () => {
    pglite = new PGlite();
    for (const migrationName of [
      "0001_identity_workspace.sql",
      "0002_project_workflow.sql",
      "0003_task_list.sql",
      "0004_kanban_visibility.sql",
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
    teamAId = uuidv7();
    aliceMembershipId = uuidv7();
    bobMembershipAId = uuidv7();
    bobMembershipBId = uuidv7();
    guestMembershipId = uuidv7();
    const now = new Date();
    await db.insert(schema.users).values(
      [alice, bob, guest].map((account) => ({
        createdAt: now,
        email: account.email,
        emailVerified: true,
        id: account.id,
        name: account.name,
        updatedAt: now,
      })),
    );
    await db.insert(schema.workspaces).values([
      { createdAt: now, id: workspaceAId, name: "Alpha", timezone: "UTC", updatedAt: now },
      { createdAt: now, id: workspaceBId, name: "Beta", timezone: "UTC", updatedAt: now },
    ]);
    await db.insert(schema.memberships).values([
      {
        createdAt: now,
        id: aliceMembershipId,
        role: "owner",
        updatedAt: now,
        userId: alice.id,
        workspaceId: workspaceAId,
      },
      {
        createdAt: now,
        id: bobMembershipAId,
        role: "member",
        updatedAt: now,
        userId: bob.id,
        workspaceId: workspaceAId,
      },
      {
        createdAt: now,
        id: guestMembershipId,
        role: "guest",
        updatedAt: now,
        userId: guest.id,
        workspaceId: workspaceAId,
      },
      {
        createdAt: now,
        id: bobMembershipBId,
        role: "owner",
        updatedAt: now,
        userId: bob.id,
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
        id: uuidv7(),
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
        if (!account) {
          throw new Error("Test user header is missing");
        }
        return account;
      },
    });
  });

  afterEach(async () => {
    await app.close();
    await pglite.close();
  });

  it("creates the project, Lead access, workflow, and defaults atomically", async () => {
    const created = await createProject("alice", "NEX", "Nexo", "private");
    expect(created.statusCode).toBe(201);
    const project = created.json<{ effectiveRole: string; id: string; key: string }>();
    expect(project).toMatchObject({ effectiveRole: "lead", key: "NEX" });

    const workflowResponse = await request("alice", "GET", projectUrl(project.id, "/workflow"));
    expect(workflowResponse.statusCode).toBe(200);
    const workflow = workflowResponse.json<{
      statuses: Array<{ category: string; isDefault: boolean; name: string }>;
      version: number;
    }>();
    expect(workflow.version).toBe(1);
    expect(workflow.statuses).toMatchObject([
      { category: "backlog", isDefault: false, name: "Backlog" },
      { category: "unstarted", isDefault: true, name: "To do" },
      { category: "started", isDefault: false, name: "In progress" },
      { category: "completed", isDefault: false, name: "Done" },
      { category: "canceled", isDefault: false, name: "Canceled" },
    ]);
    const removeOnlyLead = await request(
      "alice",
      "DELETE",
      projectUrl(project.id, `/access/${aliceMembershipId}`),
    );
    expect(removeOnlyLead.statusCode).toBe(409);

    await expect(
      db
        .update(schema.projects)
        .set({ projectKey: "NEW" })
        .where(eq(schema.projects.id, project.id)),
    ).rejects.toThrow();
    const persistedKey = await db
      .select({ key: schema.projects.projectKey })
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id));
    expect(persistedKey[0]?.key).toBe("NEX");

    const duplicate = await createProject("alice", "NEX", "Duplicate", "workspace");
    expect(duplicate.statusCode).toBe(409);
    const counts = await db
      .select({ projects: count(schema.projects.id) })
      .from(schema.projects)
      .where(eq(schema.projects.workspaceId, workspaceAId));
    expect(counts[0]?.projects).toBe(1);
  });

  it("keeps private projects hidden until access is explicitly granted", async () => {
    const project = (await createProject("alice", "SEC", "Secret", "private")).json<{
      id: string;
    }>();

    expect((await listProjects("bob")).json<{ projects: unknown[] }>().projects).toHaveLength(0);
    expect((await listProjects("guest")).json<{ projects: unknown[] }>().projects).toHaveLength(0);
    expect((await request("bob", "GET", projectUrl(project.id))).statusCode).toBe(404);

    expect(
      (
        await request("alice", "PUT", projectUrl(project.id, "/access"), {
          membershipId: bobMembershipAId,
          role: "viewer",
        })
      ).statusCode,
    ).toBe(200);
    expect((await listProjects("bob")).json<{ projects: unknown[] }>().projects).toHaveLength(1);
    expect(
      (await request("bob", "PATCH", projectUrl(project.id), { visibility: "workspace" }))
        .statusCode,
    ).toBe(403);

    const guestLead = await request("alice", "PUT", projectUrl(project.id, "/access"), {
      membershipId: guestMembershipId,
      role: "lead",
    });
    expect(guestLead.statusCode).toBe(400);
    expect(
      (
        await request("alice", "PUT", projectUrl(project.id, "/access"), {
          membershipId: guestMembershipId,
          role: "contributor",
        })
      ).statusCode,
    ).toBe(200);
    expect((await listProjects("guest")).json<{ projects: unknown[] }>().projects).toHaveLength(1);
    const guestWorkflow = await request("guest", "GET", projectUrl(project.id, "/workflow"));
    expect(guestWorkflow.statusCode).toBe(200);
    const guestWorkflowBody = guestWorkflow.json<{
      name: string;
      statuses: WorkflowUpdateStatus[];
      version: number;
    }>();
    expect(
      (
        await request("guest", "PUT", projectUrl(project.id, "/workflow"), {
          name: guestWorkflowBody.name,
          statuses: guestWorkflowBody.statuses,
          version: guestWorkflowBody.version,
        })
      ).statusCode,
    ).toBe(403);
    expect((await createProject("guest", "GST", "Guest project", "workspace")).statusCode).toBe(
      403,
    );
  });

  it("gives Members baseline Viewer access but never gives Guests implicit access", async () => {
    const project = (await createProject("alice", "PUB", "Shared", "workspace")).json<{
      id: string;
    }>();
    const bobProjects = (await listProjects("bob")).json<{
      projects: Array<{ effectiveRole: string; explicitRole: string | null }>;
    }>();
    expect(bobProjects.projects).toMatchObject([{ effectiveRole: "viewer", explicitRole: null }]);
    expect((await listProjects("guest")).json<{ projects: unknown[] }>().projects).toHaveLength(0);

    const bobAccessAttempt = await request("bob", "GET", projectUrl(project.id, "/access"));
    expect(bobAccessAttempt.statusCode).toBe(403);
    const access = await request("alice", "GET", projectUrl(project.id, "/access"));
    expect(access.statusCode).toBe(200);
    expect(
      access
        .json<{ members: Array<{ effectiveRole: string | null; membershipId: string }> }>()
        .members.find((member) => member.membershipId === guestMembershipId)?.effectiveRole,
    ).toBeNull();
  });

  it("prevents workspace deactivation from orphaning a project without an active Lead", async () => {
    const project = (await createProject("alice", "LEAD", "Lead coverage", "private")).json<{
      id: string;
    }>();
    expect(
      (
        await request("alice", "PUT", projectUrl(project.id, "/access"), {
          membershipId: bobMembershipAId,
          role: "lead",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("alice", "DELETE", projectUrl(project.id, `/access/${aliceMembershipId}`)))
        .statusCode,
    ).toBe(204);

    const deactivate = await request(
      "alice",
      "POST",
      `/api/v1/workspaces/${workspaceAId}/members/${bobMembershipAId}/deactivate`,
    );
    expect(deactivate.statusCode).toBe(409);
    expect(deactivate.json()).toMatchObject({ code: "membership_is_last_project_lead" });
  });

  it("updates a whole workflow with ordering and optimistic version enforcement", async () => {
    const project = (await createProject("alice", "FLOW", "Flow", "private")).json<{
      id: string;
    }>();
    const current = (await request("alice", "GET", projectUrl(project.id, "/workflow"))).json<{
      name: string;
      statuses: WorkflowUpdateStatus[];
      version: number;
    }>();
    const invalidDefault = await request("alice", "PUT", projectUrl(project.id, "/workflow"), {
      name: current.name,
      statuses: current.statuses.map((status) => ({
        ...status,
        isDefault: status.category === "completed",
      })),
      version: current.version,
    });
    expect(invalidDefault.statusCode).toBe(400);
    expect(invalidDefault.json()).toMatchObject({ code: "invalid_workflow" });

    const movingStatus = current.statuses[2];
    const lastStatus = current.statuses[4];
    if (!movingStatus || !lastStatus) {
      throw new Error("Default workflow statuses are missing");
    }
    const reordered = [
      { ...movingStatus, category: "unstarted" as const, isDefault: true, name: "Queued" },
      ...current.statuses
        .filter((_, index) => index !== 2)
        .map((status) => ({ ...status, isDefault: false })),
    ];
    reordered[4] = { ...lastStatus, isDefault: false, isRetired: true };

    const update = await request("alice", "PUT", projectUrl(project.id, "/workflow"), {
      name: "Product delivery",
      statuses: reordered,
      version: current.version,
    });
    expect(update.statusCode).toBe(200);
    const updated = update.json<{
      name: string;
      statuses: Array<{
        category: string;
        isDefault: boolean;
        isRetired: boolean;
        name: string;
        position: number;
      }>;
      version: number;
    }>();
    expect(updated).toMatchObject({ name: "Product delivery", version: 2 });
    expect(updated.statuses[0]).toMatchObject({
      category: "unstarted",
      isDefault: true,
      name: "Queued",
      position: 0,
    });
    expect(updated.statuses[4]).toMatchObject({ isRetired: true, position: 4 });

    const stale = await request("alice", "PUT", projectUrl(project.id, "/workflow"), {
      name: "Stale overwrite",
      statuses: reordered,
      version: current.version,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: "workflow_version_conflict" });
  });

  it("does not disclose projects or accept memberships across workspace boundaries", async () => {
    const project = (await createProject("alice", "ISO", "Isolated", "private")).json<{
      id: string;
    }>();
    const wrongWorkspaceRead = await request(
      "bob",
      "GET",
      `/api/v1/workspaces/${workspaceBId}/projects/${project.id}`,
    );
    expect(wrongWorkspaceRead.statusCode).toBe(404);

    const crossWorkspaceGrant = await request("alice", "PUT", projectUrl(project.id, "/access"), {
      membershipId: bobMembershipBId,
      role: "viewer",
    });
    expect(crossWorkspaceGrant.statusCode).toBe(404);
    const rows = await db
      .select({ membershipId: schema.projectAccess.membershipId })
      .from(schema.projectAccess)
      .where(
        and(
          eq(schema.projectAccess.projectId, project.id),
          eq(schema.projectAccess.membershipId, bobMembershipBId),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  function projectUrl(projectId: string, suffix = "") {
    return `/api/v1/workspaces/${workspaceAId}/projects/${projectId}${suffix}`;
  }

  async function request(
    actor: "alice" | "bob" | "guest",
    method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT",
    url: string,
    payload?: Record<string, unknown>,
  ) {
    if (payload === undefined) {
      return app.inject({ headers: { "x-test-user": actor }, method, url });
    }
    return app.inject({ headers: { "x-test-user": actor }, method, payload, url });
  }

  function createProject(
    actor: "alice" | "bob" | "guest",
    key: string,
    name: string,
    visibility: "private" | "workspace",
  ) {
    return request(actor, "POST", `/api/v1/workspaces/${workspaceAId}/projects`, {
      key,
      name,
      teamId: teamAId,
      visibility,
    });
  }

  function listProjects(actor: "alice" | "bob" | "guest") {
    return request(actor, "GET", `/api/v1/workspaces/${workspaceAId}/projects`);
  }
});
