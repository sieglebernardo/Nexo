import { type Static, Type } from "@sinclair/typebox";

import { WorkflowStatusCategorySchema } from "../projects/projects.js";

const DateOnlySchema = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export const TaskListStatusSchema = Type.Object({
  category: WorkflowStatusCategorySchema,
  color: Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" }),
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
});
export type TaskListStatus = Static<typeof TaskListStatusSchema>;

export const TaskSummarySchema = Type.Object({
  archivedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
  dueDate: Type.Union([DateOnlySchema, Type.Null()]),
  id: Type.String({ format: "uuid" }),
  identifier: Type.String(),
  projectId: Type.String({ format: "uuid" }),
  status: TaskListStatusSchema,
  taskNumber: Type.Integer({ minimum: 1 }),
  title: Type.String(),
  updatedAt: Type.String({ format: "date-time" }),
  version: Type.Integer({ minimum: 1 }),
  workspaceId: Type.String({ format: "uuid" }),
});
export type TaskSummary = Static<typeof TaskSummarySchema>;

export const TaskListQuerySchema = Type.Object(
  {
    archived: Type.Optional(Type.Boolean({ default: false })),
    cursor: Type.Optional(Type.String({ maxLength: 500, minLength: 1 })),
    limit: Type.Optional(Type.Integer({ default: 50, maximum: 100, minimum: 1 })),
  },
  { additionalProperties: false },
);
export type TaskListQuery = Static<typeof TaskListQuerySchema>;

export const TaskListResponseSchema = Type.Object({
  nextCursor: Type.Union([Type.String(), Type.Null()]),
  tasks: Type.Array(TaskSummarySchema),
});
export type TaskListResponse = Static<typeof TaskListResponseSchema>;

export const CreateTaskBodySchema = Type.Object(
  {
    dueDate: Type.Optional(Type.Union([DateOnlySchema, Type.Null()])),
    title: Type.String({ maxLength: 240, minLength: 1 }),
  },
  { additionalProperties: false },
);
export type CreateTaskBody = Static<typeof CreateTaskBodySchema>;

export const UpdateTaskBodySchema = Type.Object(
  {
    dueDate: Type.Optional(Type.Union([DateOnlySchema, Type.Null()])),
    title: Type.Optional(Type.String({ maxLength: 240, minLength: 1 })),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, minProperties: 2 },
);
export type UpdateTaskBody = Static<typeof UpdateTaskBodySchema>;

export const TransitionTaskBodySchema = Type.Object(
  {
    statusId: Type.String({ format: "uuid" }),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type TransitionTaskBody = Static<typeof TransitionTaskBodySchema>;

export const TaskVersionBodySchema = Type.Object(
  { version: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
export type TaskVersionBody = Static<typeof TaskVersionBodySchema>;
