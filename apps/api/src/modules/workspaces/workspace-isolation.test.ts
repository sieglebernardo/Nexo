import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { type DatabaseConnection, schema } from "@nexo/database";
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

const alice: AuthenticatedUser = {
  email: "alice@example.com",
  emailVerified: true,
  id: uuidv7(),
  name: "Alice Owner",
};
const bob: AuthenticatedUser = {
  email: "bob@example.com",
  emailVerified: true,
  id: uuidv7(),
  name: "Bob Member",
};
const usersByHeader = new Map([
  ["alice", alice],
  ["bob", bob],
]);

class CapturingEmailDelivery implements EmailDelivery {
  readonly invitations: WorkspaceInvitationEmail[] = [];

  async sendVerificationEmail(): Promise<void> {}

  async sendWorkspaceInvitation(message: WorkspaceInvitationEmail): Promise<void> {
    this.invitations.push(message);
  }
}

describe("workspace tenant isolation", () => {
  let app: FastifyInstance;
  let pglite: PGlite;
  let emailDelivery: CapturingEmailDelivery;

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
    const db = drizzle({ client: pglite, schema });
    const database = {
      close: async () => pglite.close(),
      db: db as unknown as DatabaseConnection["db"],
      ping: async () => {
        await pglite.query("select 1");
      },
      pool: {} as DatabaseConnection["pool"],
    } satisfies DatabaseConnection;
    emailDelivery = new CapturingEmailDelivery();

    await db.insert(schema.users).values(
      [alice, bob].map((user) => ({
        createdAt: new Date(),
        email: user.email,
        emailVerified: true,
        id: user.id,
        name: user.name,
        updatedAt: new Date(),
      })),
    );

    app = await createApp({
      config,
      database,
      emailDelivery,
      logger: false,
      sessionResolver: async (request) => {
        const user = usersByHeader.get(String(request.headers["x-test-user"]));
        if (!user) {
          throw new Error("Test user header is missing");
        }
        return user;
      },
    });
  });

  afterEach(async () => {
    await app.close();
    await pglite.close();
  });

  it("allows invited collaboration without exposing unrelated workspaces", async () => {
    const aliceWorkspaceResponse = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { companyName: "Alice Co", name: "Alice Studio", timezone: "America/Sao_Paulo" },
      url: "/api/v1/workspaces",
    });
    const bobWorkspaceResponse = await app.inject({
      headers: { "x-test-user": "bob" },
      method: "POST",
      payload: { companyName: "Bob Co", name: "Bob Private", timezone: "UTC" },
      url: "/api/v1/workspaces",
    });
    expect(aliceWorkspaceResponse.statusCode).toBe(201);
    expect(bobWorkspaceResponse.statusCode).toBe(201);
    const aliceWorkspace = aliceWorkspaceResponse.json<{ id: string; membershipId: string }>();
    const bobWorkspace = bobWorkspaceResponse.json<{ id: string }>();

    const bobBeforeInvite = await app.inject({
      headers: { "x-test-user": "bob" },
      method: "GET",
      url: `/api/v1/workspaces/${aliceWorkspace.id}/members`,
    });
    const aliceReadsBob = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "GET",
      url: `/api/v1/workspaces/${bobWorkspace.id}/members`,
    });
    expect(bobBeforeInvite.statusCode).toBe(404);
    expect(aliceReadsBob.statusCode).toBe(404);

    const inviteResponse = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { email: bob.email, role: "member" },
      url: `/api/v1/workspaces/${aliceWorkspace.id}/invitations`,
    });
    expect(inviteResponse.statusCode).toBe(201);
    expect(emailDelivery.invitations).toHaveLength(1);
    const invitationUrl = new URL(emailDelivery.invitations[0]?.url ?? "");
    const token = new URLSearchParams(invitationUrl.hash.slice(1)).get("invitation");
    expect(token).toBeTruthy();

    const acceptResponse = await app.inject({
      headers: { "x-test-user": "bob" },
      method: "POST",
      payload: { token },
      url: "/api/v1/invitations/accept",
    });
    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.json()).toMatchObject({ id: aliceWorkspace.id, role: "member" });

    const bobReadsSharedWorkspace = await app.inject({
      headers: { "x-test-user": "bob" },
      method: "GET",
      url: `/api/v1/workspaces/${aliceWorkspace.id}/members`,
    });
    expect(bobReadsSharedWorkspace.statusCode).toBe(200);
    expect(bobReadsSharedWorkspace.json<{ members: unknown[] }>().members).toHaveLength(2);

    const bobMembership = bobReadsSharedWorkspace
      .json<{ members: Array<{ email: string; id: string }> }>()
      .members.find((member) => member.email === bob.email);
    expect(bobMembership).toBeDefined();
    const deactivateResponse = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      url: `/api/v1/workspaces/${aliceWorkspace.id}/members/${bobMembership?.id}/deactivate`,
    });
    expect(deactivateResponse.statusCode).toBe(200);

    const bobAfterDeactivation = await app.inject({
      headers: { "x-test-user": "bob" },
      method: "GET",
      url: `/api/v1/workspaces/${aliceWorkspace.id}/members`,
    });
    expect(bobAfterDeactivation.statusCode).toBe(404);

    const ownerSelfDeactivation = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      url: `/api/v1/workspaces/${aliceWorkspace.id}/members/${aliceWorkspace.membershipId}/deactivate`,
    });
    expect(ownerSelfDeactivation.statusCode).toBe(403);
  });

  it("binds an invitation to the verified recipient email", async () => {
    const workspaceResponse = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { companyName: "Email Co", name: "Email Bound", timezone: "UTC" },
      url: "/api/v1/workspaces",
    });
    const workspace = workspaceResponse.json<{ id: string }>();
    await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { email: bob.email, role: "member" },
      url: `/api/v1/workspaces/${workspace.id}/invitations`,
    });
    const invitationUrl = new URL(emailDelivery.invitations[0]?.url ?? "");
    const token = new URLSearchParams(invitationUrl.hash.slice(1)).get("invitation");

    const wrongRecipient = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { token },
      url: "/api/v1/invitations/accept",
    });
    expect(wrongRecipient.statusCode).toBe(403);
    expect(wrongRecipient.json()).toMatchObject({ code: "invitation_email_mismatch" });
  });

  it("keeps task board visibility settings owner-only and tenant-scoped", async () => {
    const aliceWorkspaceResponse = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { companyName: "Board Co", name: "Board Settings", timezone: "UTC" },
      url: "/api/v1/workspaces",
    });
    const bobWorkspaceResponse = await app.inject({
      headers: { "x-test-user": "bob" },
      method: "POST",
      payload: { companyName: "Bob Board Co", name: "Bob Board", timezone: "UTC" },
      url: "/api/v1/workspaces",
    });
    const aliceWorkspace = aliceWorkspaceResponse.json<{ id: string }>();
    const bobWorkspace = bobWorkspaceResponse.json<{ id: string }>();

    const defaultSettings = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "GET",
      url: `/api/v1/workspaces/${aliceWorkspace.id}/settings`,
    });
    expect(defaultSettings.statusCode).toBe(200);
    expect(defaultSettings.json()).toEqual({ taskBoardVisibility: "collaborative" });

    const crossWorkspaceRead = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "GET",
      url: `/api/v1/workspaces/${bobWorkspace.id}/settings`,
    });
    expect(crossWorkspaceRead.statusCode).toBe(404);

    await app.inject({
      headers: { "x-test-user": "alice" },
      method: "POST",
      payload: { email: bob.email, role: "member" },
      url: `/api/v1/workspaces/${aliceWorkspace.id}/invitations`,
    });
    const invitationUrl = new URL(emailDelivery.invitations[0]?.url ?? "");
    await app.inject({
      headers: { "x-test-user": "bob" },
      method: "POST",
      payload: { token: new URLSearchParams(invitationUrl.hash.slice(1)).get("invitation") },
      url: "/api/v1/invitations/accept",
    });

    const memberRead = await app.inject({
      headers: { "x-test-user": "bob" },
      method: "GET",
      url: `/api/v1/workspaces/${aliceWorkspace.id}/settings`,
    });
    const memberWrite = await app.inject({
      headers: { "x-test-user": "bob" },
      method: "PATCH",
      payload: { taskBoardVisibility: "private" },
      url: `/api/v1/workspaces/${aliceWorkspace.id}/settings`,
    });
    expect(memberRead.statusCode).toBe(403);
    expect(memberWrite.statusCode).toBe(403);

    const ownerWrite = await app.inject({
      headers: { "x-test-user": "alice" },
      method: "PATCH",
      payload: { taskBoardVisibility: "private" },
      url: `/api/v1/workspaces/${aliceWorkspace.id}/settings`,
    });
    expect(ownerWrite.statusCode).toBe(200);
    expect(ownerWrite.json()).toEqual({ taskBoardVisibility: "private" });
  });
});
