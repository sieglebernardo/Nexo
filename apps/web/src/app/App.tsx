import type {
  TaskBoardVisibility,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from "@nexo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import {
  ApiClientError,
  acceptInvitation,
  createWorkspace,
  deactivateWorkspaceMember,
  getWorkspaceInvitations,
  getWorkspaceMembers,
  getWorkspaceSettings,
  getWorkspaces,
  inviteWorkspaceMember,
  updateWorkspaceSettings,
} from "../api/client.js";
import { authClient } from "../auth/client.js";
import { Projects } from "../projects/Projects.js";

const workspaceQueryKey = ["workspaces"] as const;
const authNoticeStorageKey = "nexo.auth-notice";

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function LoadingScreen({ label }: Readonly<{ label: string }>) {
  return (
    <main className="centered-screen" aria-live="polite">
      <div className="loading-mark" aria-hidden="true">
        N
      </div>
      <p>{label}</p>
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | undefined>(
    () => sessionStorage.getItem(authNoticeStorageKey) ?? undefined,
  );
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
    sessionStorage.removeItem(authNoticeStorageKey);
    setIsSubmitting(true);

    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          callbackURL: window.location.origin,
          email,
          name,
          password,
        });
        if (result.error) {
          setError(result.error.message ?? "Could not create your account");
        } else {
          const notice = "Check your inbox to verify your email, then sign in.";
          sessionStorage.setItem(authNoticeStorageKey, notice);
          setMessage(notice);
          setMode("sign-in");
          setPassword("");
        }
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          setError(result.error.message ?? "Could not sign in");
        } else {
          sessionStorage.removeItem(authNoticeStorageKey);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand-row brand-row-light">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>Nexo</span>
        </div>
        <div>
          <span className="eyebrow eyebrow-inverse">Shared clarity</span>
          <h1>Keep the work moving without losing the thread.</h1>
          <p>
            One focused workspace for teams to decide, assign, and deliver—without enterprise
            overhead.
          </p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">Welcome to Nexo</span>
          <h2>{mode === "sign-in" ? "Sign in to your workspace" : "Create your account"}</h2>
          <p className="muted-copy">
            {mode === "sign-in"
              ? "Use your verified email address to continue."
              : "We’ll verify your email before creating a workspace."}
          </p>

          <fieldset className="auth-tabs">
            <legend className="sr-only">Authentication mode</legend>
            <button
              className={mode === "sign-in" ? "is-active" : ""}
              onClick={() => {
                sessionStorage.removeItem(authNoticeStorageKey);
                setMessage(undefined);
                setMode("sign-in");
              }}
              type="button"
            >
              Sign in
            </button>
            <button
              className={mode === "sign-up" ? "is-active" : ""}
              onClick={() => {
                sessionStorage.removeItem(authNoticeStorageKey);
                setMessage(undefined);
                setMode("sign-up");
              }}
              type="button"
            >
              Create account
            </button>
          </fieldset>

          <form className="stack-form" onSubmit={submit}>
            {mode === "sign-up" && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
            )}
            <label>
              Email
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                minLength={10}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              {mode === "sign-up" && <small>At least 10 characters</small>}
            </label>

            {message && <div className="notice is-success">{message}</div>}
            {error && <div className="notice is-error">{error}</div>}

            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Onboarding() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [timezone, setTimezone] = useState(detectedTimezone);
  const mutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: async (workspace) => {
      localStorage.setItem("nexo.active-workspace", workspace.id);
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey });
    },
  });

  return (
    <main className="onboarding-layout">
      <div className="onboarding-card">
        <div className="step-mark">01</div>
        <span className="eyebrow">Create your workspace</span>
        <h1>Give your team a home.</h1>
        <p>
          We’ll create your Owner membership and a General team together. You can invite teammates
          next.
        </p>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ name, timezone });
          }}
        >
          <label>
            Workspace name
            <input
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Product"
              required
              value={name}
            />
          </label>
          <label>
            Workspace timezone
            <input
              maxLength={100}
              onChange={(event) => setTimezone(event.target.value)}
              required
              value={timezone}
            />
            <small>Used for date-only due dates later.</small>
          </label>
          {mutation.isError && (
            <div className="notice is-error">{errorMessage(mutation.error)}</div>
          )}
          <button className="primary-button" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? "Creating workspace…" : "Create workspace"}
          </button>
        </form>
      </div>
    </main>
  );
}

