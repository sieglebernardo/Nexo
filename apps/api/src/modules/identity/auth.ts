import {
  authAccounts,
  authSessions,
  authVerifications,
  type DatabaseConnection,
  users,
} from "@nexo/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { v7 as uuidv7 } from "uuid";

import type { ApiConfig } from "../../config.js";
import type { EmailDelivery } from "./email.js";

type CreateAuthOptions = Readonly<{
  config: ApiConfig;
  database: DatabaseConnection;
  emailDelivery: EmailDelivery;
}>;

export function createAuth({ config, database, emailDelivery }: CreateAuthOptions) {
  return betterAuth({
    advanced: {
      database: {
        generateId: () => uuidv7(),
      },
      ipAddress: {
        ipAddressHeaders: ["x-nexo-client-ip"],
      },
      useSecureCookies: config.secureCookies,
    },
    appName: "Nexo",
    baseURL: config.authBaseUrl,
    database: drizzleAdapter(database.db, {
      provider: "pg",
      schema: {
        account: authAccounts,
        session: authSessions,
        user: users,
        verification: authVerifications,
      },
    }),
    emailAndPassword: {
      autoSignIn: false,
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 10,
      requireEmailVerification: true,
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendOnSignIn: true,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await emailDelivery.sendVerificationEmail({ name: user.name, to: user.email, url });
      },
    },
    rateLimit: {
      customRules: {
        "/send-verification-email": { max: 5, window: 60 },
        "/sign-in/email": { max: 10, window: 60 },
        "/sign-up/email": { max: 5, window: 60 },
      },
      enabled: true,
      max: 100,
      storage: "memory",
      window: 60,
    },
    secret: config.authSecret,
    session: {
      cookieCache: {
        enabled: false,
      },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: [config.webOrigin],
  });
}

export type NexoAuth = ReturnType<typeof createAuth>;
