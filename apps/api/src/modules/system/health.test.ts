import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";

const apps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /api/v1/health", () => {
  it("returns the typed liveness response", async () => {
    const app = await createApp({
      config: {
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
      },
      logger: false,
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ service: "nexo-api", status: "ok" });
    expect(new Date(response.json().timestamp).toString()).not.toBe("Invalid Date");
  });
});
