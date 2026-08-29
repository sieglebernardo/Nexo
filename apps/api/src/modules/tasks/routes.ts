import {
  ApiErrorSchema,
  type CreateTaskBody,
  CreateTaskBodySchema,
  type TaskListQuery,
  TaskListQuerySchema,
  TaskListResponseSchema,
  TaskSummarySchema,
  type TaskVersionBody,
  TaskVersionBodySchema,
  type TransitionTaskBody,
  TransitionTaskBodySchema,
  type UpdateTaskBody,
  UpdateTaskBodySchema,
} from "@nexo/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { SessionResolver } from "../identity/session.js";
import type { TaskService } from "./service.js";

type ProjectParams = Readonly<{ projectId: string; workspaceId: string }>;
type TaskParams = Readonly<{ projectId: string; taskId: string; workspaceId: string }>;

const ProjectParamsSchema = Type.Object({
  projectId: Type.String({ format: "uuid" }),
  workspaceId: Type.String({ format: "uuid" }),
});
const TaskParamsSchema = Type.Object({
  projectId: Type.String({ format: "uuid" }),
  taskId: Type.String({ format: "uuid" }),
  workspaceId: Type.String({ format: "uuid" }),
});
const commonErrors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
};

export async function registerTaskRoutes(
  app: FastifyInstance,
  service: TaskService,
  resolveSession: SessionResolver,
): Promise<void> {
  app.get<{ Params: ProjectParams; Querystring: TaskListQuery }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/tasks",
    {
      schema: {
        params: ProjectParamsSchema,
        querystring: TaskListQuerySchema,
        response: { 200: TaskListResponseSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.listTasks(
        user.id,
        request.params.workspaceId,
        request.params.projectId,
        request.query,
      );
    },
  );

  app.post<{ Body: CreateTaskBody; Params: ProjectParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/tasks",
    {
      schema: {
        body: CreateTaskBodySchema,
        params: ProjectParamsSchema,
        response: { 201: TaskSummarySchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const user = await resolveSession(request);
      const task = await service.createTask(
        user.id,
        request.params.workspaceId,
        request.params.projectId,
        request.body,
      );
      return reply.status(201).send(task);
    },
  );

  app.patch<{ Body: UpdateTaskBody; Params: TaskParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId",
    {
      schema: {
        body: UpdateTaskBodySchema,
        params: TaskParamsSchema,
        response: { 200: TaskSummarySchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.updateTask(
        user.id,
        request.params.workspaceId,
        request.params.projectId,
        request.params.taskId,
        request.body,
      );
    },
  );

  app.post<{ Body: TransitionTaskBody; Params: TaskParams }>(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/transition",
    {
      schema: {
        body: TransitionTaskBodySchema,
        params: TaskParamsSchema,
        response: { 200: TaskSummarySchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.transitionTask(
        user.id,
        request.params.workspaceId,
        request.params.projectId,
        request.params.taskId,
        request.body,
      );
    },
  );

  for (const operation of ["archive", "restore"] as const) {
    app.post<{ Body: TaskVersionBody; Params: TaskParams }>(
      `/api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/${operation}`,
      {
        schema: {
          body: TaskVersionBodySchema,
          params: TaskParamsSchema,
          response: { 200: TaskSummarySchema, ...commonErrors },
        },
      },
      async (request) => {
        const user = await resolveSession(request);
        const args = [
          user.id,
          request.params.workspaceId,
          request.params.projectId,
          request.params.taskId,
          request.body.version,
        ] as const;
        return operation === "archive"
          ? service.archiveTask(...args)
          : service.restoreTask(...args);
      },
    );
  }
}
