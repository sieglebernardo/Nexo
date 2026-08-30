import { type Static, Type } from "@sinclair/typebox";

// Keep the selectable values in the shared contract package so the web client
// presents the same canonical IANA identifiers wherever workspace creation is rendered.
export const WORKSPACE_TIMEZONES = ["UTC", ...Intl.supportedValuesOf("timeZone")];
export type WorkspaceTimezone = (typeof WORKSPACE_TIMEZONES)[number];

// The API still accepts valid IANA aliases for compatibility with existing data and clients;
// WorkspaceService performs the runtime IANA validation.
export const WorkspaceTimezoneSchema = Type.String({ maxLength: 100, minLength: 1 });

export const WorkspaceRoleSchema = Type.Union([
  Type.Literal("owner"),
  Type.Literal("member"),
  Type.Literal("guest"),
]);

export type WorkspaceRole = Static<typeof WorkspaceRoleSchema>;

export const TaskBoardVisibilitySchema = Type.Union([
  Type.Literal("collaborative"),
  Type.Literal("private"),
]);

export type TaskBoardVisibility = Static<typeof TaskBoardVisibilitySchema>;

export const WorkspaceSettingsSchema = Type.Object({
  taskBoardVisibility: TaskBoardVisibilitySchema,
});

export type WorkspaceSettings = Static<typeof WorkspaceSettingsSchema>;

export const UpdateWorkspaceSettingsBodySchema = Type.Object(
  { taskBoardVisibility: TaskBoardVisibilitySchema },
  { additionalProperties: false },
);

export type UpdateWorkspaceSettingsBody = Static<typeof UpdateWorkspaceSettingsBodySchema>;

export const WorkspaceAbilitiesSchema = Type.Object({
  canCreateProjects: Type.Boolean(),
  canDeactivateMembers: Type.Boolean(),
  canInviteMembers: Type.Boolean(),
  canListMembers: Type.Boolean(),
  canManageTeams: Type.Boolean(),
  canManageWorkspace: Type.Boolean(),
  canViewTeams: Type.Boolean(),
});

export type WorkspaceAbilities = Static<typeof WorkspaceAbilitiesSchema>;

export const WorkspaceSummarySchema = Type.Object({
  abilities: WorkspaceAbilitiesSchema,
  generalTeamId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  id: Type.String({ format: "uuid" }),
  membershipId: Type.String({ format: "uuid" }),
  name: Type.String(),
  role: WorkspaceRoleSchema,
  timezone: WorkspaceTimezoneSchema,
});

export type WorkspaceSummary = Static<typeof WorkspaceSummarySchema>;

export const WorkspaceListResponseSchema = Type.Object({
  workspaces: Type.Array(WorkspaceSummarySchema),
});

export type WorkspaceListResponse = Static<typeof WorkspaceListResponseSchema>;

export const CreateWorkspaceBodySchema = Type.Object(
  {
    companyName: Type.String({ maxLength: 160, minLength: 1 }),
    name: Type.String({ maxLength: 100, minLength: 1 }),
    timezone: WorkspaceTimezoneSchema,
  },
  { additionalProperties: false },
);

export type CreateWorkspaceBody = Static<typeof CreateWorkspaceBodySchema>;

export const WorkspaceMemberSchema = Type.Object({
  deactivatedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  email: Type.String({ format: "email" }),
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  role: WorkspaceRoleSchema,
  userId: Type.String({ format: "uuid" }),
});

export type WorkspaceMember = Static<typeof WorkspaceMemberSchema>;

export const WorkspaceMembersResponseSchema = Type.Object({
  members: Type.Array(WorkspaceMemberSchema),
});

export type WorkspaceMembersResponse = Static<typeof WorkspaceMembersResponseSchema>;

export const CreateInvitationBodySchema = Type.Object({
  email: Type.String({ format: "email", maxLength: 320 }),
  role: Type.Union([Type.Literal("member"), Type.Literal("guest")]),
});

export type CreateInvitationBody = Static<typeof CreateInvitationBodySchema>;

export const InvitationSchema = Type.Object({
  email: Type.String({ format: "email" }),
  expiresAt: Type.String({ format: "date-time" }),
  id: Type.String({ format: "uuid" }),
  role: WorkspaceRoleSchema,
});

export type Invitation = Static<typeof InvitationSchema>;

export const InvitationListResponseSchema = Type.Object({
  invitations: Type.Array(InvitationSchema),
});

export type InvitationListResponse = Static<typeof InvitationListResponseSchema>;

export const AcceptInvitationBodySchema = Type.Object({
  token: Type.String({ maxLength: 512, minLength: 32 }),
});

export type AcceptInvitationBody = Static<typeof AcceptInvitationBodySchema>;

export const ApiErrorSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
});

export type ApiError = Static<typeof ApiErrorSchema>;
