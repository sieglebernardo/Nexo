import {
  ApiErrorSchema,
  type CreateProjectBody,
  CreateProjectBodySchema,
  ProjectAccessResponseSchema,
  ProjectListResponseSchema,
  ProjectSummarySchema,
  type SetProjectAccessBody,
  SetProjectAccessBodySchema,
  type UpdateProjectBody,
  UpdateProjectBodySchema,
  type UpdateWorkflowBody,
  UpdateWorkflowBodySchema,
  WorkflowSchema,
} from "@nexo/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { SessionResolver } from "../identity/session.js";
import type { ProjectService } from "./service.js";

type WorkspaceParams = Readonly<{ workspaceId: string }>;
type ProjectParams = Readonly<{ projectId: string; workspaceId: string }>;
type AccessParams = Readonly<{
  membershipId: string;
  projectId: string;
  workspaceId: string;
}>;

const WorkspaceParamsSchema = Type.Object({ workspaceId: Type.String({ format: "uuid" }) });
const ProjectParamsSchema = Type.Object({
  projectId: Type.String({ format: "uuid" }),
  workspaceId: Type.String({ format: "uuid" }),
});
const AccessParamsSchema = Type.Object({
  membershipId: Type.String({ format: "uuid" }),
  projectId: Type.String({ format: "uuid" }),
  workspaceId: Type.String({ format: "uuid" }),
});

const commonErrors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
};

export async function registerProjectRoutes(
  app: FastifyInstance,
  service: ProjectService,
  resolveSession: SessionResolver,
): Promise<void> {
  app.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/projects",
    {
      schema: {
        params: WorkspaceParamsSchema,
        response: { 200: ProjectListResponseSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return { projects: await service.listProjects(user.id, request.params.workspaceId) };
    },
  );

  app.post<{ Body: CreateProjectBody; Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/projects",
    {
      schema: {
        body: CreateProjectBodySchema,
        params: WorkspaceParamsSchema,
        response: { 201: ProjectSummarySchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const user = await resolveSession(request);
      const project = await service.createProject(
        user.id,
        request.params.workspaceId,
        request.body,
      );
      return reply.status(201).send(project);
    },
  );

  app.get<{ Params: ProjectParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId",
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: ProjectSummarySchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.getProject(user.id, request.params.workspaceId, request.params.projectId);
    },
  );

  app.patch<{ Body: UpdateProjectBody; Params: ProjectParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId",
    {
      schema: {
        body: UpdateProjectBodySchema,
        params: ProjectParamsSchema,
        response: { 200: ProjectSummarySchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.updateProject(
        user.id,
        request.params.workspaceId,
        request.params.projectId,
        request.body,
      );
    },
  );

  app.get<{ Params: ProjectParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/access",
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: ProjectAccessResponseSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return {
        members: await service.listProjectAccess(
          user.id,
          request.params.workspaceId,
          request.params.projectId,
        ),
      };
    },
  );

  app.put<{ Body: SetProjectAccessBody; Params: ProjectParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/access",
    {
      schema: {
        body: SetProjectAccessBodySchema,
        params: ProjectParamsSchema,
        response: {
          200: Type.Object({
            membershipId: Type.String({ format: "uuid" }),
            role: Type.Union([
              Type.Literal("lead"),
              Type.Literal("contributor"),
              Type.Literal("viewer"),
            ]),
          }),
          ...commonErrors,
        },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.setProjectAccess(
        user.id,
        request.params.workspaceId,
        request.params.projectId,
        request.body,
      );
    },
  );

  app.delete<{ Params: AccessParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/access/:membershipId",
    {
      schema: { params: AccessParamsSchema, response: { ...commonErrors } },
    },
    async (request, reply) => {
      const user = await resolveSession(request);
      await service.removeProjectAccess(
        user.id,
        request.params.workspaceId,
        request.params.projectId,
        request.params.membershipId,
      );
      return reply.status(204).send();
    },
  );

  app.get<{ Params: ProjectParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/workflow",
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: WorkflowSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.getWorkflow(user.id, request.params.workspaceId, request.params.projectId);
    },
  );

  app.put<{ Body: UpdateWorkflowBody; Params: ProjectParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/workflow",
    {
      schema: {
        body: UpdateWorkflowBodySchema,
        params: ProjectParamsSchema,
        response: { 200: WorkflowSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.updateWorkflow(
        user.id,
        request.params.workspaceId,
        request.params.projectId,
        request.body,
      );
    },
  );
}
