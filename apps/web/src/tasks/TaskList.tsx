import type {
  ProjectSummary,
  TaskAssignee,
  TaskListResponse,
  TaskListStatus,
  TaskSummary,
  WorkspaceSummary,
} from "@nexo/contracts";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";

import {
  archiveTask,
  createTask,
  getTaskAssignees,
  getTasks,
  getWorkflow,
  restoreTask,
  transitionTask,
  updateTask,
} from "../api/client.js";
import { FieldLabel } from "../ui/FieldLabel.js";

type TaskBoardProps = Readonly<{
  errorMessage: (error: unknown) => string;
  project: ProjectSummary;
  workspace: WorkspaceSummary;
}>;

type TaskPages = InfiniteData<TaskListResponse, string | null>;
type TaskQueryKey = readonly [
  "workspaces",
  string,
  "projects",
  string,
  "tasks",
  "active" | "archived",
];
type MutationContext = Readonly<{
  previous: TaskPages | undefined;
  queryKey: TaskQueryKey;
}>;
type EditVariables = Readonly<{
  assignee?: TaskAssignee | null;
  dueDate?: string | null;
  task: TaskSummary;
  title?: string;
}>;
type TransitionVariables = Readonly<{ status: TaskListStatus; task: TaskSummary }>;
type BoardStatus = TaskListStatus & Readonly<{ isRetired: boolean }>;

function replaceTask(
  data: TaskPages | undefined,
  taskId: string,
  update: (task: TaskSummary) => TaskSummary,
): TaskPages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      tasks: page.tasks.map((task) => (task.id === taskId ? update(task) : task)),
    })),
  };
}

function removeTask(data: TaskPages | undefined, taskId: string): TaskPages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      tasks: page.tasks.filter((task) => task.id !== taskId),
    })),
  };
}

