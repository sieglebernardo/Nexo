import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { createDatabase, type DatabaseConnection } from "@nexo/database";
import Fastify, {
  type FastifyRequest,
  type FastifyServerOptions,
  type RawServerDefault,
} from "fastify";
import type Redis from "ioredis";

import type { ApiConfig } from "./config.js";
import { registerAdminRoutes } from "./modules/admin/routes.js";
import { AdminService } from "./modules/admin/service.js";
import { createAuth } from "./modules/identity/auth.js";
import { createSmtpEmailDelivery, type EmailDelivery } from "./modules/identity/email.js";
import { registerAuthRoutes } from "./modules/identity/routes.js";
import { createSessionResolver, type SessionResolver } from "./modules/identity/session.js";
import { registerProjectRoutes } from "./modules/projects/routes.js";
import { ProjectService } from "./modules/projects/service.js";
import { ApiProblem } from "./modules/shared/api-problem.js";
import { registerHealthRoutes } from "./modules/system/health.js";
import { registerTaskRoutes } from "./modules/tasks/routes.js";
import { TaskService } from "./modules/tasks/service.js";
import { registerWorkspaceRoutes } from "./modules/workspaces/routes.js";
import { WorkspaceService } from "./modules/workspaces/service.js";
import { createRedisClient, createRedisSecondaryStorage } from "./platform/redis.js";

type CreateAppOptions = Readonly<{
  config: ApiConfig;
  database?: DatabaseConnection;
  emailDelivery?: EmailDelivery;
  logger?: FastifyServerOptions["logger"];
  redis?: Redis;
  sessionResolver?: SessionResolver;
}>;

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function redactRequestUrl(requestUrl: string, baseUrl: string): string {
  const url = new URL(requestUrl, baseUrl);
  for (const key of [
    "access_token",
    "code",
    "id_token",
    "invitation",
    "refresh_token",
    "state",
    "token",
  ]) {
    if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
  }
  return `${url.pathname}${url.search}`;
}

function safeRequestSerializer(baseUrl: string) {
  return (request: FastifyRequest) => ({
    host: request.host,
    method: request.method,
    remoteAddress: request.ip,
    url: redactRequestUrl(request.url, baseUrl),
  });
}

export async function createApp(options: CreateAppOptions) {
  const { config, logger = true } = options;
  const app = Fastify<RawServerDefault>({
    logger:
      logger === true
        ? { serializers: { req: safeRequestSerializer(config.authBaseUrl) } }
        : logger,
    trustProxy: config.trustProxy ?? false,
  }).withTypeProvider<TypeBoxTypeProvider>();
  const ownsDatabase = options.database === undefined;
  const database = options.database ?? createDatabase(config.databaseUrl);
  const emailDelivery = options.emailDelivery ?? createSmtpEmailDelivery(config);
  const ownsRedis = options.redis === undefined && config.redisUrl !== undefined;
  const redis = options.redis ?? (config.redisUrl ? createRedisClient(config.redisUrl) : undefined);
  if (redis) await redis.connect();
  const auth = createAuth({
    config,
    database,
    emailDelivery,
    ...(redis ? { secondaryStorage: createRedisSecondaryStorage(redis) } : {}),
  });
  const resolveSession = options.sessionResolver ?? createSessionResolver(auth);
  const workspaceService = new WorkspaceService(database, emailDelivery, config);
  const adminService = new AdminService(database);
  const projectService = new ProjectService(database);
  const taskService = new TaskService(database);

  await app.register(cors, {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: config.webOrigin,
  });
  await app.register(helmet);
  await app.register(rateLimit, {
    max: 300,
    ...(redis ? { redis, nameSpace: "nexo-api-rate-limit-" } : {}),
    skipOnError: false,
    timeWindow: "1 minute",
  });

  app.addHook("onRequest", async (request) => {
    const isProtectedApi =
      request.url.startsWith("/api/auth/") || request.url.startsWith("/api/v1/");
    if (!unsafeMethods.has(request.method) || !isProtectedApi) return;

    const origin = request.headers.origin;
    if (origin !== undefined && origin !== config.webOrigin) {
      throw new ApiProblem(403, "csrf_origin_mismatch", "Request origin is not trusted");
    }

    if (request.headers.cookie && origin === undefined) {
      const referer = request.headers.referer;
      let trustedReferer = false;
      try {
        trustedReferer = referer ? new URL(referer).origin === config.webOrigin : false;
      } catch {
        trustedReferer = false;
      }
      if (!trustedReferer) {
        throw new ApiProblem(403, "csrf_origin_required", "A trusted request origin is required");
      }
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiProblem) {
      return reply.status(error.statusCode).send({ code: error.code, message: error.message });
    }

    if (typeof error === "object" && error !== null && "validation" in error) {
      const message = error instanceof Error ? error.message : "Request validation failed";
      return reply.status(400).send({ code: "validation_error", message });
    }

    app.log.error(error);
    return reply
      .status(500)
      .send({ code: "internal_error", message: "An unexpected error occurred" });
  });

  app.setNotFoundHandler((request, reply) => {
    app.log.info(
      {
        method: request.method,
        url: redactRequestUrl(request.url, config.authBaseUrl),
      },
      "route not found",
    );
    return reply.status(404).send({ code: "not_found", message: "Route not found" });
  });

  await registerAuthRoutes(app, auth, config.authBaseUrl);
  await registerHealthRoutes(app);
  await registerAdminRoutes(app, adminService, resolveSession);
  await registerWorkspaceRoutes(app, workspaceService, resolveSession);
  await registerProjectRoutes(app, projectService, resolveSession);
  await registerTaskRoutes(app, taskService, resolveSession);

  if (ownsDatabase) {
    app.addHook("onClose", async () => {
      await database.close();
    });
  }
  if (ownsRedis && redis) {
    app.addHook("onClose", async () => {
      await redis.quit();
    });
  }

  return app;
}
