import {
  AdminSessionSchema,
  ApiErrorSchema,
  CompanyDetailSchema,
  CompanyListResponseSchema,
  type UpdateCompanyBody,
  UpdateCompanyBodySchema,
} from "@nexo/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { SessionResolver } from "../identity/session.js";
import type { AdminService } from "./service.js";

const CompanyParamsSchema = Type.Object({ companyId: Type.String({ format: "uuid" }) });
const CompanyListQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  search: Type.Optional(Type.String({ maxLength: 160 })),
});
const commonErrors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
};

export async function registerAdminRoutes(
  app: FastifyInstance,
  service: AdminService,
  resolveSession: SessionResolver,
) {
  app.get(
    "/api/v1/admin/session",
    { schema: { response: { 200: AdminSessionSchema, ...commonErrors } } },
    async (request) => {
      const user = await resolveSession(request);
      await service.requirePlatformAdmin(user.id);
      return { isPlatformAdmin: true };
    },
  );

  app.get<{ Querystring: { limit?: number; offset?: number; search?: string } }>(
    "/api/v1/admin/companies",
    {
      schema: {
        querystring: CompanyListQuerySchema,
        response: { 200: CompanyListResponseSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.listCompanies(user.id, {
        limit: request.query.limit ?? 25,
        offset: request.query.offset ?? 0,
        ...(request.query.search === undefined ? {} : { search: request.query.search }),
      });
    },
  );

  app.get<{ Params: { companyId: string } }>(
    "/api/v1/admin/companies/:companyId",
    {
      schema: {
        params: CompanyParamsSchema,
        response: { 200: CompanyDetailSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.getCompany(user.id, request.params.companyId);
    },
  );

  app.patch<{ Body: UpdateCompanyBody; Params: { companyId: string } }>(
    "/api/v1/admin/companies/:companyId",
    {
      schema: {
        body: UpdateCompanyBodySchema,
        params: CompanyParamsSchema,
        response: { 200: CompanyDetailSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.updateCompany(user.id, request.params.companyId, request.body);
    },
  );
}
