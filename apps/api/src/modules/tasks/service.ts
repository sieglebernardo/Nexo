import {
  type DatabaseConnection,
  memberships,
  projectAccess,
  projects,
  taskActivities,
  tasks,
  users,
  workflowStatuses,
  workflows,
  workspaces,
} from "@nexo/database";
import {
  applyStatusCategoryTransition,
  canAccessProject,
  normalizeTaskTitle,
  type ProjectAction,
  type ProjectRole,
  type ProjectVisibility,
  type StatusCategory,
  taskDueDateError,
  taskTitleError,
  type WorkspaceRole,
} from "@nexo/domain";
import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { ApiProblem } from "../shared/api-problem.js";

type ActorMembership = Readonly<{
  id: string;
  role: WorkspaceRole;
}>;

type ProjectContext = Readonly<{
  explicitRole: ProjectRole | null;
  key: string;
  taskBoardVisibility: "collaborative" | "private";
  visibility: ProjectVisibility;
}>;

type TaskAssigneeRow = Readonly<{
  id: string;
  name: string;
}>;

type TaskStatusRow = Readonly<{
  category: StatusCategory;
  color: string;
  id: string;
  name: string;
}>;

type TaskRow = Readonly<{
  assignee: TaskAssigneeRow | null;
  archivedAt: Date | null;
  canceledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  dueDate: string | null;
  firstStartedAt: Date | null;
  id: string;
  projectId: string;
  status: TaskStatusRow;
  taskNumber: number;
  title: string;
  updatedAt: Date;
  version: number;
  workspaceId: string;
}>;

type TaskQueryRow = Omit<TaskRow, "assignee"> &
  Readonly<{
    assigneeId: string | null;
    assigneeName: string | null;
  }>;

type DatabaseTransaction = Parameters<Parameters<DatabaseConnection["db"]["transaction"]>[0]>[0];

type TaskCursor = Readonly<{
  createdAt: Date;
  id: string;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toTaskSummary(row: TaskRow, projectKey: string) {
  return {
    assignee: row.assignee,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    dueDate: row.dueDate,
    id: row.id,
    identifier: `${projectKey}-${row.taskNumber}`,
    projectId: row.projectId,
    status: row.status,
    taskNumber: row.taskNumber,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    workspaceId: row.workspaceId,
  };
}

function toTaskRow(row: TaskQueryRow): TaskRow {
  return {
    ...row,
    assignee:
      row.assigneeId && row.assigneeName ? { id: row.assigneeId, name: row.assigneeName } : null,
  };
}

function encodeCursor(task: TaskRow): string {
  return Buffer.from(
    JSON.stringify({ createdAt: task.createdAt.toISOString(), id: task.id }),
  ).toString("base64url");
}

function decodeCursor(value: string): TaskCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("Cursor shape is invalid");
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !uuidPattern.test(parsed.id)) {
      throw new Error("Cursor values are invalid");
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new ApiProblem(400, "invalid_task_cursor", "The task cursor is invalid");
  }
}

export class TaskService {
  constructor(private readonly database: DatabaseConnection) {}