function InvitationAcceptance({ token }: Readonly<{ token: string }>) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: async (workspace) => {
      localStorage.setItem("nexo.active-workspace", workspace.id);
      window.history.replaceState({}, "", window.location.pathname);
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey });
    },
  });

  useEffect(() => {
    if (mutation.isIdle) {
      mutation.mutate();
    }
  }, [mutation]);

  if (mutation.isError) {
    return (
      <main className="onboarding-layout">
        <div className="onboarding-card compact-card">
          <span className="eyebrow">Invitation</span>
          <h1>We couldn’t accept this invite.</h1>
          <div className="notice is-error">{errorMessage(mutation.error)}</div>
          <button
            className="secondary-button"
            onClick={() => window.location.assign(window.location.pathname)}
            type="button"
          >
            Continue to Nexo
          </button>
        </div>
      </main>
    );
  }

  return <LoadingScreen label="Joining workspace…" />;
}

function WorkspaceHome({ workspace }: Readonly<{ workspace: WorkspaceSummary }>) {
  return (
    <section className="content">
      <div className="welcome-panel">
        <div>
          <span className="eyebrow">Your workspace</span>
          <h2>Welcome to {workspace.name}</h2>
          <p>Create a project, shape its workflow, and give collaborators the access they need.</p>
        </div>
        <span className="role-pill">{workspace.role}</span>
      </div>

      <div className="metric-grid">
        {workspace.abilities.canViewTeams && (
          <article className="metric-card">
            <span className="metric-icon">G</span>
            <div>
              <strong>General</strong>
              <p>Your default team is ready.</p>
            </div>
          </article>
        )}
        <article className="metric-card">
          <span className="metric-icon">{workspace.timezone.slice(0, 1)}</span>
          <div>
            <strong>{workspace.timezone}</strong>
            <p>Workspace date context</p>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon">{workspace.role.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{workspace.role}</strong>
            <p>Your workspace role</p>
          </div>
        </article>
      </div>
    </section>
  );
}

function WorkspaceSettings({ workspace }: Readonly<{ workspace: WorkspaceSummary }>) {
  const queryClient = useQueryClient();
  const queryKey = ["workspaces", workspace.id, "settings"] as const;
  const [taskBoardVisibility, setTaskBoardVisibility] =
    useState<TaskBoardVisibility>("collaborative");
  const settings = useQuery({
    queryFn: ({ signal }) => getWorkspaceSettings(workspace.id, signal),
    queryKey,
  });
  useEffect(() => {
    if (settings.data) setTaskBoardVisibility(settings.data.taskBoardVisibility);
  }, [settings.data]);
  const save = useMutation({
    mutationFn: () => updateWorkspaceSettings(workspace.id, { taskBoardVisibility }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKey, updated);
      await queryClient.invalidateQueries({
        queryKey: ["workspaces", workspace.id, "projects"],
      });
    },
  });

  return (
    <section className="content content-stack">
      <article className="panel-card workspace-settings-card">
        <div>
          <span className="eyebrow">Workspace settings</span>
          <h2>Task Board Visibility</h2>
          <p>
            Choose whether project boards show everyone’s tasks or only the tasks assigned to the
            person viewing the board. Unassigned tasks are hidden in Private mode.
          </p>
        </div>

        {settings.isPending && <div className="table-state">Loading settings…</div>}
        {settings.isError && (
          <div className="notice is-error">
            {errorMessage(settings.error)}
            <button className="text-button" onClick={() => settings.refetch()} type="button">
              Try again
            </button>
          </div>
        )}
        {settings.data && (
          <form
            className="visibility-settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <fieldset>
              <legend>Board mode</legend>
              <label className={taskBoardVisibility === "collaborative" ? "is-selected" : ""}>
                <input
                  checked={taskBoardVisibility === "collaborative"}
                  name="task-board-visibility"
                  onChange={() => setTaskBoardVisibility("collaborative")}
                  type="radio"
                  value="collaborative"
                />
                <span>
                  <strong>Collaborative</strong>
                  <small>Every project member sees all tasks they can access.</small>
                </span>
              </label>
              <label className={taskBoardVisibility === "private" ? "is-selected" : ""}>
                <input
                  checked={taskBoardVisibility === "private"}
                  name="task-board-visibility"
                  onChange={() => setTaskBoardVisibility("private")}
                  type="radio"
                  value="private"
                />
                <span>
                  <strong>Private</strong>
                  <small>Each person sees only tasks assigned to their membership.</small>
                </span>
              </label>
            </fieldset>
            <button
              className="primary-button fit-button"
              disabled={save.isPending || taskBoardVisibility === settings.data.taskBoardVisibility}
              type="submit"
            >
              {save.isPending ? "Saving…" : "Save visibility"}
            </button>
          </form>
        )}
        {save.isError && <div className="notice is-error">{errorMessage(save.error)}</div>}
        {save.isSuccess && <div className="notice is-success">Board visibility saved.</div>}
      </article>
    </section>
  );
}

