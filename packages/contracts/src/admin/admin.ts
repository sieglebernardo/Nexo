import { type Static, Type } from "@sinclair/typebox";
import { WorkspaceTimezoneSchema } from "../workspaces/workspaces.js";

export const AdminSessionSchema = Type.Object({ isPlatformAdmin: Type.Literal(true) });
export type AdminSession = Static<typeof AdminSessionSchema>;

export const CompanySummarySchema = Type.Object({
  createdAt: Type.String({ format: "date-time" }),
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  requiresReview: Type.Boolean(),
  workspaceCount: Type.Integer({ minimum: 0 }),
});
export type CompanySummary = Static<typeof CompanySummarySchema>;

export const CompanyListResponseSchema = Type.Object({
  companies: Type.Array(CompanySummarySchema),
  nextOffset: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  total: Type.Integer({ minimum: 0 }),
});
export type CompanyListResponse = Static<typeof CompanyListResponseSchema>;

export const CompanyDetailSchema = Type.Object({
  auditLog: Type.Array(
    Type.Object({
      action: Type.String(),
      adminName: Type.String(),
      occurredAt: Type.String({ format: "date-time" }),
    }),
  ),
  company: Type.Object({
    createdAt: Type.String({ format: "date-time" }),
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    requiresReview: Type.Boolean(),
  }),
  projects: Type.Array(
    Type.Object({
      id: Type.String({ format: "uuid" }),
      key: Type.String(),
      name: Type.String(),
      workspaceId: Type.String({ format: "uuid" }),
    }),
  ),
  tasks: Type.Array(
    Type.Object({
      id: Type.String({ format: "uuid" }),
      projectId: Type.String({ format: "uuid" }),
      title: Type.String(),
      workspaceId: Type.String({ format: "uuid" }),
    }),
  ),
  users: Type.Array(
    Type.Object({
      email: Type.String({ format: "email" }),
      id: Type.String({ format: "uuid" }),
      name: Type.String(),
      role: Type.Union([Type.Literal("owner"), Type.Literal("member")]),
    }),
  ),
  workflows: Type.Array(
    Type.Object({
      id: Type.String({ format: "uuid" }),
      name: Type.String(),
      projectId: Type.String({ format: "uuid" }),
      workspaceId: Type.String({ format: "uuid" }),
    }),
  ),
  workspaces: Type.Array(
    Type.Object({
      id: Type.String({ format: "uuid" }),
      name: Type.String(),
      taskBoardVisibility: Type.Union([Type.Literal("collaborative"), Type.Literal("private")]),
      timezone: WorkspaceTimezoneSchema,
    }),
  ),
});
export type CompanyDetail = Static<typeof CompanyDetailSchema>;

export const UpdateCompanyBodySchema = Type.Object(
  { name: Type.String({ maxLength: 160, minLength: 1 }) },
  { additionalProperties: false },
);
export type UpdateCompanyBody = Static<typeof UpdateCompanyBodySchema>;
