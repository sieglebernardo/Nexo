import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { type DatabaseConnection, schema } from "@nexo/database";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { v7 as uuidv7 } from "uuid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import type { ApiConfig } from "../../config.js";
import type { EmailDelivery, WorkspaceInvitationEmail } from "../identity/email.js";
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

const alice = account("alice@example.com", "Alice Owner");
const bob = account("bob@example.com", "Bob Member");
const operator = account("operator@example.com", "Platform Operator");
const usersByHeader = new Map([
  ["alice", alice],
  ["bob", bob],
  ["operator", operator],
]);

function account(email: string, name: string): AuthenticatedUser {
  return { email, emailVerified: true, id: uuidv7(), name };
}

class CapturingEmail implements EmailDelivery {
  invitations: WorkspaceInvitationEmail[] = [];
  async sendVerificationEmail(): Promise<void> {}
  async sendWorkspaceInvitation(message: WorkspaceInvitationEmail): Promise<void> {
    this.invitations.push(message);
  }
}

describe("platform administration and company isolation", () => {
  let app: FastifyInstance;
  let database: DatabaseConnection;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let email: CapturingEmail;
  let pglite: PGlite;

  beforeEach(async () => {
    pglite = new PGlite();
    for (const migrationName of [
      "0001_identity_workspace.sql",
      "0002_project_workflow.sql",
      "0003_task_list.sql",
      "0004_kanban_visibility.sql",
      "0005_companies_platform_admin.sql",
    ]) {
      await pglite.exec(
        await readFile(
          new URL(`../../../../../packages/database/migrations/${migrationName}`, import.meta.url),
          "utf8",
        ),
      );
    }
    db = drizzle({ client: pglite, schema });
    database = {
      close: async () => pglite.close(),
      db: db as unknown as DatabaseConnection["db"],
      ping: async () => {
        await pglite.query("select 1");
      },
      pool: {} as DatabaseConnection["pool"],
    };
    const now = new Date();
    await db
      .insert(schema.users)
      .values([alice, bob, operator].map((user) => ({ ...user, createdAt: now, updatedAt: now })));
    email = new CapturingEmail();
    app = await createApp({
      config,
      database,
      emailDelivery: email,
      logger: false,
      sessionResolver: async (request) => {
        const user = usersByHeader.get(String(request.headers["x-test-user"]));
        if (!user) throw new Error("Test user header is missing");
        return user;
      },
    });
  });

  afterEach(async () => {
    await app.close();
    await pglite.close();
  });

  it("creates a company during onboarding and invitation acceptance inherits it", async () => {
    const create = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { companyName: "Acme", name: "Product", timezone: "UTC" },
      url: "/api/v1/workspaces",
    });
    expect(create.statusCode).toBe(201);
    const workspace = create.json<{ id: string }>();
    const companyRows = await db
      .select({ companyId: schema.workspaces.companyId })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspace.id));
    const companyId = companyRows[0]?.companyId;
    expect(companyId).toBeTruthy();

    await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { email: bob.email, role: "member" },
      url: `/api/v1/workspaces/${workspace.id}/invitations`,
    });
    const invitationUrl = new URL(email.invitations[0]?.url ?? "");
    const token = new URLSearchParams(invitationUrl.hash.slice(1)).get("invitation");
    const accepted = await app.inject({
      headers: { "x-test-user": "bob" },
      method: "POST",
      payload: { token },
      url: "/api/v1/invitations/accept",
    });
    expect(accepted.statusCode).toBe(200);
    const bobCompanyMembership = await db
      .select({ companyId: schema.companyMemberships.companyId })
      .from(schema.companyMemberships)
      .where(eq(schema.companyMemberships.userId, bob.id));
    expect(bobCompanyMembership).toEqual([{ companyId }]);
  });

  it("blocks owners and manipulated requests from platform admin APIs", async () => {
    const workspace = await createWorkspace("alice", "Acme");
    const companyRows = await db
      .select({ companyId: schema.workspaces.companyId })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspace.id));
    const companyId = companyRows[0]?.companyId;
    if (!companyId) throw new Error("Expected company");

    for (const request of [
      { method: "GET" as const, url: "/api/v1/admin/session" },
      { method: "GET" as const, url: "/api/v1/admin/companies" },
      { method: "GET" as const, url: `/api/v1/admin/companies/${companyId}` },
      {
        method: "PATCH" as const,
        payload: { name: "Manipulated name" },
        url: `/api/v1/admin/companies/${companyId}`,
      },
    ]) {
      const direct = await app.inject({ headers: { "x-test-user": "alice" }, ...request });
      expect(direct.statusCode).toBe(403);
      expect(direct.json()).toEqual({
        code: "forbidden",
        message: "You do not have permission for this action",
      });
    }

    const escalation = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { companyName: "Ignored", isAdmin: true, name: "Ignored", timezone: "UTC" },
      url: "/api/v1/workspaces",
    });
    expect(escalation.statusCode).toBe(201);
    const grants = await db.select().from(schema.platformAdmins);
    expect(grants).toEqual([]);
    expect(workspace.id).toBeTruthy();
  });

  it("allows a trusted platform grant to list and manage companies with an audit record", async () => {
    const workspace = await createWorkspace("alice", "Acme");
    const company = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .innerJoin(schema.workspaces, eq(schema.workspaces.companyId, schema.companies.id))
      .where(eq(schema.workspaces.id, workspace.id));
    const companyId = company[0]?.id;
    if (!companyId) throw new Error("Expected company");
    await db.insert(schema.platformAdmins).values({
      grantedAt: new Date(),
      grantedBy: "test",
      userId: operator.id,
    });

    const list = await app.inject({
      headers: { "x-test-user": "operator" },
      method: "GET",
      url: "/api/v1/admin/companies?search=Acme",
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ companies: Array<{ id: string }> }>().companies).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: companyId })]),
    );
    const update = await app.inject({
      headers: { "x-test-user": "operator" },
      method: "PATCH",
      payload: { name: "Acme Renamed" },
      url: `/api/v1/admin/companies/${companyId}`,
    });
    expect(update.statusCode).toBe(200);
    expect(
      update.json<{ company: { name: string }; auditLog: Array<{ action: string }> }>(),
    ).toMatchObject({
      auditLog: [expect.objectContaining({ action: "company.name_updated" })],
      company: { name: "Acme Renamed" },
    });
  });

  async function createWorkspace(actor: string, companyName: string) {
    const response = await app.inject({
      headers: { "x-test-user": actor },
      method: "POST",
      payload: { companyName, name: `${companyName} Workspace`, timezone: "UTC" },
      url: "/api/v1/workspaces",
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>();
  }
});
