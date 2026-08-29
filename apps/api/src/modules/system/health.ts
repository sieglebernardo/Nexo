import { type HealthResponse, HealthResponseSchema } from "@nexo/contracts";
import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/health",
    {
      schema: {
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      service: "nexo-api",
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );
}
