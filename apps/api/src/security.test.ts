import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";

const apps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const config = {
  authBaseUrl: "http://localhost:3000",
  authSecret: "test-secret-that-is-at-least-32-characters",
  databaseUrl: "postgresql://nexo:nexo@localhost:5432/nexo",
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

async function makeApp() {
  const app = await createApp({ config, logger: false });
  apps.push(app);
  return app;
}

describe("request security controls", () => {
  it("rejects cross-origin state-changing API requests", async () => {
    const app = await makeApp();

    const response = await app.inject({
      headers: { origin: "https://evil.example" },
      method: "POST",
      url: "/api/v1/unknown",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "csrf_origin_mismatch" });
  });

  it("also protects authentication state changes", async () => {
    const app = await makeApp();

    const response = await app.inject({
      headers: { origin: "https://evil.example" },
      method: "POST",
      url: "/api/auth/sign-out",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "csrf_origin_mismatch" });
  });

  it("requires a trusted referer when a cookie-bearing request omits origin", async () => {
    const app = await makeApp();

    const response = await app.inject({
      headers: { cookie: "nexo.session_token=fake" },
      method: "POST",
      url: "/api/v1/unknown",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "csrf_origin_required" });
  });
});
