export const statusCategories = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
] as const;

export type StatusCategory = (typeof statusCategories)[number];

export type TaskLifecycleTimestamps = Readonly<{
  firstStartedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
}>;

export type TaskLifecycleActivity =
  | "task-status-changed"
  | "task-completed"
  | "task-reopened"
  | "task-canceled";

export type TaskStatusCategoryTransition = Readonly<{
  activity: TaskLifecycleActivity;
  timestamps: TaskLifecycleTimestamps;
}>;

export function isTerminalStatusCategory(category: StatusCategory): boolean {
  return category === "completed" || category === "canceled";
}

export function applyStatusCategoryTransition(
  from: StatusCategory,
  to: StatusCategory,
  current: TaskLifecycleTimestamps,
  occurredAt: Date,
): TaskStatusCategoryTransition {
  if (Number.isNaN(occurredAt.getTime())) {
    throw new TypeError("occurredAt must be a valid date");
  }

  const enteredStarted = from !== "started" && to === "started";
  const enteredCompleted = from !== "completed" && to === "completed";
  const enteredCanceled = from !== "canceled" && to === "canceled";
  const reopened = isTerminalStatusCategory(from) && !isTerminalStatusCategory(to);

  const timestamps: TaskLifecycleTimestamps = {
    firstStartedAt:
      current.firstStartedAt ?? (enteredStarted ? new Date(occurredAt.getTime()) : null),
    completedAt: enteredCompleted
      ? new Date(occurredAt.getTime())
      : to === "completed"
        ? current.completedAt
        : null,
    canceledAt: enteredCanceled
      ? new Date(occurredAt.getTime())
      : to === "canceled"
        ? current.canceledAt
        : null,
  };

  let activity: TaskLifecycleActivity = "task-status-changed";

  if (enteredCompleted) {
    activity = "task-completed";
  } else if (enteredCanceled) {
    activity = "task-canceled";
  } else if (reopened) {
    activity = "task-reopened";
  }

  return { activity, timestamps };
}
