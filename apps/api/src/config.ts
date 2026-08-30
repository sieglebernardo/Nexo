export type ApiConfig = Readonly<{
  authBaseUrl: string;
  authSecret: string;
  databaseUrl: string;
  emailFrom: string;
  host: string;
  invitationTtlHours: number;
  port: number;
  redisUrl?: string;
  secureCookies: boolean;
  smtpHost: string;
  smtpRequireTls?: boolean;
  smtpPort: number;
  smtpSecure: boolean;
  trustProxy?: string[];
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

function isRailwayPrivateUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "railway.internal" || hostname.endsWith(".railway.internal");
  } catch {
    return false;
  }
}

export function readApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number.parseInt(environment.PORT ?? environment.API_PORT ?? "3000", 10);
  const smtpPort = Number.parseInt(environment.SMTP_PORT ?? "1025", 10);
  const invitationTtlHours = Number.parseInt(environment.INVITATION_TTL_HOURS ?? "168", 10);
  const nodeEnvironment = environment.NODE_ENV ?? "development";
  const isProduction = nodeEnvironment === "production";
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
    throw new Error("PORT or API_PORT must be an integer between 1 and 65535");
  }
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  if (!Number.isInteger(invitationTtlHours) || invitationTtlHours < 1) {
    throw new Error("INVITATION_TTL_HOURS must be a positive integer");
  }
  if (!["development", "test", "production"].includes(nodeEnvironment)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  if (authSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  if (
    isProduction &&
    (new URL(authBaseUrl).protocol !== "https:" || new URL(webOrigin).protocol !== "https:")
  ) {
    throw new Error("BETTER_AUTH_URL and WEB_ORIGIN must use HTTPS in production");
  }

  const databaseUrl = environment.DATABASE_URL ?? "postgresql://nexo:nexo@localhost:5432/nexo";
  const smtpSecure = environment.SMTP_SECURE === "true";
  const smtpRequireTls = environment.SMTP_REQUIRE_TLS === "true";
  const redisUrl = environment.REDIS_URL;
  const trustProxy = environment.TRUST_PROXY_CIDRS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (isProduction) {
    if (!environment.DATABASE_URL) {
      throw new Error("DATABASE_URL is required in production");
    }
    if (
      !isRailwayPrivateUrl(databaseUrl) &&
      !/[?&]sslmode=(require|verify-ca|verify-full)(?:&|$)/i.test(databaseUrl)
    ) {
      throw new Error(
        "DATABASE_URL must require TLS in production via sslmode or use Railway private networking",
      );
    }
    if (!environment.EMAIL_FROM) {
      throw new Error("EMAIL_FROM is required in production");
    }
    if (!environment.SMTP_HOST) {
      throw new Error("SMTP_HOST is required in production");
    }
    if (!smtpSecure && !smtpRequireTls) {
      throw new Error("SMTP must use implicit TLS or require STARTTLS in production");
    }
    if (!redisUrl) {
      throw new Error("REDIS_URL is required in production for shared rate limiting");
    }
    if (!redisUrl.startsWith("rediss://") && !isRailwayPrivateUrl(redisUrl)) {
      throw new Error("REDIS_URL must use rediss:// or Railway private networking in production");
    }
  }

  return {
    authBaseUrl,
    authSecret,
    databaseUrl,
    emailFrom: environment.EMAIL_FROM ?? "Nexo <noreply@nexo.local>",
    host: environment.API_HOST ?? "0.0.0.0",
    invitationTtlHours,
    port,
    ...(redisUrl ? { redisUrl } : {}),
    secureCookies: isProduction,
    smtpHost: environment.SMTP_HOST ?? "localhost",
    smtpRequireTls: smtpRequireTls || isProduction,
    smtpPort,
    smtpSecure,
    ...(trustProxy?.length ? { trustProxy } : {}),
    webOrigin,
  };
}
