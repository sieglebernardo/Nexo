import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Pool } from "pg";

type AppliedMigration = Readonly<{ checksum: string; name: string }>;

export async function runMigrations(pool: Pool, directory: string): Promise<void> {
  const migrationNames = (await readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  const client = await pool.connect();

  try {
    await client.query("select pg_advisory_lock(hashtext('nexo_schema_migrations'))");
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedResult = await client.query<AppliedMigration>(
      "select name, checksum from schema_migrations order by name",
    );
    const applied = new Map(appliedResult.rows.map((migration) => [migration.name, migration]));

    for (const name of migrationNames) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = applied.get(name);

      if (previous) {
        if (previous.checksum !== checksum) {
          throw new Error(`Applied migration ${name} has changed`);
        }
        continue;
      }

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name, checksum) values ($1, $2)", [
          name,
          checksum,
        ]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('nexo_schema_migrations'))");
    client.release();
  }
}
