import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "member", "guest"]);
export const taskBoardVisibility = pgEnum("task_board_visibility", ["collaborative", "private"]);
export const projectVisibility = pgEnum("project_visibility", ["workspace", "private"]);
export const projectRole = pgEnum("project_role", ["lead", "contributor", "viewer"]);
export const workflowStatusCategory = pgEnum("workflow_status_category", [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
]);
export const taskActivityType = pgEnum("task_activity_type", [
  "task-created",
  "task-status-changed",
  "task-completed",
  "task-reopened",
  "task-canceled",
  "task-assigned",
  "task-unassigned",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("users_email_normalized_unique").on(table.email)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    index("auth_accounts_user_id_idx").on(table.userId),
    unique("auth_accounts_provider_account_unique").on(table.providerId, table.accountId),
  ],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: uuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  taskBoardVisibility: taskBoardVisibility("task_board_visibility")
    .notNull()
    .default("collaborative"),
  timezone: text("timezone").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: workspaceRole("role").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    deactivatedAt: timestamp("deactivated_at", { mode: "date", withTimezone: true }),
    deactivatedByMembershipId: uuid("deactivated_by_membership_id"),
  },
  (table) => [
    unique("memberships_workspace_user_unique").on(table.workspaceId, table.userId),
    unique("memberships_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("memberships_user_id_idx").on(table.userId),
    index("memberships_workspace_active_idx").on(table.workspaceId, table.deactivatedAt),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isGeneral: boolean("is_general").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    unique("teams_workspace_name_unique").on(table.workspaceId, table.name),
    unique("teams_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("teams_workspace_id_idx").on(table.workspaceId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedByMembershipId: uuid("invited_by_membership_id").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { mode: "date", withTimezone: true }),
    acceptedByMembershipId: uuid("accepted_by_membership_id"),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    index("invitations_workspace_email_idx").on(table.workspaceId, table.email),
    index("invitations_pending_idx").on(table.workspaceId, table.expiresAt),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull(),
    name: text("name").notNull(),
    projectKey: text("project_key").notNull(),
    nextTaskNumber: integer("next_task_number").notNull().default(1),
    visibility: projectVisibility("visibility").notNull().default("workspace"),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    unique("projects_workspace_key_unique").on(table.workspaceId, table.projectKey),
    unique("projects_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("projects_workspace_visibility_idx").on(
      table.workspaceId,
      table.visibility,
      table.name,
      table.id,
    ),
    index("projects_team_id_idx").on(table.teamId),
  ],
);

export const projectAccess = pgTable(
  "project_access",
  {
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    role: projectRole("role").notNull(),
    grantedByMembershipId: uuid("granted_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.membershipId] }),
    index("project_access_membership_idx").on(
      table.workspaceId,
      table.membershipId,
      table.projectId,
    ),
  ],
);

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    unique("workflows_project_unique").on(table.projectId),
    unique("workflows_workspace_id_id_unique").on(table.workspaceId, table.id),
  ],
);

export const workflowStatuses = pgTable(
  "workflow_statuses",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    workflowId: uuid("workflow_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    category: workflowStatusCategory("category").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    retiredAt: timestamp("retired_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    unique("workflow_statuses_workflow_order_unique").on(table.workflowId, table.sortOrder),
    unique("workflow_statuses_workspace_id_id_unique").on(table.workspaceId, table.id),
    uniqueIndex("workflow_statuses_one_default_unique")
      .on(table.workflowId)
      .where(sql`${table.isDefault}`),
    index("workflow_statuses_workflow_active_order_idx").on(
      table.workflowId,
      table.retiredAt,
      table.sortOrder,
      table.id,
    ),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    taskNumber: integer("task_number").notNull(),
    title: text("title").notNull(),
    statusId: uuid("status_id").notNull(),
    assigneeMembershipId: uuid("assignee_membership_id"),
    dueDate: date("due_date", { mode: "string" }),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    firstStartedAt: timestamp("first_started_at", { mode: "date", withTimezone: true }),
    completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
    canceledAt: timestamp("canceled_at", { mode: "date", withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    unique("tasks_project_number_unique").on(table.projectId, table.taskNumber),
    unique("tasks_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("tasks_project_active_created_idx").on(
      table.workspaceId,
      table.projectId,
      table.archivedAt,
      table.createdAt,
      table.id,
    ),
    index("tasks_status_idx").on(table.workspaceId, table.statusId),
    index("tasks_project_assignee_active_idx").on(
      table.workspaceId,
      table.projectId,
      table.assigneeMembershipId,
      table.archivedAt,
      table.createdAt,
      table.id,
    ),
  ],
);

export const taskActivities = pgTable(
  "task_activities",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    actorMembershipId: uuid("actor_membership_id").notNull(),
    type: taskActivityType("type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    index("task_activities_task_time_idx").on(
      table.workspaceId,
      table.taskId,
      table.occurredAt,
      table.id,
    ),
  ],
);

export type AuthUser = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type WorkflowStatus = typeof workflowStatuses.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskActivity = typeof taskActivities.$inferSelect;
