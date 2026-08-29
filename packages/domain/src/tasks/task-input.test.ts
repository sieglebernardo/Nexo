import { describe, expect, it } from "vitest";

import { normalizeTaskTitle, taskDueDateError, taskTitleError } from "./task-input.js";

describe("task input", () => {
  it("normalizes and validates a human title", () => {
    expect(normalizeTaskTitle("  Ship the task list  ")).toBe("Ship the task list");
    expect(taskTitleError("   ")).toBe("Task title is required");
    expect(taskTitleError("x".repeat(241))).toBe("Task title must be 240 characters or fewer");
  });

  it("accepts only real date-only due dates", () => {
    expect(taskDueDateError("2028-02-29")).toBeNull();
    expect(taskDueDateError(null)).toBeNull();
    expect(taskDueDateError("2027-02-29")).toBe("Due date must be a real calendar date");
    expect(taskDueDateError("08/29/2026")).toBe("Due date must use YYYY-MM-DD");
  });
});
