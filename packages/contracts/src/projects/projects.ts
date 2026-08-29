import { type Static, Type } from "@sinclair/typebox";

import { WorkspaceRoleSchema } from "../workspaces/workspaces.js";

export const ProjectVisibilitySchema = Type.Union([
  Type.Literal("workspace"),
  Type.Literal("private"),
]);
export type ProjectVisibility = Static<typeof ProjectVisibilitySchema>;

export const ProjectRoleSchema = Type.Union([
  Type.Literal("lead"),
  Type.Literal("contributor"),
  Type.Literal("viewer"),
]);
export type ProjectRole = Static<typeof ProjectRoleSchema>;

export const ProjectAbilitiesSchema = Type.Object({
  canContribute: Type.Boolean(),
  canManageAccess: Type.Boolean(),
  canManageProject: Type.Boolean(),
  canManageWorkflow: Type.Boolean(),
});
export type ProjectAbilities = Static<typeof ProjectAbilitiesSchema>;

export const ProjectSummarySchema = Type.Object({
  abilities: ProjectAbilitiesSchema,
  effectiveRole: ProjectRoleSchema,
  explicitRole: Type.Union([ProjectRoleSchema, Type.Null()]),
  id: Type.String({ format: "uuid" }),
  key: Type.String(),
  name: Type.String(),
  teamId: Type.String({ format: "uuid" }),
  teamName: Type.String(),
  visibility: ProjectVisibilitySchema,
  workspaceId: Type.String({ format: "uuid" }),
});
export type ProjectSummary = Static<typeof ProjectSummarySchema>;

export const ProjectListResponseSchema = Type.Object({
  projects: Type.Array(ProjectSummarySchema),
});
export type ProjectListResponse = Static<typeof ProjectListResponseSchema>;

export const CreateProjectBodySchema = Type.Object({
  key: Type.String({ maxLength: 10, minLength: 2, pattern: "^[A-Z][A-Z0-9]{1,9}$" }),
  name: Type.String({ maxLength: 100, minLength: 1 }),
  teamId: Type.String({ format: "uuid" }),
  visibility: ProjectVisibilitySchema,
});
export type CreateProjectBody = Static<typeof CreateProjectBodySchema>;

export const UpdateProjectBodySchema = Type.Partial(
  Type.Object({
    name: Type.String({ maxLength: 100, minLength: 1 }),
    visibility: ProjectVisibilitySchema,
  }),
  { minProperties: 1 },
);
export type UpdateProjectBody = Static<typeof UpdateProjectBodySchema>;

export const ProjectAccessMemberSchema = Type.Object({
  effectiveRole: Type.Union([ProjectRoleSchema, Type.Null()]),
  email: Type.String({ format: "email" }),
  membershipId: Type.String({ format: "uuid" }),
  name: Type.String(),
  projectRole: Type.Union([ProjectRoleSchema, Type.Null()]),
  userId: Type.String({ format: "uuid" }),
  workspaceRole: WorkspaceRoleSchema,
});
export type ProjectAccessMember = Static<typeof ProjectAccessMemberSchema>;

export const ProjectAccessResponseSchema = Type.Object({
  members: Type.Array(ProjectAccessMemberSchema),
});
export type ProjectAccessResponse = Static<typeof ProjectAccessResponseSchema>;

export const SetProjectAccessBodySchema = Type.Object({
  membershipId: Type.String({ format: "uuid" }),
  role: ProjectRoleSchema,
});
export type SetProjectAccessBody = Static<typeof SetProjectAccessBodySchema>;

export const WorkflowStatusCategorySchema = Type.Union([
  Type.Literal("backlog"),
  Type.Literal("unstarted"),
  Type.Literal("started"),
  Type.Literal("completed"),
  Type.Literal("canceled"),
]);
export type WorkflowStatusCategory = Static<typeof WorkflowStatusCategorySchema>;

export const WorkflowStatusSchema = Type.Object({
  category: WorkflowStatusCategorySchema,
  color: Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" }),
  id: Type.String({ format: "uuid" }),
  isDefault: Type.Boolean(),
  isRetired: Type.Boolean(),
  name: Type.String(),
  position: Type.Integer({ minimum: 0 }),
});
export type WorkflowStatus = Static<typeof WorkflowStatusSchema>;

export const WorkflowSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  projectId: Type.String({ format: "uuid" }),
  statuses: Type.Array(WorkflowStatusSchema),
  version: Type.Integer({ minimum: 1 }),
});
export type Workflow = Static<typeof WorkflowSchema>;

export const UpdateWorkflowBodySchema = Type.Object({
  name: Type.String({ maxLength: 100, minLength: 1 }),
  statuses: Type.Array(
    Type.Object({
      category: WorkflowStatusCategorySchema,
      color: Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" }),
      id: Type.String({ format: "uuid" }),
      isDefault: Type.Boolean(),
      isRetired: Type.Boolean(),
      name: Type.String({ maxLength: 80, minLength: 1 }),
    }),
    { maxItems: 100, minItems: 1 },
  ),
  version: Type.Integer({ minimum: 1 }),
});
export type UpdateWorkflowBody = Static<typeof UpdateWorkflowBodySchema>;
