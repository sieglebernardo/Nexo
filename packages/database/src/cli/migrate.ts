import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import { runMigrations } from "../migrate.js";

const environmentFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(environmentFile)) {
  loadEnvFile(environmentFile);
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: databaseUrl });
const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));

try {
  await runMigrations(pool, migrationsDirectory);
} finally {
  await pool.end();
}
