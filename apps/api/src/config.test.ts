import { describe, expect, it } from "vitest";

import { readApiConfig } from "./config.js";

const baseEnvironment = {
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
};

describe("API configuration", () => {
  it("accepts exact local origins in development", () => {
    expect(readApiConfig(baseEnvironment)).toMatchObject({
      authBaseUrl: "http://localhost:3000",
      secureCookies: false,
      webOrigin: "http://localhost:5173",
    });
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

    expect(
      readApiConfig({
        ...baseEnvironment,
        BETTER_AUTH_URL: "https://api.nexo.example",
        NODE_ENV: "production",
        WEB_ORIGIN: "https://nexo.example",
      }).secureCookies,
    ).toBe(true);
  });
});
