import { eq } from "drizzle-orm";

import { createDatabase } from "../postgres.js";
import { platformAdmins, users } from "../schema/index.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  throw new Error("Usage: npm run admin:grant -w @nexo/database -- person@example.com");
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const database = createDatabase(databaseUrl);
try {
  const account = await database.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = account[0];
  if (!user) throw new Error(`No user exists for ${email}`);
  await database.db
    .insert(platformAdmins)
    .values({ grantedAt: new Date(), grantedBy: "trusted-cli", userId: user.id })
    .onConflictDoNothing();
  process.stdout.write(`Platform administrator granted to ${email}.\n`);
} finally {
  await database.close();
}
