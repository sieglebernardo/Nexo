import { describe, expect, it } from "vitest";

import { applyStatusCategoryTransition } from "./task-lifecycle.js";

const emptyTimestamps = {
  firstStartedAt: null,
  completedAt: null,
  canceledAt: null,
};

const now = new Date("2026-08-16T15:00:00.000Z");

describe("task lifecycle", () => {
  it("records the first time work starts", () => {
    const result = applyStatusCategoryTransition("unstarted", "started", emptyTimestamps, now);

    expect(result).toEqual({
      activity: "task-status-changed",
      timestamps: {
        firstStartedAt: now,
        completedAt: null,
        canceledAt: null,
      },
    });
  });

  it("completes without inventing a start timestamp", () => {
    const result = applyStatusCategoryTransition("unstarted", "completed", emptyTimestamps, now);

    expect(result.activity).toBe("task-completed");
    expect(result.timestamps).toEqual({
      firstStartedAt: null,
      completedAt: now,
      canceledAt: null,
    });
  });

  it("reopens completed work and preserves the original start", () => {
    const firstStartedAt = new Date("2026-08-15T12:00:00.000Z");
    const result = applyStatusCategoryTransition(
      "completed",
      "started",
      {
        firstStartedAt,
        completedAt: new Date("2026-08-16T12:00:00.000Z"),
        canceledAt: null,
      },
      now,
    );

    expect(result.activity).toBe("task-reopened");
    expect(result.timestamps).toEqual({
      firstStartedAt,
      completedAt: null,
      canceledAt: null,
    });
  });

  it("distinguishes cancellation from deletion", () => {
    const result = applyStatusCategoryTransition("started", "canceled", emptyTimestamps, now);

    expect(result.activity).toBe("task-canceled");
    expect(result.timestamps.canceledAt).toEqual(now);
    expect(result.timestamps.completedAt).toBeNull();
  });

  it("rejects invalid transition timestamps", () => {
    expect(() =>
      applyStatusCategoryTransition("backlog", "started", emptyTimestamps, new Date("invalid")),
    ).toThrow(TypeError);
  });
});
