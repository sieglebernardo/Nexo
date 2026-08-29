import { describe, expect, it } from "vitest";

import { type WorkflowStatusConfiguration, workflowConfigurationError } from "./workflow.js";

const readyStatus = {
  category: "unstarted",
  color: "#778899",
  id: "one",
  isDefault: true,
  isRetired: false,
  name: "Ready",
} satisfies WorkflowStatusConfiguration;
const shippedStatus = {
  category: "completed",
  color: "#00AA00",
  id: "two",
  isDefault: false,
  isRetired: false,
  name: "Shipped",
} satisfies WorkflowStatusConfiguration;
const validStatuses = [readyStatus, shippedStatus] as const;

describe("workflow configuration", () => {
  it("accepts configurable names backed by stable categories", () => {
    expect(workflowConfigurationError("Delivery", validStatuses)).toBeNull();
  });

  it("requires one active non-terminal default", () => {
    expect(
      workflowConfigurationError("Delivery", [
        { ...readyStatus, isDefault: false },
        { ...shippedStatus, isDefault: true },
      ]),
    ).toBe("The default status must be active and non-terminal");
    expect(
      workflowConfigurationError(
        "Delivery",
        validStatuses.map((status) => ({ ...status, isRetired: true })),
      ),
    ).toBe("A workflow must contain at least one active status");
  });

  it("rejects duplicate status identity and display names", () => {
    expect(
      workflowConfigurationError("Delivery", [readyStatus, { ...shippedStatus, id: "one" }]),
    ).toBe("Workflow status IDs must be unique");
    expect(
      workflowConfigurationError("Delivery", [readyStatus, { ...shippedStatus, name: " ready " }]),
    ).toContain("names must be unique");
  });
});