function MemberRow({
  canDeactivate,
  currentMembershipId,
  member,
  onDeactivate,
}: Readonly<{
  canDeactivate: boolean;
  currentMembershipId: string;
  member: WorkspaceMember;
  onDeactivate: (member: WorkspaceMember) => void;
}>) {
  const initials = member.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const isProtected = member.role === "owner" || member.id === currentMembershipId;

  return (
    <tr className={member.deactivatedAt ? "is-inactive" : ""}>
      <td>
        <div className="member-identity">
          <span className="member-avatar">{initials}</span>
          <span>
            <strong>{member.name}</strong>
            <small>{member.email}</small>
          </span>
        </div>
      </td>
      <td>
        <span className="role-pill subtle">{member.role}</span>
      </td>
      <td>
        <span className={member.deactivatedAt ? "status-badge is-muted" : "status-badge"}>
          {member.deactivatedAt ? "Inactive" : "Active"}
        </span>
      </td>
      <td className="action-cell">
        {canDeactivate && !member.deactivatedAt && !isProtected && (
          <button
            className="text-button danger-text"
            onClick={() => onDeactivate(member)}
            type="button"
          >
            Deactivate
          </button>
        )}
      </td>
    </tr>
  );
}

function Members({ workspace }: Readonly<{ workspace: WorkspaceSummary }>) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<WorkspaceRole, "owner">>("member");
  const members = useQuery({
    enabled: workspace.abilities.canListMembers,
    queryFn: ({ signal }) => getWorkspaceMembers(workspace.id, signal),
    queryKey: ["workspaces", workspace.id, "members"],
  });
  const invitations = useQuery({
    enabled: workspace.abilities.canInviteMembers,
    queryFn: ({ signal }) => getWorkspaceInvitations(workspace.id, signal),
    queryKey: ["workspaces", workspace.id, "invitations"],
  });
  const invite = useMutation({
    mutationFn: () => inviteWorkspaceMember(workspace.id, { email, role }),
    onSuccess: async () => {
      setEmail("");
      await queryClient.invalidateQueries({
        queryKey: ["workspaces", workspace.id, "invitations"],
      });
    },
  });
  const deactivate = useMutation({
    mutationFn: (member: WorkspaceMember) => deactivateWorkspaceMember(workspace.id, member.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspaces", workspace.id, "members"],
      });
    },
  });

  if (!workspace.abilities.canListMembers) {
    return (
      <section className="content">
        <div className="empty-state">
          <h2>Member directory unavailable</h2>
          <p>Your guest role only exposes resources explicitly shared with you.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="content content-stack">
      {workspace.abilities.canInviteMembers && (
        <article className="panel-card invite-card">
          <div>
            <span className="eyebrow">Grow the team</span>
            <h2>Invite a workspace member</h2>
            <p>They’ll receive a private, seven-day invitation link.</p>
          </div>
          <form
            className="invite-form"
            onSubmit={(event) => {
              event.preventDefault();
              invite.mutate();
            }}
          >
            <label>
              Email address
              <input
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Role
              <select
                onChange={(event) => setRole(event.target.value as Exclude<WorkspaceRole, "owner">)}
                value={role}
              >
                {workspace.role === "owner" && <option value="admin">Admin</option>}
                <option value="member">Member</option>
                <option value="guest">Guest</option>
              </select>
            </label>
            <button className="primary-button fit-button" disabled={invite.isPending} type="submit">
              {invite.isPending ? "Sending…" : "Send invite"}
            </button>
          </form>
          {invite.isError && <div className="notice is-error">{errorMessage(invite.error)}</div>}
          {invite.isSuccess && <div className="notice is-success">Invitation sent.</div>}
        </article>
      )}

      {workspace.abilities.canInviteMembers && invitations.data?.invitations.length ? (
        <article className="panel-card pending-card">
          <div>
            <span className="eyebrow">Pending</span>
            <h2>Open invitations</h2>
          </div>
          <div className="pending-list">
            {invitations.data.invitations.map((invitation) => (
              <div key={invitation.id}>
                <span>
                  <strong>{invitation.email}</strong>
                  <small>
                    {invitation.role} · expires{" "}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <article className="panel-card members-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Directory</span>
            <h2>Workspace members</h2>
          </div>
          {members.data && <span className="count-pill">{members.data.members.length}</span>}
        </div>

        {members.isPending && <div className="table-state">Loading members…</div>}
        {members.isError && <div className="notice is-error">{errorMessage(members.error)}</div>}
        {members.data && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {members.data.members.map((member) => (
                  <MemberRow
                    canDeactivate={
                      workspace.abilities.canDeactivateMembers &&
                      !(workspace.role === "admin" && member.role === "admin")
                    }
                    currentMembershipId={workspace.membershipId}
                    key={member.id}
                    member={member}
                    onDeactivate={(target) => {
                      if (window.confirm(`Deactivate ${target.name} from ${workspace.name}?`)) {
                        deactivate.mutate(target);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {deactivate.isError && (
          <div className="notice is-error inline-notice">{errorMessage(deactivate.error)}</div>
        )}
      </article>
    </section>
  );
}

function ApplicationShell({ workspaces }: Readonly<{ workspaces: WorkspaceSummary[] }>) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [view, setView] = useState<"home" | "members" | "projects" | "settings">("home");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => localStorage.getItem("nexo.active-workspace") ?? workspaces[0]?.id,
  );
  const workspace =
    workspaces.find((candidate) => candidate.id === activeWorkspaceId) ?? workspaces[0];

  useEffect(() => {
    if (workspace) {
      localStorage.setItem("nexo.active-workspace", workspace.id);
    }
  }, [workspace]);

  if (!workspace) {
    return null;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>Nexo</span>
        </div>

        <label className="workspace-switcher">
          <span className="workspace-avatar">{workspace.name.slice(0, 1).toUpperCase()}</span>
          <span className="workspace-select-copy">
            <small>Workspace</small>
            <select
              aria-label="Active workspace"
              onChange={(event) => {
                setActiveWorkspaceId(event.target.value);
                setView("home");
              }}
              value={workspace.id}
            >
              {workspaces.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </span>
        </label>

        <nav aria-label="Workspace">
          <button
            className={view === "home" ? "nav-item is-active" : "nav-item"}
            onClick={() => setView("home")}
            type="button"
          >
            <span className="nav-glyph home-glyph" aria-hidden="true" />
            Home
          </button>
          {workspace.abilities.canListMembers && (
            <button
              className={view === "members" ? "nav-item is-active" : "nav-item"}
              onClick={() => setView("members")}
              type="button"
            >
              <span className="nav-glyph people-glyph" aria-hidden="true" />
              Members
            </button>
          )}
          <button
            className={view === "projects" ? "nav-item is-active" : "nav-item"}
            onClick={() => setView("projects")}
            type="button"
          >
            <span className="nav-glyph" aria-hidden="true" />
            Projects
          </button>
          {workspace.role === "owner" && (
            <button
              className={view === "settings" ? "nav-item is-active" : "nav-item"}
              onClick={() => setView("settings")}
              type="button"
            >
              <span className="nav-glyph settings-glyph" aria-hidden="true" />
              Settings
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="signed-in-user">
            <span className="member-avatar small-avatar">
              {session?.user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{session?.user.name}</strong>
              <small>{session?.user.email}</small>
            </span>
          </div>
          <button
            className="nav-item"
            onClick={async () => {
              await authClient.signOut();
              queryClient.clear();
            }}
            type="button"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">{workspace.name}</span>
            <h1>
              {view === "home"
                ? "Workspace home"
                : view === "members"
                  ? "People & access"
                  : view === "projects"
                    ? "Projects & workflows"
                    : "Workspace settings"}
            </h1>
          </div>
          <div className="secure-context">
            <span aria-hidden="true">●</span>
            Verified session
          </div>
        </header>
        {view === "home" && <WorkspaceHome workspace={workspace} />}
        {view === "members" && <Members workspace={workspace} />}
        {view === "projects" && <Projects errorMessage={errorMessage} workspace={workspace} />}
        {view === "settings" && workspace.role === "owner" && (
          <WorkspaceSettings workspace={workspace} />
        )}
      </main>
    </div>
  );
}

function AuthenticatedApp() {
  const workspaces = useQuery({
    queryFn: ({ signal }) => getWorkspaces(signal),
    queryKey: workspaceQueryKey,
  });
  const invitationToken = new URLSearchParams(window.location.search).get("invitation");

  if (invitationToken) {
    return <InvitationAcceptance token={invitationToken} />;
  }
  if (workspaces.isPending) {
    return <LoadingScreen label="Loading your workspaces…" />;
  }
  if (workspaces.isError) {
    return (
      <main className="onboarding-layout">
        <div className="onboarding-card compact-card">
          <h1>We couldn’t load Nexo.</h1>
          <div className="notice is-error">{errorMessage(workspaces.error)}</div>
          <button className="primary-button" onClick={() => workspaces.refetch()} type="button">
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (workspaces.data.workspaces.length === 0) {
    return <Onboarding />;
  }

  return <ApplicationShell workspaces={workspaces.data.workspaces} />;
}

export function App() {
  const session = authClient.useSession();

  if (session.isPending) {
    return <LoadingScreen label="Restoring your session…" />;
  }
  if (!session.data?.user) {
    return <AuthScreen />;
  }

  return <AuthenticatedApp />;
}
