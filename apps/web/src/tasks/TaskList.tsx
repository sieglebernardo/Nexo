import type {
  ProjectSummary,
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
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  archiveTask,
  createTask,
  getTasks,
  getWorkflow,
  restoreTask,
  transitionTask,
  updateTask,
} from "../api/client.js";

type TaskListProps = Readonly<{
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
  dueDate?: string | null;
  task: TaskSummary;
  title?: string;
}>;
type TransitionVariables = Readonly<{ status: TaskListStatus; task: TaskSummary }>;

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

function TaskRow({
  canContribute,
  isSaving,
  onArchive,
  onDueDate,
  onRename,
  onRestore,
  onTransition,
  statuses,
  task,
}: Readonly<{
  canContribute: boolean;
  isSaving: boolean;
  onArchive: (task: TaskSummary) => void;
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

  return (
    <div className={`task-row${isSaving ? " is-optimistic" : ""}`}>
      <span className="task-identifier">{task.identifier}</span>
      <div className="task-main">
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
        <span className="task-meta">
          Updated {new Date(task.updatedAt).toLocaleDateString()}
          {isSaving && <strong aria-live="polite"> · Saving…</strong>}
        </span>
      </div>
      <label className="task-control">
        <span className="sr-only">Status for {task.identifier}</span>
        <span className="status-dot" style={{ backgroundColor: task.status.color }} />
        <select
          aria-label={`Status for ${task.identifier}`}
          disabled={!canContribute || isArchived || isSaving}
          onChange={(event) => {
            const status = statuses.find((candidate) => candidate.id === event.target.value);
            if (status) onTransition(task, status);
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
      <label className="task-control due-date-control">
        <span className="sr-only">Due date for {task.identifier}</span>
        <input
          aria-label={`Due date for ${task.identifier}`}
          disabled={!canContribute || isArchived || isSaving}
          onChange={(event) => onDueDate(task, event.target.value || null)}
          type="date"
          value={task.dueDate ?? ""}
        />
      </label>
      {canContribute ? (
        <button
          className="text-button task-archive-button"
          disabled={isSaving}
          onClick={() => (isArchived ? onRestore(task) : onArchive(task))}
          type="button"
        >
          {isArchived ? "Restore" : "Archive"}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

export function TaskList({ errorMessage, project, workspace }: TaskListProps) {
  const queryClient = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const queryKey = [
    "workspaces",
    workspace.id,
    "projects",
    project.id,
    "tasks",
    archived ? "archived" : "active",
  ] as TaskQueryKey;
  const taskQueryPrefix = ["workspaces", workspace.id, "projects", project.id, "tasks"] as const;
  const workflow = useQuery({
    queryFn: ({ signal }) => getWorkflow(workspace.id, project.id, signal),
    queryKey: ["workspaces", workspace.id, "projects", project.id, "workflow"],
  });
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
  const activeStatuses = useMemo(
    () =>
      workflow.data?.statuses
        .filter((status) => !status.isRetired)
        .map(({ category, color, id, name }) => ({ category, color, id, name })) ?? [],
    [workflow.data],
  );
  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: taskQueryPrefix });

  const create = useMutation({
    mutationFn: () =>
      createTask(workspace.id, project.id, { dueDate: dueDate || null, title: title.trim() }),
    onSuccess: async () => {
      setTitle("");
      setDueDate("");
      await invalidateTasks();
    },
  });
  const edit = useMutation<TaskSummary, Error, EditVariables, MutationContext>({
    mutationFn: ({ dueDate: nextDueDate, task, title: nextTitle }) =>
      updateTask(workspace.id, project.id, task.id, {
        ...(nextDueDate !== undefined ? { dueDate: nextDueDate } : {}),
        ...(nextTitle !== undefined ? { title: nextTitle } : {}),
        version: task.version,
      }),
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskPages>(queryKey);
      queryClient.setQueryData<TaskPages>(queryKey, (current) =>
        replaceTask(current, variables.task.id, (task) => ({
          ...task,
          ...(variables.dueDate !== undefined ? { dueDate: variables.dueDate } : {}),
          ...(variables.title !== undefined ? { title: variables.title } : {}),
          updatedAt: new Date().toISOString(),
          version: task.version + 1,
        })),
      );
      return { previous, queryKey };
    },
    onSettled: invalidateTasks,
    onSuccess: (updated, _variables, context) => {
      queryClient.setQueryData<TaskPages>(context.queryKey, (current) =>
        replaceTask(current, updated.id, () => updated),
      );
    },
  });
  const transition = useMutation<TaskSummary, Error, TransitionVariables, MutationContext>({
    mutationFn: ({ status, task }) =>
      transitionTask(workspace.id, project.id, task.id, {
        statusId: status.id,
        version: task.version,
      }),
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
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
    onSettled: invalidateTasks,
    onSuccess: (updated, _variables, context) => {
      queryClient.setQueryData<TaskPages>(context.queryKey, (current) =>
        replaceTask(current, updated.id, () => updated),
      );
    },
  });
  const archive = useMutation<TaskSummary, Error, TaskSummary, MutationContext>({
    mutationFn: (task: TaskSummary) => archiveTask(workspace.id, project.id, task.id, task.version),
    onError: (_error, _task, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
    },
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskPages>(queryKey);
      queryClient.setQueryData<TaskPages>(queryKey, (current) => removeTask(current, task.id));
      return { previous, queryKey };
    },
    onSettled: invalidateTasks,
  });
  const restore = useMutation<TaskSummary, Error, TaskSummary, MutationContext>({
    mutationFn: (task: TaskSummary) => restoreTask(workspace.id, project.id, task.id, task.version),
    onError: (_error, _task, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
    },
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskPages>(queryKey);
      queryClient.setQueryData<TaskPages>(queryKey, (current) => removeTask(current, task.id));
      return { previous, queryKey };
    },
    onSettled: invalidateTasks,
  });

  const taskItems = taskQuery.data?.pages.flatMap((page) => page.tasks) ?? [];
  const pendingTaskId =
    (edit.isPending && edit.variables.task.id) ||
    (transition.isPending && transition.variables.task.id) ||
    (archive.isPending && archive.variables.id) ||
    (restore.isPending && restore.variables.id) ||
    null;
  const mutationError = edit.error ?? transition.error ?? archive.error ?? restore.error;

  return (
    <article className="panel-card task-list-card">
      <div className="task-list-heading">
        <div>
          <span className="eyebrow">Project tasks</span>
          <h2>{archived ? "Archived tasks" : "Task list"}</h2>
          <p>
            {project.abilities.canContribute
              ? "Create work, move it through this project's workflow, and keep due dates visible."
              : "You have read-only access to this project's tasks."}
          </p>
        </div>
        <fieldset className="task-view-toggle">
          <legend className="sr-only">Task visibility</legend>
          <button
            className={!archived ? "is-active" : ""}
            onClick={() => setArchived(false)}
            type="button"
          >
            Active
          </button>
          <button
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
            <span className="sr-only">Task title</span>
            <input
              maxLength={240}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add a task…"
              required
              value={title}
            />
          </label>
          <label>
            <span className="sr-only">Due date</span>
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
      {workflow.isError && project.abilities.canContribute && (
        <div className="notice is-error">Statuses unavailable: {errorMessage(workflow.error)}</div>
      )}
      {mutationError && (
        <div className="notice is-error" role="alert">
          Your change was rolled back. {errorMessage(mutationError)}
        </div>
      )}

      {taskQuery.isPending && <div className="table-state">Loading tasks…</div>}
      {taskQuery.isError && !taskQuery.data && (
        <div className="empty-state">
          <h3>Tasks couldn’t be loaded</h3>
          <p>{errorMessage(taskQuery.error)}</p>
          <button className="secondary-button" onClick={() => taskQuery.refetch()} type="button">
            Try again
          </button>
        </div>
      )}
      {create.isPending && !archived && (
        <div className="task-row is-optimistic" aria-live="polite">
          <span className="task-identifier">New</span>
          <div className="task-main">
            <strong>{title.trim()}</strong>
            <span className="task-meta">Creating task…</span>
          </div>
        </div>
      )}
      {taskQuery.data && taskItems.length === 0 && !create.isPending && (
        <div className="empty-state">
          <h3>{archived ? "No archived tasks" : "No tasks yet"}</h3>
          <p>
            {archived
              ? "Archived tasks will stay recoverable here."
              : project.abilities.canContribute
                ? "Add the first task above."
                : "A project contributor has not added any tasks yet."}
          </p>
        </div>
      )}
      {taskItems.length > 0 && (
        <div className="task-list">
          {taskItems.map((task) => (
            <TaskRow
              canContribute={project.abilities.canContribute}
              isSaving={pendingTaskId === task.id}
              key={task.id}
              onArchive={(candidate) => archive.mutate(candidate)}
              onDueDate={(candidate, value) => edit.mutate({ dueDate: value, task: candidate })}
              onRename={(candidate, value) => edit.mutate({ task: candidate, title: value })}
              onRestore={(candidate) => restore.mutate(candidate)}
              onTransition={(candidate, status) => transition.mutate({ status, task: candidate })}
              statuses={activeStatuses}
              task={task}
            />
          ))}
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
