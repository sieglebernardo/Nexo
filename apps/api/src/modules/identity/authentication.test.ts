import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { type DatabaseConnection, schema } from "@nexo/database";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import type { ApiConfig } from "../../config.js";
import type { EmailDelivery, VerificationEmail } from "./email.js";

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

class CapturingEmailDelivery implements EmailDelivery {
  readonly verifications: VerificationEmail[] = [];

  async sendVerificationEmail(message: VerificationEmail): Promise<void> {
    this.verifications.push(message);
  }

  async sendWorkspaceInvitation(): Promise<void> {}
}

describe("verified email authentication", () => {
  let app: FastifyInstance;
  let pglite: PGlite;
  let emailDelivery: CapturingEmailDelivery;

  beforeEach(async () => {
    pglite = new PGlite();
    const migration = await readFile(
      new URL(
        "../../../../../packages/database/migrations/0001_identity_workspace.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await pglite.exec(migration);
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
    app = await createApp({ config, database, emailDelivery, logger: false });
  });

  afterEach(async () => {
    await app.close();
    await pglite.close();
  });

  it("blocks sign-in until verification and then authenticates with an HTTP-only cookie", async () => {
    const credentials = { email: "verified@example.com", password: "correct-horse-battery" };
    const signUp = await app.inject({
      headers: { origin: config.webOrigin },
      method: "POST",
      payload: {
        callbackURL: config.webOrigin,
        ...credentials,
        name: "Verified User",
      },
      url: "/api/auth/sign-up/email",
    });
    expect(signUp.statusCode).toBe(200);
    expect(emailDelivery.verifications).toHaveLength(1);
    expect(signUp.headers["set-cookie"]).toBeUndefined();

    const unverifiedSignIn = await app.inject({
      headers: { origin: config.webOrigin },
      method: "POST",
      payload: credentials,
      url: "/api/auth/sign-in/email",
    });
    expect(unverifiedSignIn.statusCode).toBe(403);

    const verificationUrl = new URL(emailDelivery.verifications[0]?.url ?? "");
    const verification = await app.inject({
      method: "GET",
      url: `${verificationUrl.pathname}${verificationUrl.search}`,
    });
    expect(verification.statusCode).toBe(302);

    const signIn = await app.inject({
      headers: { origin: config.webOrigin },
      method: "POST",
      payload: credentials,
      url: "/api/auth/sign-in/email",
    });
    expect(signIn.statusCode).toBe(200);
    const setCookie = signIn.headers["set-cookie"];
    const setCookieText = Array.isArray(setCookie) ? setCookie.join("\n") : String(setCookie);
    expect(setCookieText).toContain("HttpOnly");
    expect(setCookieText).toContain("SameSite=Lax");
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
    expect(cookie).toBeTruthy();

    const authenticatedRequest = await app.inject({
      headers: { cookie },
      method: "GET",
      url: "/api/v1/workspaces",
    });
    expect(authenticatedRequest.statusCode).toBe(200);
    expect(authenticatedRequest.json()).toEqual({ workspaces: [] });
  });
});
