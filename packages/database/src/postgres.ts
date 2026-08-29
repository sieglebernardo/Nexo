import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

export type DatabaseConnection = Readonly<{
  db: NodePgDatabase<typeof schema>;
  pool: Pool;
  close: () => Promise<void>;
  ping: () => Promise<void>;
}>;

export function createDatabase(connectionString: string): DatabaseConnection {
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema });

  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
    ping: async () => {
      await pool.query("select 1");
    },
  };
}