  async listTasks(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: Readonly<{ archived?: boolean; cursor?: string; limit?: number }>,
  ) {
    const { actor, project } = await this.requireProject(
      userId,
      workspaceId,
      projectId,
      "project:view",
    );
    const limit = input.limit ?? 50;
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const archivedCondition = input.archived
      ? isNotNull(tasks.archivedAt)
      : isNull(tasks.archivedAt);
    const cursorCondition = cursor
      ? or(
          lt(tasks.createdAt, cursor.createdAt),
          and(eq(tasks.createdAt, cursor.createdAt), lt(tasks.id, cursor.id)),
        )
      : undefined;
    const visibilityCondition =
      project.taskBoardVisibility === "private"
        ? eq(tasks.assigneeMembershipId, actor.id)
        : undefined;

    const rows = await this.database.db
      .select({
        assigneeId: memberships.id,
        assigneeName: users.name,
        archivedAt: tasks.archivedAt,
        canceledAt: tasks.canceledAt,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        dueDate: tasks.dueDate,
        firstStartedAt: tasks.firstStartedAt,
        id: tasks.id,
        projectId: tasks.projectId,
        status: {
          category: workflowStatuses.category,
          color: workflowStatuses.color,
          id: workflowStatuses.id,
          name: workflowStatuses.name,
        },
        taskNumber: tasks.taskNumber,
        title: tasks.title,
        updatedAt: tasks.updatedAt,
        version: tasks.version,
        workspaceId: tasks.workspaceId,
      })
      .from(tasks)
      .innerJoin(
        workflowStatuses,
        and(eq(workflowStatuses.id, tasks.statusId), eq(workflowStatuses.workspaceId, workspaceId)),
      )
      .leftJoin(
        memberships,
        and(
          eq(memberships.id, tasks.assigneeMembershipId),
          eq(memberships.workspaceId, workspaceId),
        ),
      )
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.projectId, projectId),
          archivedCondition,
          cursorCondition,
          visibilityCondition,
        ),
      )
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit).map(toTaskRow);
    const lastTask = page.at(-1);
    return {
      nextCursor: rows.length > limit && lastTask ? encodeCursor(lastTask) : null,
      tasks: page.map((task) => toTaskSummary(task, project.key)),
    };
  }

  async listTaskAssignees(userId: string, workspaceId: string, projectId: string) {
    const { project } = await this.requireProject(
      userId,
      workspaceId,
      projectId,
      "project:contribute",
    );
    const rows = await this.database.db
      .select({
        explicitRole: projectAccess.role,
        id: memberships.id,
        name: users.name,
        workspaceRole: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(
        projectAccess,
        and(
          eq(projectAccess.projectId, projectId),
          eq(projectAccess.workspaceId, workspaceId),
          eq(projectAccess.membershipId, memberships.id),
        ),
      )
      .where(and(eq(memberships.workspaceId, workspaceId), isNull(memberships.deactivatedAt)))
      .orderBy(asc(users.name), asc(memberships.id));

    return rows
      .filter((candidate) =>
        canAccessProject(
          {
            explicitRole: candidate.explicitRole,
            visibility: project.visibility,
            workspaceRole: candidate.workspaceRole,
          },
          "project:view",
        ),
      )
      .map(({ id, name }) => ({ id, name }));
  }

  async createTask(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: Readonly<{ assigneeId?: string | null; dueDate?: string | null; title: string }>,
  ) {
    const { actor, project } = await this.requireProject(
      userId,
      workspaceId,
      projectId,
      "project:contribute",
    );
    this.validateTaskInput(input.title, input.dueDate);
    const title = normalizeTaskTitle(input.title);
    const dueDate = input.dueDate ?? null;

    return this.database.db.transaction(async (transaction) => {
      const assignee = await this.loadEligibleAssignee(
        transaction,
        workspaceId,
        projectId,
        project.visibility,
        input.assigneeId ?? null,
      );
      const defaultStatusRows = await transaction
        .select({
          category: workflowStatuses.category,
          color: workflowStatuses.color,
          id: workflowStatuses.id,
          name: workflowStatuses.name,
        })
        .from(workflows)
        .innerJoin(
          workflowStatuses,
          and(
            eq(workflowStatuses.workflowId, workflows.id),
            eq(workflowStatuses.workspaceId, workspaceId),
          ),
        )
        .where(
          and(
            eq(workflows.workspaceId, workspaceId),
            eq(workflows.projectId, projectId),
            eq(workflowStatuses.isDefault, true),
            isNull(workflowStatuses.retiredAt),
          ),
        )
        .limit(1);
      const status = defaultStatusRows[0];
      if (!status) {
        throw new ApiProblem(
          409,
          "default_task_status_missing",
          "The project has no active default status",
        );
      }

      const numberRows = await transaction
        .update(projects)
        .set({ nextTaskNumber: sql`${projects.nextTaskNumber} + 1` })
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
        .returning({ nextTaskNumber: projects.nextTaskNumber });
      const nextTaskNumber = numberRows[0]?.nextTaskNumber;
      if (!nextTaskNumber) {
        throw new ApiProblem(404, "project_not_found", "Project was not found");
      }

      const now = new Date();
      const task: TaskRow = {
        assignee,
        archivedAt: null,
        canceledAt: null,
        completedAt: null,
        createdAt: now,
        dueDate,
        firstStartedAt: null,
        id: uuidv7(),
        projectId,
        status,
        taskNumber: nextTaskNumber - 1,
        title,
        updatedAt: now,
        version: 1,
        workspaceId,
      };
      await transaction.insert(tasks).values({
        assigneeMembershipId: task.assignee?.id ?? null,
        archivedAt: task.archivedAt,
        canceledAt: task.canceledAt,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        createdByMembershipId: actor.id,
        dueDate: task.dueDate,
        firstStartedAt: task.firstStartedAt,
        id: task.id,
        projectId: task.projectId,
        statusId: task.status.id,
        taskNumber: task.taskNumber,
        title: task.title,
        updatedAt: task.updatedAt,
        version: task.version,
        workspaceId: task.workspaceId,
      });
      await transaction.insert(taskActivities).values({
        actorMembershipId: actor.id,
        id: uuidv7(),
        occurredAt: now,
        payload: {
          ...(task.assignee ? { assigneeMembershipId: task.assignee.id } : {}),
          statusId: status.id,
        },
        schemaVersion: 1,
        taskId: task.id,
        type: "task-created",
        workspaceId,
      });

      return toTaskSummary(task, project.key);
    });
  }

  async updateTask(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    input: Readonly<{
      assigneeId?: string | null;
      dueDate?: string | null;
      title?: string;
      version: number;
    }>,
  ) {
    const { actor, project } = await this.requireProject(
      userId,
      workspaceId,
      projectId,
      "project:contribute",
    );
    if (
      input.title === undefined &&
      input.dueDate === undefined &&
      input.assigneeId === undefined
    ) {
      throw new ApiProblem(
        400,
        "task_update_empty",
        "A title, due date, or assignee change is required",
      );
    }
    if (input.title !== undefined) {
      this.validateTaskInput(input.title, input.dueDate);
    } else {
      const dueDateError = taskDueDateError(input.dueDate);
      if (dueDateError) {
        throw new ApiProblem(400, "invalid_task_due_date", dueDateError);
      }
    }

    return this.database.db.transaction(async (transaction) => {
      const current = await this.loadTaskForUpdate(transaction, workspaceId, projectId, taskId);
      this.requireMutableTask(current, input.version);
      const assignee =
        input.assigneeId === undefined
          ? current.assignee
          : await this.loadEligibleAssignee(
              transaction,
              workspaceId,
              projectId,
              project.visibility,
              input.assigneeId,
            );
      const now = new Date();
      const title = input.title === undefined ? current.title : normalizeTaskTitle(input.title);
      const dueDate = input.dueDate === undefined ? current.dueDate : input.dueDate;
      const updatedRows = await transaction
        .update(tasks)
        .set({
          assigneeMembershipId: assignee?.id ?? null,
          dueDate,
          title,
          updatedAt: now,
          version: current.version + 1,
        })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.workspaceId, workspaceId),
            eq(tasks.projectId, projectId),
            eq(tasks.version, input.version),
          ),
        )
        .returning({ id: tasks.id });
      if (updatedRows.length !== 1) {
        throw this.versionConflict();
      }
      if (current.assignee?.id !== assignee?.id) {
        await transaction.insert(taskActivities).values({
          actorMembershipId: actor.id,
          id: uuidv7(),
          occurredAt: now,
          payload: {
            fromAssigneeMembershipId: current.assignee?.id ?? null,
            toAssigneeMembershipId: assignee?.id ?? null,
          },
          schemaVersion: 1,
          taskId,
          type: assignee ? "task-assigned" : "task-unassigned",
          workspaceId,
        });
      }
      return toTaskSummary(
        { ...current, assignee, dueDate, title, updatedAt: now, version: current.version + 1 },
        project.key,
      );
    });
  }

  async transitionTask(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    input: Readonly<{ statusId: string; version: number }>,
  ) {
    const { actor, project } = await this.requireProject(
      userId,
      workspaceId,
      projectId,
      "project:contribute",
    );

    return this.database.db.transaction(async (transaction) => {
      const current = await this.loadTaskForUpdate(transaction, workspaceId, projectId, taskId);
      this.requireMutableTask(current, input.version);
      if (current.status.id === input.statusId) {
        throw new ApiProblem(400, "task_status_unchanged", "Choose a different task status");
      }

      const targetRows = await transaction
        .select({
          category: workflowStatuses.category,
          color: workflowStatuses.color,
          id: workflowStatuses.id,
          name: workflowStatuses.name,
        })
        .from(workflowStatuses)
        .innerJoin(
          workflows,
          and(
            eq(workflows.id, workflowStatuses.workflowId),
            eq(workflows.workspaceId, workspaceId),
          ),
        )
        .where(
          and(
            eq(workflowStatuses.id, input.statusId),
            eq(workflowStatuses.workspaceId, workspaceId),
            eq(workflows.projectId, projectId),
            isNull(workflowStatuses.retiredAt),
          ),
        )
        .limit(1);
      const target = targetRows[0];
      if (!target) {
        throw new ApiProblem(
          400,
          "invalid_task_status",
          "The target status is not active in this project's workflow",
        );
      }

      const now = new Date();
      const transition = applyStatusCategoryTransition(
        current.status.category,
        target.category,
        current,
        now,
      );
      const updatedRows = await transaction
        .update(tasks)
        .set({
          ...transition.timestamps,
          statusId: target.id,
          updatedAt: now,
          version: current.version + 1,
        })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.workspaceId, workspaceId),
            eq(tasks.projectId, projectId),
            eq(tasks.version, input.version),
          ),
        )
        .returning({ id: tasks.id });
      if (updatedRows.length !== 1) {
        throw this.versionConflict();
      }
      await transaction.insert(taskActivities).values({
        actorMembershipId: actor.id,
        id: uuidv7(),
        occurredAt: now,
        payload: { fromStatusId: current.status.id, toStatusId: target.id },
        schemaVersion: 1,
        taskId,
        type: transition.activity,
        workspaceId,
      });

      return toTaskSummary(
        {
          ...current,
          ...transition.timestamps,
          status: target,
          updatedAt: now,
          version: current.version + 1,
        },
        project.key,
      );
    });
  }

  async archiveTask(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    version: number,
  ) {
    return this.setTaskArchived(userId, workspaceId, projectId, taskId, version, true);
  }

  async restoreTask(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    version: number,
  ) {
    return this.setTaskArchived(userId, workspaceId, projectId, taskId, version, false);
  }

  private async setTaskArchived(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    version: number,
    archived: boolean,
  ) {
    const { project } = await this.requireProject(
      userId,
      workspaceId,
      projectId,
      "project:contribute",
    );
    return this.database.db.transaction(async (transaction) => {
      const current = await this.loadTaskForUpdate(transaction, workspaceId, projectId, taskId);
      if (current.version !== version) {
        throw this.versionConflict();
      }
      if (archived === (current.archivedAt !== null)) {
        throw new ApiProblem(
          409,
          archived ? "task_already_archived" : "task_not_archived",
          archived ? "The task is already archived" : "The task is not archived",
        );
      }
      const now = new Date();
      const archivedAt = archived ? now : null;
      const updatedRows = await transaction
        .update(tasks)
        .set({ archivedAt, updatedAt: now, version: current.version + 1 })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.workspaceId, workspaceId),
            eq(tasks.projectId, projectId),
            eq(tasks.version, version),
          ),
        )
        .returning({ id: tasks.id });
      if (updatedRows.length !== 1) {
        throw this.versionConflict();
      }
      return toTaskSummary(
        { ...current, archivedAt, updatedAt: now, version: current.version + 1 },
        project.key,
      );
    });
  }

  private validateTaskInput(title: string, dueDate: string | null | undefined) {
    const titleError = taskTitleError(title);
    if (titleError) {
      throw new ApiProblem(400, "invalid_task_title", titleError);
    }
    const dueDateError = taskDueDateError(dueDate);
    if (dueDateError) {
      throw new ApiProblem(400, "invalid_task_due_date", dueDateError);
    }
  }

  private requireMutableTask(task: TaskRow, version: number) {
    if (task.version !== version) {
      throw this.versionConflict();
    }
    if (task.archivedAt) {
      throw new ApiProblem(409, "task_archived", "Restore the task before changing it");
    }
  }

  private versionConflict() {
    return new ApiProblem(
      409,
      "task_version_conflict",
      "The task changed since you loaded it. Refresh and try again",
    );
  }

  private async loadTaskForUpdate(
    transaction: DatabaseTransaction,
    workspaceId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskRow> {
    const rows = await transaction
      .select({
        assigneeId: memberships.id,
        assigneeName: users.name,
        archivedAt: tasks.archivedAt,
        canceledAt: tasks.canceledAt,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        dueDate: tasks.dueDate,
        firstStartedAt: tasks.firstStartedAt,
        id: tasks.id,
        projectId: tasks.projectId,
        status: {
          category: workflowStatuses.category,
          color: workflowStatuses.color,
          id: workflowStatuses.id,
          name: workflowStatuses.name,
        },
        taskNumber: tasks.taskNumber,
        title: tasks.title,
        updatedAt: tasks.updatedAt,
        version: tasks.version,
        workspaceId: tasks.workspaceId,
      })
      .from(tasks)
      .innerJoin(
        workflowStatuses,
        and(eq(workflowStatuses.id, tasks.statusId), eq(workflowStatuses.workspaceId, workspaceId)),
      )
      .leftJoin(
        memberships,
        and(
          eq(memberships.id, tasks.assigneeMembershipId),
          eq(memberships.workspaceId, workspaceId),
        ),
      )
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.projectId, projectId),
        ),
      )
      .limit(1)
      .for("update", { of: tasks });
    const task = rows[0];
    if (!task) {
      throw new ApiProblem(404, "task_not_found", "Task was not found");
    }
    return toTaskRow(task);
  }

  private async loadEligibleAssignee(
    transaction: DatabaseTransaction,
    workspaceId: string,
    projectId: string,
    projectVisibility: ProjectVisibility,
    assigneeId: string | null,
  ): Promise<TaskAssigneeRow | null> {
    if (assigneeId === null) return null;

    const rows = await transaction
      .select({
        explicitRole: projectAccess.role,
        id: memberships.id,
        name: users.name,
        workspaceRole: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(
        projectAccess,
        and(
          eq(projectAccess.projectId, projectId),
          eq(projectAccess.workspaceId, workspaceId),
          eq(projectAccess.membershipId, memberships.id),
        ),
      )
      .where(
        and(
          eq(memberships.id, assigneeId),
          eq(memberships.workspaceId, workspaceId),
          isNull(memberships.deactivatedAt),
        ),
      )
      .limit(1);
    const assignee = rows[0];
    if (
      !assignee ||
      !canAccessProject(
        {
          explicitRole: assignee.explicitRole,
          visibility: projectVisibility,
          workspaceRole: assignee.workspaceRole,
        },
        "project:view",
      )
    ) {
      throw new ApiProblem(
        400,
        "invalid_task_assignee",
        "The assignee must be an active member who can access this project",
      );
    }

    return { id: assignee.id, name: assignee.name };
  }

  private async requireWorkspaceActor(
    userId: string,
    workspaceId: string,
  ): Promise<ActorMembership> {
    const rows = await this.database.db
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, userId),
          isNull(memberships.deactivatedAt),
        ),
      )
      .limit(1);
    const actor = rows[0];
    if (!actor) {
      throw new ApiProblem(404, "workspace_not_found", "Workspace was not found");
    }
    return actor;
  }

  private async requireProject(
    userId: string,
    workspaceId: string,
    projectId: string,
    action: ProjectAction,
  ): Promise<{ actor: ActorMembership; project: ProjectContext }> {
    const actor = await this.requireWorkspaceActor(userId, workspaceId);
    const rows = await this.database.db
      .select({
        explicitRole: projectAccess.role,
        key: projects.projectKey,
        taskBoardVisibility: workspaces.taskBoardVisibility,
        visibility: projects.visibility,
      })
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .leftJoin(
        projectAccess,
        and(
          eq(projectAccess.projectId, projects.id),
          eq(projectAccess.workspaceId, workspaceId),
          eq(projectAccess.membershipId, actor.id),
        ),
      )
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
      .limit(1);
    const project = rows[0];
    if (!project) {
      throw new ApiProblem(404, "project_not_found", "Project was not found");
    }
    const context = {
      explicitRole: project.explicitRole,
      visibility: project.visibility,
      workspaceRole: actor.role,
    };
    if (!canAccessProject(context, "project:view")) {
      throw new ApiProblem(404, "project_not_found", "Project was not found");
    }
    if (!canAccessProject(context, action)) {
      throw new ApiProblem(403, "forbidden", "You do not have permission for this action");
    }
    return { actor, project };
  }
}
