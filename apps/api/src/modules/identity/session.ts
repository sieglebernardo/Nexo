import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";

import { ApiProblem } from "../shared/api-problem.js";
import type { NexoAuth } from "./auth.js";

export type AuthenticatedUser = Readonly<{
  email: string;
  emailVerified: boolean;
  id: string;
  name: string;
}>;

export type SessionResolver = (request: FastifyRequest) => Promise<AuthenticatedUser>;

export function createSessionResolver(auth: NexoAuth): SessionResolver {
  return async (request) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });

    if (!session?.user.emailVerified) {
      throw new ApiProblem(401, "authentication_required", "A verified session is required");
    }

    return {
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      id: session.user.id,
      name: session.user.name,
    };
  };
}
