export function normalizeTaskTitle(title: string): string {
  return title.trim();
}

export function taskTitleError(title: string): string | null {
  const normalized = normalizeTaskTitle(title);
  if (normalized.length === 0) {
    return "Task title is required";
  }
  if (normalized.length > 240) {
    return "Task title must be 240 characters or fewer";
  }
  return null;
}

export function taskDueDateError(dueDate: string | null | undefined): string | null {
  if (dueDate === null || dueDate === undefined) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) {
    return "Due date must use YYYY-MM-DD";
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "Due date must be a real calendar date";
  }
  return null;
}
