import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";

import type { NexoAuth } from "./auth.js";

export async function registerAuthRoutes(
  app: FastifyInstance,
  auth: NexoAuth,
  authBaseUrl: string,
): Promise<void> {
  app.route({
    handler: async (request, reply) => {
      const url = new URL(request.url, authBaseUrl);
      const headers = fromNodeHeaders(request.headers);
      headers.set("x-nexo-client-ip", request.ip);
      const body = request.body === undefined ? undefined : JSON.stringify(request.body);
      const authRequest = new Request(url, {
        headers,
        method: request.method,
        ...(body ? { body } : {}),
      });
      const response = await auth.handler(authRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") {
          reply.header(key, value);
        }
      });

      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) {
        reply.header("set-cookie", cookies);
      }

      const responseBody = response.body ? await response.arrayBuffer() : undefined;
      return reply.send(responseBody ? Buffer.from(responseBody) : null);
    },
    method: ["GET", "POST"],
    url: "/api/auth/*",
  });
}
