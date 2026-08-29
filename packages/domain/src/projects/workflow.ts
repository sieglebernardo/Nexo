import { isTerminalStatusCategory, type StatusCategory } from "../tasks/task-lifecycle.js";

export type WorkflowStatusConfiguration = Readonly<{
  category: StatusCategory;
  color: string;
  id: string;
  isDefault: boolean;
  isRetired: boolean;
  name: string;
}>;

export function workflowConfigurationError(
  workflowName: string,
  statuses: readonly WorkflowStatusConfiguration[],
): string | null {
  if (workflowName.trim().length === 0 || workflowName.trim().length > 100) {
    return "Workflow name must contain between 1 and 100 characters";
  }
  if (statuses.length === 0) {
    return "A workflow must contain at least one status";
  }
  if (new Set(statuses.map((status) => status.id)).size !== statuses.length) {
    return "Workflow status IDs must be unique";
  }

  const normalizedNames = statuses.map((status) => status.name.trim().toLocaleLowerCase("en-US"));
  if (
    statuses.some((status) => status.name.trim().length === 0 || status.name.trim().length > 80) ||
    new Set(normalizedNames).size !== normalizedNames.length
  ) {
    return "Workflow status names must be unique and contain between 1 and 80 characters";
  }
  if (statuses.some((status) => !/^#[0-9A-Fa-f]{6}$/.test(status.color))) {
    return "Workflow status colors must be six-digit hexadecimal colors";
  }
  if (!statuses.some((status) => !status.isRetired)) {
    return "A workflow must contain at least one active status";
  }

  const defaults = statuses.filter((status) => status.isDefault);
  if (defaults.length !== 1) {
    return "A workflow must have exactly one default status";
  }
  const defaultStatus = defaults[0];
  if (
    !defaultStatus ||
    defaultStatus.isRetired ||
    isTerminalStatusCategory(defaultStatus.category)
  ) {
    return "The default status must be active and non-terminal";
  }

  return null;
}