function TaskCard({
  assignees,
  canContribute,
  isSaving,
  onArchive,
  onAssignee,
  onDragEnd,
  onDragStart,
  onDueDate,
  onRename,
  onRestore,
  onTransition,
  statuses,
  task,
}: Readonly<{
  assignees: TaskAssignee[];
  canContribute: boolean;
  isSaving: boolean;
  onArchive: (task: TaskSummary) => void;
  onAssignee: (task: TaskSummary, assignee: TaskAssignee | null) => void;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, task: TaskSummary) => void;
  onDueDate: (task: TaskSummary, dueDate: string | null) => void;
  onRename: (task: TaskSummary, title: string) => void;
  onRestore: (task: TaskSummary) => void;
  onTransition: (task: TaskSummary, status: TaskListStatus) => void;
  statuses: TaskListStatus[];
  task: TaskSummary;
}>) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  useEffect(() => setTitle(task.title), [task.title]);
  const isArchived = task.archivedAt !== null;
  const statusOptions = statuses.some((status) => status.id === task.status.id)
    ? statuses
    : [task.status, ...statuses];
  const assigneeOptions =
    task.assignee && !assignees.some((assignee) => assignee.id === task.assignee?.id)
      ? [task.assignee, ...assignees]
      : assignees;

  return (
    <article
      aria-label={`${task.identifier}: ${task.title}`}
      className={`task-card${isSaving ? " is-optimistic" : ""}`}
      draggable={canContribute && !isArchived && !isSaving}
      onDragEnd={onDragEnd}
      onDragStart={(event) => onDragStart(event, task)}
    >
      <div className="task-card-topline">
        <span className="task-identifier">{task.identifier}</span>
        {canContribute && !isArchived && (
          <span className="task-drag-handle" aria-hidden="true" title="Drag to change status">
            ⠿
          </span>
        )}
      </div>

      {isEditing ? (
        <form
          className="task-title-form"
          onSubmit={(event) => {
            event.preventDefault();
            const nextTitle = title.trim();
            if (nextTitle && nextTitle !== task.title) onRename(task, nextTitle);
            setIsEditing(false);
          }}
        >
          <input
            aria-label={`Rename ${task.identifier}`}
            maxLength={240}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
          <div className="task-title-actions">
            <button className="text-button" disabled={isSaving} type="submit">
              Save
            </button>
            <button
              className="text-button"
              onClick={() => {
                setTitle(task.title);
                setIsEditing(false);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className="task-title-button"
          disabled={!canContribute || isArchived || isSaving}
          onClick={() => setIsEditing(true)}
          type="button"
        >
          {task.title}
        </button>
      )}

      <div className="task-card-controls">
        <label className="task-control status-control">
          <span>Status</span>
          <span className="status-dot" style={{ backgroundColor: task.status.color }} />
          <select
            aria-label={`Status for ${task.identifier}`}
            disabled={!canContribute || isArchived || isSaving}
            onChange={(event) => {
              const status = statuses.find((candidate) => candidate.id === event.target.value);
              if (status && status.id !== task.status.id) onTransition(task, status);
            }}
            value={task.status.id}
          >
            {statusOptions.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        </label>

        <label className="task-control">
          <span>Assignee</span>
          <select
            aria-label={`Assignee for ${task.identifier}`}
            disabled={!canContribute || isArchived || isSaving}
            onChange={(event) => {
              const assignee =
                assignees.find((candidate) => candidate.id === event.target.value) ?? null;
              onAssignee(task, assignee);
            }}
            value={task.assignee?.id ?? ""}
          >
            <option value="">Unassigned</option>
            {assigneeOptions.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
        </label>

        <label className="task-control due-date-control">
          <span>Due date</span>
          <input
            aria-label={`Due date for ${task.identifier}`}
            disabled={!canContribute || isArchived || isSaving}
            onChange={(event) => onDueDate(task, event.target.value || null)}
            type="date"
            value={task.dueDate ?? ""}
          />
        </label>
      </div>

      <div className="task-card-footer">
        <span className="task-meta">
          Updated {new Date(task.updatedAt).toLocaleDateString()}
          {isSaving && <strong aria-live="polite"> · Saving…</strong>}
        </span>
        {canContribute && (
          <button
            className="text-button task-archive-button"
            disabled={isSaving}
            onClick={() => (isArchived ? onRestore(task) : onArchive(task))}
            type="button"
          >
            {isArchived ? "Restore" : "Archive"}
          </button>
        )}
      </div>
    </article>
  );
}

export function TaskBoard({ errorMessage, project, workspace }: TaskBoardProps) {
  const queryClient = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [hasInitializedAssignee, setHasInitializedAssignee] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string>();
  const [dropStatusId, setDropStatusId] = useState<string>();
  const queryKey = [
    "workspaces",
    workspace.id,
    "projects",
    project.id,
    "tasks",
    archived ? "archived" : "active",
  ] as TaskQueryKey;
  const taskQueryPrefix = ["workspaces", workspace.id, "projects", project.id, "tasks"] as const;
  const activeTaskQueryKey = [
    "workspaces",
    workspace.id,
    "projects",
    project.id,
    "tasks",
    "active",
  ] as const;
  const archivedTaskQueryKey = [
    "workspaces",
    workspace.id,
    "projects",
    project.id,
    "tasks",
    "archived",
  ] as const;
  const workflow = useQuery({
    queryFn: ({ signal }) => getWorkflow(workspace.id, project.id, signal),
    queryKey: ["workspaces", workspace.id, "projects", project.id, "workflow"],
  });
  const assignees = useQuery({
    enabled: project.abilities.canContribute,
    queryFn: ({ signal }) => getTaskAssignees(workspace.id, project.id, signal),
    queryKey: ["workspaces", workspace.id, "projects", project.id, "task-assignees"],
  });
  useEffect(() => {
    if (assignees.data && !hasInitializedAssignee) {
      if (assignees.data.assignees.some((assignee) => assignee.id === workspace.membershipId)) {
        setNewAssigneeId(workspace.membershipId);
      }
      setHasInitializedAssignee(true);
    }
  }, [assignees.data, hasInitializedAssignee, workspace.membershipId]);
  const taskQuery = useInfiniteQuery<
    TaskListResponse,
    Error,
    TaskPages,
    typeof queryKey,
    string | null
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      getTasks(
        workspace.id,
        project.id,
        {
          archived,
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: 50,
        },
        signal,
      ),
    queryKey,
  });
  const taskItems = taskQuery.data?.pages.flatMap((page) => page.tasks) ?? [];
  const activeStatuses = useMemo(
    () =>
      workflow.data?.statuses
        .filter((status) => !status.isRetired)
        .map(({ category, color, id, name }) => ({ category, color, id, name })) ?? [],
    [workflow.data],
  );
  const boardStatuses = useMemo<BoardStatus[]>(() => {
    const currentStatusIds = new Set(taskItems.map((task) => task.status.id));
    const statuses =
      workflow.data?.statuses
        .filter((status) => !status.isRetired || currentStatusIds.has(status.id))
        .map(({ category, color, id, isRetired, name }) => ({
          category,
          color,
          id,
          isRetired,
          name,
        })) ?? [];
    const knownIds = new Set(statuses.map((status) => status.id));
    for (const task of taskItems) {
      if (!knownIds.has(task.status.id)) {
        statuses.push({ ...task.status, isRetired: true });
        knownIds.add(task.status.id);
      }
    }
    return statuses;
  }, [taskItems, workflow.data]);
  const defaultStatusId = workflow.data?.statuses.find(
    (status) => status.isDefault && !status.isRetired,
  )?.id;
  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: taskQueryPrefix });

  const create = useMutation({
    mutationFn: () =>
      createTask(workspace.id, project.id, {
        assigneeId: newAssigneeId || null,
        dueDate: dueDate || null,
        title: title.trim(),
      }),
    onSuccess: async () => {
      setTitle("");
      setDueDate("");
      setNewAssigneeId(workspace.membershipId);
      await queryClient.invalidateQueries({ queryKey: activeTaskQueryKey });
    },
  });
  const edit = useMutation<TaskSummary, Error, EditVariables, MutationContext>({
    mutationFn: ({ assignee, dueDate: nextDueDate, task, title: nextTitle }) =>
      updateTask(workspace.id, project.id, task.id, {
        ...(assignee !== undefined ? { assigneeId: assignee?.id ?? null } : {}),
        ...(nextDueDate !== undefined ? { dueDate: nextDueDate } : {}),
        ...(nextTitle !== undefined ? { title: nextTitle } : {}),
        version: task.version,
      }),
    onError: async (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      await invalidateTasks();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskPages>(queryKey);
      queryClient.setQueryData<TaskPages>(queryKey, (current) =>
        replaceTask(current, variables.task.id, (task) => ({
          ...task,
          ...(variables.assignee !== undefined ? { assignee: variables.assignee } : {}),
          ...(variables.dueDate !== undefined ? { dueDate: variables.dueDate } : {}),
          ...(variables.title !== undefined ? { title: variables.title } : {}),
          updatedAt: new Date().toISOString(),
          version: task.version + 1,
        })),
      );
      return { previous, queryKey };
    },
    onSuccess: async (updated, variables, context) => {
      queryClient.setQueryData<TaskPages>(context.queryKey, (current) =>
        replaceTask(current, updated.id, () => updated),
      );
      if (variables.assignee !== undefined) await invalidateTasks();
    },
  });
  const transition = useMutation<TaskSummary, Error, TransitionVariables, MutationContext>({
    mutationFn: ({ status, task }) =>
      transitionTask(workspace.id, project.id, task.id, {
        statusId: status.id,
        version: task.version,
      }),
    onError: async (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      await invalidateTasks();
    },
    onMutate: async ({ status, task }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskPages>(queryKey);
      queryClient.setQueryData<TaskPages>(queryKey, (current) =>
        replaceTask(current, task.id, (candidate) => ({
          ...candidate,
          status,
          updatedAt: new Date().toISOString(),
          version: candidate.version + 1,
        })),
      );
      return { previous, queryKey };
    },
    onSuccess: (updated, _variables, context) => {
      queryClient.setQueryData<TaskPages>(context.queryKey, (current) =>
        replaceTask(current, updated.id, () => updated),
      );
    },
  });
  const archive = useMutation<TaskSummary, Error, TaskSummary, MutationContext>({
    mutationFn: (task) => archiveTask(workspace.id, project.id, task.id, task.version),
    onError: async (_error, _task, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      await invalidateTasks();
    },
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskPages>(queryKey);
      queryClient.setQueryData<TaskPages>(queryKey, (current) => removeTask(current, task.id));
      return { previous, queryKey };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: archivedTaskQueryKey });
    },
  });
  const restore = useMutation<TaskSummary, Error, TaskSummary, MutationContext>({
    mutationFn: (task) => restoreTask(workspace.id, project.id, task.id, task.version),
    onError: async (_error, _task, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      await invalidateTasks();
    },
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskPages>(queryKey);
      queryClient.setQueryData<TaskPages>(queryKey, (current) => removeTask(current, task.id));
      return { previous, queryKey };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: activeTaskQueryKey });
    },
  });

  const pendingTaskId =
    (edit.isPending && edit.variables.task.id) ||
    (transition.isPending && transition.variables.task.id) ||
    (archive.isPending && archive.variables.id) ||
    (restore.isPending && restore.variables.id) ||
    null;
  const mutationError = edit.error ?? transition.error ?? archive.error ?? restore.error;
  const draggedTask = taskItems.find((task) => task.id === draggedTaskId);

  const startDragging = (event: DragEvent<HTMLElement>, task: TaskSummary) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    setDraggedTaskId(task.id);
  };
  const stopDragging = () => {
    setDraggedTaskId(undefined);
    setDropStatusId(undefined);
  };

  return (
    <article className="panel-card task-board-card">
      <div className="task-list-heading">
        <div>
          <span className="eyebrow">Project tasks</span>
          <h2>{archived ? "Archived task board" : "Task board"}</h2>
          <p>
            {project.abilities.canContribute
              ? "Drag cards between workflow columns, or use each card’s status control."
              : "You have read-only access to this project’s task board."}
          </p>
        </div>
        <fieldset className="task-view-toggle">
          <legend className="sr-only">Task archive visibility</legend>
          <button
            aria-pressed={!archived}
            className={!archived ? "is-active" : ""}
            onClick={() => setArchived(false)}
            type="button"
          >
            Active
          </button>
          <button
            aria-pressed={archived}
            className={archived ? "is-active" : ""}
            onClick={() => setArchived(true)}
            type="button"
          >
            Archived
          </button>
        </fieldset>
      </div>

      {!archived && project.abilities.canContribute && (
        <form
          className="task-create-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (title.trim()) create.mutate();
          }}
        >
          <label>
            <FieldLabel required>Task title</FieldLabel>
            <input
              maxLength={240}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add a task…"
              required
              value={title}
            />
          </label>
          <label>
            <FieldLabel>Assignee</FieldLabel>
            <select
              aria-label="New task assignee"
              onChange={(event) => setNewAssigneeId(event.target.value)}
              value={newAssigneeId}
            >
              <option value="">Unassigned</option>
              {assignees.data?.assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <FieldLabel>Due date</FieldLabel>
            <input
              aria-label="New task due date"
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </label>
          <button className="primary-button" disabled={create.isPending} type="submit">
            {create.isPending ? "Adding…" : "Add task"}
          </button>
        </form>
      )}

      {create.isError && <div className="notice is-error">{errorMessage(create.error)}</div>}
      {assignees.isError && project.abilities.canContribute && (
        <div className="notice is-error">
          Assignees unavailable: {errorMessage(assignees.error)}
        </div>
      )}
      {workflow.isError && (
        <div className="notice is-error">Statuses unavailable: {errorMessage(workflow.error)}</div>
      )}
      {mutationError && (
        <div className="notice is-error" role="alert">
          Your change was rolled back. {errorMessage(mutationError)}
        </div>
      )}

      {(taskQuery.isPending || workflow.isPending) && (
        <div className="table-state">Loading task board…</div>
      )}
      {taskQuery.isError && !taskQuery.data && (
        <div className="empty-state">
          <h3>The task board couldn’t be loaded</h3>
          <p>{errorMessage(taskQuery.error)}</p>
          <button className="secondary-button" onClick={() => taskQuery.refetch()} type="button">
            Try again
          </button>
        </div>
      )}

      {taskQuery.data && boardStatuses.length > 0 && (
        <section className="kanban-board" aria-label={archived ? "Archived tasks" : "Active tasks"}>
          {boardStatuses.map((status) => {
            const laneTasks = taskItems.filter((task) => task.status.id === status.id);
            const canDrop =
              project.abilities.canContribute &&
              !archived &&
              !status.isRetired &&
              draggedTask?.status.id !== status.id;
            return (
              <section
                aria-label={status.name}
                className={`kanban-lane${dropStatusId === status.id ? " is-drop-target" : ""}`}
                key={status.id}
                onDragEnter={() => {
                  if (canDrop) setDropStatusId(status.id);
                }}
                onDragOver={(event) => {
                  if (canDrop) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
                  const task = taskItems.find((candidate) => candidate.id === taskId);
                  if (
                    task &&
                    project.abilities.canContribute &&
                    !archived &&
                    !status.isRetired &&
                    task.status.id !== status.id
                  ) {
                    transition.mutate({ status, task });
                  }
                  stopDragging();
                }}
              >
                <header className="kanban-lane-heading">
                  <span className="kanban-status-mark" style={{ backgroundColor: status.color }} />
                  <h3>{status.name}</h3>
                  {status.isRetired && <span className="retired-label">Retired</span>}
                  <span className="count-pill">{laneTasks.length}</span>
                </header>
                <div className="kanban-lane-cards">
                  {create.isPending && status.id === defaultStatusId && (
                    <div className="task-card is-optimistic" aria-live="polite">
                      <span className="task-identifier">New</span>
                      <strong>{title.trim()}</strong>
                      <span className="task-meta">Creating task…</span>
                    </div>
                  )}
                  {laneTasks.map((task) => (
                    <TaskCard
                      assignees={assignees.data?.assignees ?? []}
                      canContribute={project.abilities.canContribute}
                      isSaving={pendingTaskId === task.id}
                      key={task.id}
                      onArchive={(candidate) => archive.mutate(candidate)}
                      onAssignee={(candidate, value) =>
                        edit.mutate({ assignee: value, task: candidate })
                      }
                      onDragEnd={stopDragging}
                      onDragStart={startDragging}
                      onDueDate={(candidate, value) =>
                        edit.mutate({ dueDate: value, task: candidate })
                      }
                      onRename={(candidate, value) =>
                        edit.mutate({ task: candidate, title: value })
                      }
                      onRestore={(candidate) => restore.mutate(candidate)}
                      onTransition={(candidate, target) =>
                        transition.mutate({ status: target, task: candidate })
                      }
                      statuses={activeStatuses}
                      task={task}
                    />
                  ))}
                  {laneTasks.length === 0 && !create.isPending && (
                    <div className="kanban-empty-lane">
                      {archived ? "No archived tasks" : "Drop tasks here"}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </section>
      )}

      {taskQuery.data && boardStatuses.length === 0 && !workflow.isPending && (
        <div className="empty-state">
          <h3>No workflow columns available</h3>
          <p>Configure at least one active status before adding tasks.</p>
        </div>
      )}
      {taskQuery.hasNextPage && (
        <button
          className="secondary-button task-load-more"
          disabled={taskQuery.isFetchingNextPage}
          onClick={() => taskQuery.fetchNextPage()}
          type="button"
        >
          {taskQuery.isFetchingNextPage ? "Loading…" : "Load more tasks"}
        </button>
      )}
    </article>
  );
}
