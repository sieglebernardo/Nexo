import { describe, expect, it } from "vitest";

import { readApiConfig } from "./config.js";

const baseEnvironment = {
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
};

const productionEnvironment = {
  ...baseEnvironment,
  BETTER_AUTH_URL: "https://api.nexo.example",
  DATABASE_URL: "postgresql://nexo:secret@db.example/nexo?sslmode=require",
  EMAIL_FROM: "Nexo <noreply@nexo.example>",
  NODE_ENV: "production",
  REDIS_URL: "rediss://redis.example",
  SMTP_HOST: "smtp.example",
  SMTP_REQUIRE_TLS: "true",
  WEB_ORIGIN: "https://nexo.example",
};

describe("API configuration", () => {
  it("accepts exact local origins in development", () => {
    expect(readApiConfig(baseEnvironment)).toMatchObject({
      authBaseUrl: "http://localhost:3000",
      secureCookies: false,
      webOrigin: "http://localhost:5173",
    });
  });

  it("uses the hosting provider port before the local API override", () => {
    expect(readApiConfig({ ...baseEnvironment, API_PORT: "3000", PORT: "4311" }).port).toBe(4311);
  });

  it("rejects wildcard or path-based credentialed CORS origins", () => {
    expect(() => readApiConfig({ ...baseEnvironment, WEB_ORIGIN: "*" })).toThrow(
      "WEB_ORIGIN must be a valid absolute URL",
    );
    expect(() =>
      readApiConfig({ ...baseEnvironment, WEB_ORIGIN: "https://nexo.example/app" }),
    ).toThrow("WEB_ORIGIN must be an exact HTTP(S) origin without a path");
  });

  it("requires HTTPS origins and secure cookies in production", () => {
    expect(() => readApiConfig({ ...baseEnvironment, NODE_ENV: "production" })).toThrow(
      "must use HTTPS in production",
    );

    expect(readApiConfig(productionEnvironment).secureCookies).toBe(true);
  });

  it("requires encrypted production dependencies and shared rate limiting", () => {
    expect(() =>
      readApiConfig({ ...productionEnvironment, DATABASE_URL: "postgresql://db/nexo" }),
    ).toThrow("DATABASE_URL must require TLS");
    expect(() =>
      readApiConfig({ ...productionEnvironment, REDIS_URL: "redis://redis.example" }),
    ).toThrow("REDIS_URL must use rediss://");
    expect(() => readApiConfig({ ...productionEnvironment, SMTP_REQUIRE_TLS: undefined })).toThrow(
      "SMTP must use implicit TLS",
    );
  });

  it("accepts Railway private database and Redis references", () => {
    expect(
      readApiConfig({
        ...productionEnvironment,
        DATABASE_URL: "postgresql://postgres:secret@postgres.railway.internal:5432/railway",
        REDIS_URL: "redis://default:secret@redis.railway.internal:6379",
      }),
    ).toMatchObject({
      databaseUrl: "postgresql://postgres:secret@postgres.railway.internal:5432/railway",
      redisUrl: "redis://default:secret@redis.railway.internal:6379",
    });
  });

  it("parses explicitly trusted reverse-proxy networks", () => {
    expect(
      readApiConfig({ ...productionEnvironment, TRUST_PROXY_CIDRS: "10.0.0.0/8, 192.0.2.10" })
        .trustProxy,
    ).toEqual(["10.0.0.0/8", "192.0.2.10"]);
  });
});
