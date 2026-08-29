export type ApiConfig = Readonly<{
  authBaseUrl: string;
  authSecret: string;
  databaseUrl: string;
  emailFrom: string;
  host: string;
  invitationTtlHours: number;
  port: number;
  secureCookies: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  webOrigin: string;
}>;

function readExactOrigin(value: string, variableName: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid absolute URL`);
  }

  if (url.origin !== value || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(`${variableName} must be an exact HTTP(S) origin without a path`);
  }

  return value;
}

export function readApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number.parseInt(environment.API_PORT ?? "3000", 10);
  const smtpPort = Number.parseInt(environment.SMTP_PORT ?? "1025", 10);
  const invitationTtlHours = Number.parseInt(environment.INVITATION_TTL_HOURS ?? "168", 10);
  const nodeEnvironment = environment.NODE_ENV ?? "development";
  const authSecret = environment.BETTER_AUTH_SECRET ?? "";
  const authBaseUrl = readExactOrigin(
    environment.BETTER_AUTH_URL ?? "http://localhost:3000",
    "BETTER_AUTH_URL",
  );
  const webOrigin = readExactOrigin(
    environment.WEB_ORIGIN ?? "http://localhost:5173",
    "WEB_ORIGIN",
  );

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  if (!Number.isInteger(invitationTtlHours) || invitationTtlHours < 1) {
    throw new Error("INVITATION_TTL_HOURS must be a positive integer");
  }
  if (authSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  if (
    nodeEnvironment === "production" &&
    (new URL(authBaseUrl).protocol !== "https:" || new URL(webOrigin).protocol !== "https:")
  ) {
    throw new Error("BETTER_AUTH_URL and WEB_ORIGIN must use HTTPS in production");
  }

  return {
    authBaseUrl,
    authSecret,
    databaseUrl: environment.DATABASE_URL ?? "postgresql://nexo:nexo@localhost:5432/nexo",
    emailFrom: environment.EMAIL_FROM ?? "Nexo <noreply@nexo.local>",
    host: environment.API_HOST ?? "0.0.0.0",
    invitationTtlHours,
    port,
    secureCookies: nodeEnvironment === "production",
    smtpHost: environment.SMTP_HOST ?? "localhost",
    smtpPort,
    smtpSecure: environment.SMTP_SECURE === "true",
    webOrigin,
  };
}
