import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { createDatabase, type DatabaseConnection } from "@nexo/database";
import Fastify, { type FastifyServerOptions } from "fastify";

import type { ApiConfig } from "./config.js";
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

type CreateAppOptions = Readonly<{
  config: ApiConfig;
  database?: DatabaseConnection;
  emailDelivery?: EmailDelivery;
  logger?: FastifyServerOptions["logger"];
  sessionResolver?: SessionResolver;
}>;

export async function createApp(options: CreateAppOptions) {
  const { config, logger = true } = options;
  const app = Fastify({ logger }).withTypeProvider<TypeBoxTypeProvider>();
  const ownsDatabase = options.database === undefined;
  const database = options.database ?? createDatabase(config.databaseUrl);
  const emailDelivery = options.emailDelivery ?? createSmtpEmailDelivery(config);
  const auth = createAuth({ config, database, emailDelivery });
  const resolveSession = options.sessionResolver ?? createSessionResolver(auth);
  const workspaceService = new WorkspaceService(database, emailDelivery, config);
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
    timeWindow: "1 minute",
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

  await registerAuthRoutes(app, auth);
  await registerHealthRoutes(app);
  await registerWorkspaceRoutes(app, workspaceService, resolveSession);
  await registerProjectRoutes(app, projectService, resolveSession);
  await registerTaskRoutes(app, taskService, resolveSession);

  if (ownsDatabase) {
    app.addHook("onClose", async () => {
      await database.close();
    });
  }

  return app;
}
