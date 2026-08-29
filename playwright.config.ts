import { defineConfig } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}

const isCi = process.env.CI === "true";

export default defineConfig({
  expect: { timeout: 7_500 },
  forbidOnly: isCi,
  fullyParallel: false,
  outputDir: "test-results",
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  retries: isCi ? 1 : 0,
  testDir: "e2e",
  timeout: 45_000,
  use: {
    baseURL: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -w @nexo/api",
      reuseExistingServer: !isCi,
      timeout: 30_000,
      url: `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/v1/health`,
    },
    {
      command: "npm run dev -w @nexo/web -- --host 0.0.0.0",
      reuseExistingServer: !isCi,
      timeout: 30_000,
      url: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    },
  ],
  workers: 1,
});
