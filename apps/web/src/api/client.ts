import type {
  CreateInvitationBody,
  CreateProjectBody,
  CreateTaskBody,
  CreateWorkspaceBody,
  Invitation,
  InvitationListResponse,
  ProjectAccessResponse,
  ProjectListResponse,
  ProjectRole,
  ProjectSummary,
  SetProjectAccessBody,
  TaskListResponse,
  TaskSummary,
  TransitionTaskBody,
  UpdateProjectBody,
  UpdateTaskBody,
  UpdateWorkflowBody,
  Workflow,
  WorkspaceListResponse,
  WorkspaceMembersResponse,
  WorkspaceSummary,
} from "@nexo/contracts";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    throw new ApiClientError(
      response.status,
      problem?.code ?? "request_failed",
      problem?.message ?? `Request failed with status ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function getWorkspaces(signal?: AbortSignal): Promise<WorkspaceListResponse> {
  return apiRequest("/api/v1/workspaces", signal ? { signal } : undefined);
}

export function createWorkspace(input: CreateWorkspaceBody): Promise<WorkspaceSummary> {
  return apiRequest("/api/v1/workspaces", { body: JSON.stringify(input), method: "POST" });
}

export function getWorkspaceMembers(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceMembersResponse> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/members`, signal ? { signal } : undefined);
}

export function getWorkspaceInvitations(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<InvitationListResponse> {
  return apiRequest(
    `/api/v1/workspaces/${workspaceId}/invitations`,
    signal ? { signal } : undefined,
  );
}

export function inviteWorkspaceMember(
  workspaceId: string,
  input: CreateInvitationBody,
): Promise<Invitation> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/invitations`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function acceptInvitation(token: string): Promise<WorkspaceSummary> {
  return apiRequest("/api/v1/invitations/accept", {
    body: JSON.stringify({ token }),
    method: "POST",
  });
}

export function deactivateWorkspaceMember(
  workspaceId: string,
  membershipId: string,
): Promise<{ deactivatedAt: string }> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/members/${membershipId}/deactivate`, {
    method: "POST",
  });
}

export function getProjects(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<ProjectListResponse> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/projects`, signal ? { signal } : undefined);
}

export function createProject(
  workspaceId: string,
  input: CreateProjectBody,
): Promise<ProjectSummary> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/projects`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function updateProject(
  workspaceId: string,
  projectId: string,
  input: UpdateProjectBody,
): Promise<ProjectSummary> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`, {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export function getProjectAccess(
  workspaceId: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectAccessResponse> {
  return apiRequest(
    `/api/v1/workspaces/${workspaceId}/projects/${projectId}/access`,
    signal ? { signal } : undefined,
  );
}

export function setProjectAccess(
  workspaceId: string,
  projectId: string,
  input: SetProjectAccessBody,
): Promise<{ membershipId: string; role: ProjectRole }> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/access`, {
    body: JSON.stringify(input),
    method: "PUT",
  });
}

export function removeProjectAccess(
  workspaceId: string,
  projectId: string,
  membershipId: string,
): Promise<void> {
  return apiRequest(
    `/api/v1/workspaces/${workspaceId}/projects/${projectId}/access/${membershipId}`,
    { method: "DELETE" },
  );
}

export function getWorkflow(
  workspaceId: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<Workflow> {
  return apiRequest(
    `/api/v1/workspaces/${workspaceId}/projects/${projectId}/workflow`,
    signal ? { signal } : undefined,
  );
}

export function updateWorkflow(
  workspaceId: string,
  projectId: string,
  input: UpdateWorkflowBody,
): Promise<Workflow> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/workflow`, {
    body: JSON.stringify(input),
    method: "PUT",
  });
}

export function getTasks(
  workspaceId: string,
  projectId: string,
  input: Readonly<{ archived: boolean; cursor?: string; limit?: number }>,
  signal?: AbortSignal,
): Promise<TaskListResponse> {
  const query = new URLSearchParams({ archived: String(input.archived) });
  if (input.cursor) query.set("cursor", input.cursor);
  if (input.limit) query.set("limit", String(input.limit));
  return apiRequest(
    `/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks?${query}`,
    signal ? { signal } : undefined,
  );
}

export function createTask(
  workspaceId: string,
  projectId: string,
  input: CreateTaskBody,
): Promise<TaskSummary> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function updateTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  input: UpdateTaskBody,
): Promise<TaskSummary> {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`, {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export function transitionTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  input: TransitionTaskBody,
): Promise<TaskSummary> {
  return apiRequest(
    `/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/transition`,
    { body: JSON.stringify(input), method: "POST" },
  );
}

export function archiveTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  version: number,
): Promise<TaskSummary> {
  return taskArchiveOperation(workspaceId, projectId, taskId, version, "archive");
}

export function restoreTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  version: number,
): Promise<TaskSummary> {
  return taskArchiveOperation(workspaceId, projectId, taskId, version, "restore");
}

function taskArchiveOperation(
  workspaceId: string,
  projectId: string,
  taskId: string,
  version: number,
  operation: "archive" | "restore",
): Promise<TaskSummary> {
  return apiRequest(
    `/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/${operation}`,
    { body: JSON.stringify({ version }), method: "POST" },
  );
}
