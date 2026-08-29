import type {
  ProjectAccessMember,
  ProjectRole,
  ProjectSummary,
  Workflow,
  WorkflowStatus,
  WorkflowStatusCategory,
  WorkspaceSummary,
} from "@nexo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import {
  createProject,
  getProjectAccess,
  getProjects,
  getWorkflow,
  removeProjectAccess,
  setProjectAccess,
  updateProject,
  updateWorkflow,
} from "../api/client.js";
import { TaskBoard } from "../tasks/TaskList.js";

type ProjectsProps = Readonly<{
  errorMessage: (error: unknown) => string;
  workspace: WorkspaceSummary;
}>;

const categoryOptions: ReadonlyArray<{
  label: string;
  value: WorkflowStatusCategory;
}> = [
  { label: "Backlog", value: "backlog" },
  { label: "Unstarted", value: "unstarted" },
  { label: "Started", value: "started" },
  { label: "Completed", value: "completed" },
  { label: "Canceled", value: "canceled" },
];

export function Projects({ errorMessage, workspace }: ProjectsProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const projects = useQuery({
    queryFn: ({ signal }) => getProjects(workspace.id, signal),
    queryKey: ["workspaces", workspace.id, "projects"],
  });
  const selectedProject = projects.data?.projects.find(
    (project) => project.id === selectedProjectId,
  );

  if (selectedProject) {
    return (
      <ProjectDetail
        errorMessage={errorMessage}
        onBack={() => setSelectedProjectId(undefined)}
        project={selectedProject}
        workspace={workspace}
      />
    );
  }

  return (
    <section className="content content-stack">
      {workspace.abilities.canCreateProjects && workspace.generalTeamId && (
        <ProjectCreation
          errorMessage={errorMessage}
          onCreated={(project) => setSelectedProjectId(project.id)}
          workspace={workspace}
        />
      )}

      <article className="panel-card projects-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Projects</span>
            <h2>Work your team can access</h2>
            <p>Private projects appear only after someone grants project access.</p>
          </div>
          {projects.data && <span className="count-pill">{projects.data.projects.length}</span>}
        </div>

        {projects.isPending && <div className="table-state">Loading projects…</div>}
        {projects.isError && <div className="notice is-error">{errorMessage(projects.error)}</div>}
        {projects.data?.projects.length === 0 && (
          <div className="empty-state">
            <h3>No projects available</h3>
            <p>
              {workspace.abilities.canCreateProjects
                ? "Create the first project above."
                : "Ask a Project Lead to grant you access."}
            </p>
          </div>
        )}
        {projects.data && projects.data.projects.length > 0 && (
          <div className="project-grid">
            {projects.data.projects.map((project) => (
              <button
                className="project-card"
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                type="button"
              >
                <span className="project-key">{project.key}</span>
                <span className="project-card-copy">
                  <strong>{project.name}</strong>
                  <small>
                    {project.teamName} ·{" "}
                    {project.visibility === "private" ? "Private" : "Workspace"}
                  </small>
                </span>
                <span className="role-pill subtle">{project.effectiveRole}</span>
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function ProjectCreation({
  errorMessage,
  onCreated,
  workspace,
}: Readonly<{
  errorMessage: (error: unknown) => string;
  onCreated: (project: ProjectSummary) => void;
  workspace: WorkspaceSummary;
}>) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [visibility, setVisibility] = useState<"private" | "workspace">("workspace");
  const create = useMutation({
    mutationFn: () => {
      if (!workspace.generalTeamId) {
        throw new Error("A team is required to create a project");
      }
      return createProject(workspace.id, {
        key,
        name,
        teamId: workspace.generalTeamId,
        visibility,
      });
    },
    onSuccess: async (project) => {
      setName("");
      setKey("");
      setIsOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["workspaces", workspace.id, "projects"] });
      onCreated(project);
    },
  });

  if (!isOpen) {
    return (
      <div className="project-create-bar">
        <div>
          <span className="eyebrow">New project</span>
          <strong>Start with a configurable workflow</strong>
        </div>
        <button className="primary-button" onClick={() => setIsOpen(true)} type="button">
          Create project
        </button>
      </div>
    );
  }

  return (
    <article className="panel-card">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">New project</span>
          <h2>Create a focused home for work</h2>
        </div>
        <button className="text-button" onClick={() => setIsOpen(false)} type="button">
          Cancel
        </button>
      </div>
      <form
        className="project-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label>
          Name
          <input
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="Product launch"
            required
            value={name}
          />
        </label>
        <label>
          Key
          <input
            maxLength={10}
            minLength={2}
            onChange={(event) =>
              setKey(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 10),
              )
            }
            pattern="[A-Z][A-Z0-9]{1,9}"
            placeholder="NEX"
            required
            value={key}
          />
          <small>Uppercase and permanent. Used for task IDs later.</small>
        </label>
        <label>
          Visibility
          <select
            onChange={(event) => setVisibility(event.target.value as typeof visibility)}
            value={visibility}
          >
            <option value="workspace">Workspace-visible</option>
            <option value="private">Private</option>
          </select>
          <small>Guests always need explicit project access.</small>
        </label>
        <button className="primary-button fit-button" disabled={create.isPending} type="submit">
          {create.isPending ? "Creating…" : "Create project"}
        </button>
      </form>
      {create.isError && (
        <div className="notice is-error inline-notice">{errorMessage(create.error)}</div>
      )}
    </article>
  );
}

function ProjectDetail({
  errorMessage,
  onBack,
  project,
  workspace,
}: Readonly<{
  errorMessage: (error: unknown) => string;
  onBack: () => void;
  project: ProjectSummary;
  workspace: WorkspaceSummary;
}>) {
  const [tab, setTab] = useState<"access" | "settings" | "tasks" | "workflow">("tasks");

  return (
    <section className="content content-stack">
      <button className="back-button" onClick={onBack} type="button">
        ← All projects
      </button>
      <div className="project-detail-heading">
        <span className="project-key large-key">{project.key}</span>
        <div>
          <span className="eyebrow">{project.teamName}</span>
          <h2>{project.name}</h2>
          <p>
            {project.visibility === "private" ? "Private project" : "Workspace-visible project"} ·
            Your role: {project.effectiveRole}
          </p>
        </div>
      </div>
      <div className="detail-tabs" role="tablist" aria-label="Project configuration">
        <button
          aria-selected={tab === "tasks"}
          className={tab === "tasks" ? "is-active" : ""}
          onClick={() => setTab("tasks")}
          role="tab"
          type="button"
        >
          Tasks
        </button>
        <button
          aria-selected={tab === "workflow"}
          className={tab === "workflow" ? "is-active" : ""}
          onClick={() => setTab("workflow")}
          role="tab"
          type="button"
        >
          Workflow
        </button>
        {project.abilities.canManageAccess && (
          <button
            aria-selected={tab === "access"}
            className={tab === "access" ? "is-active" : ""}
            onClick={() => setTab("access")}
            role="tab"
            type="button"
          >
            Access
          </button>
        )}
        {project.abilities.canManageProject && (
          <button
            aria-selected={tab === "settings"}
            className={tab === "settings" ? "is-active" : ""}
            onClick={() => setTab("settings")}
            role="tab"
            type="button"
          >
            Settings
          </button>
        )}
      </div>

      {tab === "tasks" && (
        <TaskBoard errorMessage={errorMessage} project={project} workspace={workspace} />
      )}
      {tab === "workflow" && (
        <WorkflowEditor errorMessage={errorMessage} project={project} workspace={workspace} />
      )}
      {tab === "access" && project.abilities.canManageAccess && (
        <AccessManager errorMessage={errorMessage} project={project} workspace={workspace} />
      )}
      {tab === "settings" && project.abilities.canManageProject && (
        <ProjectSettings errorMessage={errorMessage} project={project} workspace={workspace} />
      )}
    </section>
  );
}

function WorkflowEditor({
  errorMessage,
  project,
  workspace,
}: ProjectsProps & { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const workflow = useQuery({
    queryFn: ({ signal }) => getWorkflow(workspace.id, project.id, signal),
    queryKey: ["workspaces", workspace.id, "projects", project.id, "workflow"],
  });
  const [draft, setDraft] = useState<Workflow>();
  useEffect(() => {
    if (workflow.data) {
      setDraft(workflow.data);
    }
  }, [workflow.data]);
  const save = useMutation({
    mutationFn: (value: Workflow) =>
      updateWorkflow(workspace.id, project.id, {
        name: value.name,
        statuses: value.statuses.map(({ position: _position, ...status }) => status),
        version: value.version,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        ["workspaces", workspace.id, "projects", project.id, "workflow"],
        updated,
      );
      setDraft(updated);
    },
  });

  if (workflow.isError) {
    return <div className="notice is-error">{errorMessage(workflow.error)}</div>;
  }
  if (workflow.isPending || !draft) {
    return <article className="panel-card table-state">Loading workflow…</article>;
  }

  const editable = project.abilities.canManageWorkflow;
  const updateStatus = (id: string, update: Partial<WorkflowStatus>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            statuses: current.statuses.map((status) =>
              status.id === id ? { ...status, ...update } : status,
            ),
          }
        : current,
    );
  };
  const moveStatus = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.statuses.length) return current;
      const statuses = [...current.statuses];
      const moving = statuses[index];
      const neighbor = statuses[target];
      if (!moving || !neighbor) return current;
      statuses[index] = neighbor;
      statuses[target] = moving;
      return {
        ...current,
        statuses: statuses.map((status, position) => ({ ...status, position })),
      };
    });
  };

  return (
    <article className="panel-card workflow-card">
      <div className="workflow-heading">
        <div>
          <span className="eyebrow">Configurable lifecycle</span>
          <h2>{editable ? "Edit workflow" : draft.name}</h2>
          <p>Stable categories preserve meaning while the names and order stay yours.</p>
        </div>
        <span className="version-pill">Version {draft.version}</span>
      </div>

      {editable && (
        <label className="workflow-name-field">
          Workflow name
          <input
            maxLength={100}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            value={draft.name}
          />
        </label>
      )}

      <div className="workflow-status-list">
        {draft.statuses.map((status, index) => (
          <div
            className={status.isRetired ? "workflow-status-row is-retired" : "workflow-status-row"}
            key={status.id}
          >
            <span className="status-color-preview" style={{ backgroundColor: status.color }} />
            {editable ? (
              <>
                <input
                  aria-label={`Name for status ${index + 1}`}
                  maxLength={80}
                  onChange={(event) => updateStatus(status.id, { name: event.target.value })}
                  value={status.name}
                />
                <input
                  aria-label={`Color for ${status.name}`}
                  className="color-input"
                  onChange={(event) => updateStatus(status.id, { color: event.target.value })}
                  type="color"
                  value={status.color}
                />
                <select
                  aria-label={`Category for ${status.name}`}
                  onChange={(event) =>
                    updateStatus(status.id, {
                      category: event.target.value as WorkflowStatusCategory,
                    })
                  }
                  value={status.category}
                >
                  {categoryOptions.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <label className="compact-control">
                  <input
                    checked={status.isDefault}
                    name="default-status"
                    onChange={() =>
                      setDraft({
                        ...draft,
                        statuses: draft.statuses.map((candidate) => ({
                          ...candidate,
                          isDefault: candidate.id === status.id,
                        })),
                      })
                    }
                    type="radio"
                  />
                  Default
                </label>
                <label className="compact-control">
                  <input
                    checked={status.isRetired}
                    disabled={status.isDefault}
                    onChange={(event) =>
                      updateStatus(status.id, { isRetired: event.target.checked })
                    }
                    type="checkbox"
                  />
                  Retired
                </label>
                <span className="order-buttons">
                  <button
                    aria-label={`Move ${status.name} up`}
                    disabled={index === 0}
                    onClick={() => moveStatus(index, -1)}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${status.name} down`}
                    disabled={index === draft.statuses.length - 1}
                    onClick={() => moveStatus(index, 1)}
                    type="button"
                  >
                    ↓
                  </button>
                </span>
              </>
            ) : (
              <>
                <span className="status-readonly-name">{status.name}</span>
                <span className="category-pill">
                  {categoryOptions.find((option) => option.value === status.category)?.label}
                </span>
                {status.isDefault && <span className="status-badge">Default</span>}
                {status.isRetired && <span className="status-badge is-muted">Retired</span>}
              </>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <div className="editor-actions">
          <button
            className="secondary-button"
            disabled={!workflow.data || save.isPending}
            onClick={() => workflow.data && setDraft(workflow.data)}
            type="button"
          >
            Reset
          </button>
          <button
            className="primary-button"
            disabled={save.isPending}
            onClick={() => save.mutate(draft)}
            type="button"
          >
            {save.isPending ? "Saving…" : "Save workflow"}
          </button>
        </div>
      )}
      {save.isError && (
        <div className="notice is-error inline-notice">{errorMessage(save.error)}</div>
      )}
      {save.isSuccess && <div className="notice is-success inline-notice">Workflow saved.</div>}
    </article>
  );
}

function AccessManager({
  errorMessage,
  project,
  workspace,
}: ProjectsProps & { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const queryKey = ["workspaces", workspace.id, "projects", project.id, "access"] as const;
  const access = useQuery({
    queryFn: ({ signal }) => getProjectAccess(workspace.id, project.id, signal),
    queryKey,
  });
  const setAccess = useMutation({
    mutationFn: ({ member, role }: { member: ProjectAccessMember; role: ProjectRole }) =>
      setProjectAccess(workspace.id, project.id, { membershipId: member.membershipId, role }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["workspaces", workspace.id, "projects"] }),
      ]);
    },
  });
  const removeAccess = useMutation({
    mutationFn: (member: ProjectAccessMember) =>
      removeProjectAccess(workspace.id, project.id, member.membershipId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["workspaces", workspace.id, "projects"] }),
      ]);
    },
  });
  const mutationError = setAccess.error ?? removeAccess.error;

  return (
    <article className="panel-card">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Project access</span>
          <h2>Leads, Contributors, and Viewers</h2>
          <p>Workspace-visible projects already give non-guests baseline Viewer access.</p>
        </div>
      </div>
      {access.isPending && <div className="table-state">Loading project access…</div>}
      {access.isError && <div className="notice is-error">{errorMessage(access.error)}</div>}
      {access.data && (
        <div className="access-list">
          {access.data.members.map((member) => (
            <div className="access-row" key={member.membershipId}>
              <span className="member-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
              <span className="access-person">
                <strong>{member.name}</strong>
                <small>
                  {member.email} · Workspace {member.workspaceRole}
                </small>
              </span>
              <select
                aria-label={`Project access for ${member.name}`}
                disabled={setAccess.isPending || removeAccess.isPending}
                onChange={(event) => {
                  const role = event.target.value as ProjectRole | "";
                  if (role) {
                    setAccess.mutate({ member, role });
                  } else if (member.projectRole) {
                    removeAccess.mutate(member);
                  }
                }}
                value={member.projectRole ?? ""}
              >
                <option value="">
                  {member.effectiveRole === "viewer" ? "Baseline Viewer" : "No access"}
                </option>
                {member.workspaceRole !== "guest" && <option value="lead">Lead</option>}
                <option value="contributor">Contributor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          ))}
        </div>
      )}
      {mutationError && (
        <div className="notice is-error inline-notice">{errorMessage(mutationError)}</div>
      )}
    </article>
  );
}

function ProjectSettings({
  errorMessage,
  project,
  workspace,
}: ProjectsProps & { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const [visibility, setVisibility] = useState(project.visibility);
  useEffect(() => {
    setName(project.name);
    setVisibility(project.visibility);
  }, [project]);
  const save = useMutation({
    mutationFn: () => updateProject(workspace.id, project.id, { name, visibility }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces", workspace.id, "projects"] });
    },
  });

  return (
    <article className="panel-card settings-card">
      <div>
        <span className="eyebrow">Project settings</span>
        <h2>Name and privacy</h2>
        <p>
          The key <strong>{project.key}</strong> is permanent. Changing visibility never grants
          Guests implicit access.
        </p>
      </div>
      <form
        className="settings-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Project name
          <input
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label>
          Visibility
          <select
            onChange={(event) => setVisibility(event.target.value as typeof visibility)}
            value={visibility}
          >
            <option value="workspace">Workspace-visible</option>
            <option value="private">Private</option>
          </select>
        </label>
        <button className="primary-button fit-button" disabled={save.isPending} type="submit">
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
      </form>
      {save.isError && <div className="notice is-error">{errorMessage(save.error)}</div>}
      {save.isSuccess && <div className="notice is-success">Project settings saved.</div>}
    </article>
  );
}
