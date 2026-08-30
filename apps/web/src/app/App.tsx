import {
  type TaskBoardVisibility,
  WORKSPACE_TIMEZONES,
  type WorkspaceMember,
  type WorkspaceRole,
  type WorkspaceSummary,
  type WorkspaceTimezone,
} from "@nexo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type Ref, useEffect, useRef, useState } from "react";
import { AdminGate } from "../admin/AdminGate.js";
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
import { LandingPage } from "../landing/LandingPage.js";
import { Projects } from "../projects/Projects.js";
import { Brand } from "../ui/Brand.js";
import { FieldLabel } from "../ui/FieldLabel.js";
import { Icon, type IconName } from "../ui/Icon.js";

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
      <img alt="" className="loading-mark" height="48" src="/favicon.png" width="48" />
      <p>{label}</p>
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">(() =>
    window.location.pathname === "/signup" ? "sign-up" : "sign-in",
  );
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
        <Brand className="brand-light" />
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
          <span className="eyebrow">Welcome to Com Nexo</span>
          <h2>{mode === "sign-in" ? "Sign in to your workspace" : "Create your account"}</h2>
          <p className="muted-copy">
            {mode === "sign-in"
              ? "Use your verified email address to continue."
              : "We’ll verify your email before creating a workspace."}
          </p>

          <fieldset className="auth-tabs">
            <legend className="sr-only">Authentication mode</legend>
            <button
              aria-pressed={mode === "sign-in"}
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
              aria-pressed={mode === "sign-up"}
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
                <FieldLabel required>Your name</FieldLabel>
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
              <FieldLabel required>Email</FieldLabel>
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              <FieldLabel required>Password</FieldLabel>
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
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const initialTimezone = WORKSPACE_TIMEZONES.includes(detectedTimezone) ? detectedTimezone : "UTC";
  const [timezone, setTimezone] = useState<WorkspaceTimezone>(initialTimezone);
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
        <Brand />
        <div className="step-mark">01</div>
        <span className="eyebrow">Create your company</span>
        <h1>Give your team a home.</h1>
        <p>
          We’ll create your company, Owner membership, workspace, and General team together. You can
          invite teammates next.
        </p>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ companyName, name, timezone });
          }}
        >
          <label>
            <FieldLabel required>Company name</FieldLabel>
            <input
              maxLength={160}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Acme Inc."
              required
              value={companyName}
            />
          </label>
          <label>
            <FieldLabel required>Workspace name</FieldLabel>
            <input
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Product"
              required
              value={name}
            />
          </label>
          <label>
            <FieldLabel required>Workspace timezone</FieldLabel>
            <select onChange={(event) => setTimezone(event.target.value)} required value={timezone}>
              {WORKSPACE_TIMEZONES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

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
    <section className="content content-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Your workspace</span>
          <h2>Welcome to {workspace.name}</h2>
          <p>Create a project, shape its workflow, and give collaborators the access they need.</p>
        </div>
        <span className="role-pill">{workspace.role}</span>
      </header>

      <article className="panel-card workspace-overview">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Overview</span>
            <h3>Workspace details</h3>
          </div>
        </div>
        <dl className="workspace-summary-list">
          {workspace.abilities.canViewTeams && (
            <div>
              <dt>Default team</dt>
              <dd>General</dd>
            </div>
          )}
          <div>
            <dt>Timezone</dt>
            <dd>{workspace.timezone}</dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd className="capitalize">{workspace.role}</dd>
          </div>
        </dl>
      </article>
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
  isDeactivating,
  member,
  onDeactivate,
}: Readonly<{
  canDeactivate: boolean;
  currentMembershipId: string;
  isDeactivating: boolean;
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
            disabled={isDeactivating}
            onClick={() => onDeactivate(member)}
            type="button"
          >
            {isDeactivating ? "Deactivating…" : "Deactivate"}
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
              <FieldLabel required>Email address</FieldLabel>
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
        {members.isError && (
          <div className="notice is-error" role="alert">
            {errorMessage(members.error)}
            <button className="text-button" onClick={() => members.refetch()} type="button">
              Try again
            </button>
          </div>
        )}
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
                    canDeactivate={workspace.abilities.canDeactivateMembers}
                    currentMembershipId={workspace.membershipId}
                    isDeactivating={deactivate.isPending && deactivate.variables.id === member.id}
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

type ApplicationView = "home" | "members" | "projects" | "settings";

const viewTitles: Record<ApplicationView, string> = {
  home: "Workspace home",
  members: "People & access",
  projects: "Projects & workflows",
  settings: "Workspace settings",
};

function SidebarPanel({
  collapsed,
  mobile = false,
  onClose,
  onNavigate,
  onSignOut,
  onToggle,
  onWorkspaceChange,
  panelRef,
  user,
  view,
  workspace,
  workspaces,
}: Readonly<{
  collapsed: boolean;
  mobile?: boolean;
  onClose?: () => void;
  onNavigate: (view: ApplicationView) => void;
  onSignOut: () => Promise<void>;
  onToggle?: () => void;
  onWorkspaceChange: (workspaceId: string) => void;
  panelRef?: Ref<HTMLDivElement>;
  user: { email: string; name: string } | undefined;
  view: ApplicationView;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
}>) {
  const items: Array<{
    icon: IconName;
    label: string;
    show: boolean;
    value: ApplicationView;
  }> = [
    { icon: "home", label: "Home", show: true, value: "home" },
    {
      icon: "people",
      label: "Members",
      show: workspace.abilities.canListMembers,
      value: "members",
    },
    { icon: "projects", label: "Projects", show: true, value: "projects" },
    {
      icon: "settings",
      label: "Settings",
      show: workspace.role === "owner",
      value: "settings",
    },
  ];
  const userInitial = user?.name.slice(0, 1).toUpperCase() ?? "A";
  const panelClassName = `sidebar ${mobile ? "mobile-sidebar" : "desktop-sidebar"} ${
    collapsed && !mobile ? "is-collapsed" : ""
  }`;

  const panelContent = (
    <>
      <div className="sidebar-header">
        <Brand compact={collapsed && !mobile} />
        {mobile ? (
          <button
            aria-label="Close navigation"
            className="icon-button sidebar-close"
            data-drawer-close
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        ) : (
          <button
            aria-controls="desktop-navigation"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="icon-button sidebar-toggle tooltip-anchor"
            data-tooltip={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggle}
            type="button"
          >
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} />
          </button>
        )}
      </div>

      <label className="workspace-switcher tooltip-anchor" data-tooltip="Switch workspace">
        <span className="workspace-avatar" aria-hidden="true">
          {workspace.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="workspace-select-copy">
          <small>Workspace</small>
          <select
            aria-label="Active workspace"
            onChange={(event) => onWorkspaceChange(event.target.value)}
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
        {items
          .filter((item) => item.show)
          .map((item) => {
            const tooltipId = `${mobile ? "mobile" : "desktop"}-${item.value}-tooltip`;
            return (
              <button
                aria-current={view === item.value ? "page" : undefined}
                aria-describedby={collapsed && !mobile ? tooltipId : undefined}
                aria-label={item.label}
                className={view === item.value ? "nav-item is-active" : "nav-item"}
                key={item.value}
                onClick={() => onNavigate(item.value)}
                type="button"
              >
                <Icon className="nav-icon" name={item.icon} />
                <span className="nav-label">{item.label}</span>
                <span className="nav-tooltip" id={tooltipId} role="tooltip">
                  {item.label}
                </span>
              </button>
            );
          })}
      </nav>

      <div className="sidebar-footer">
        <div className="signed-in-user tooltip-anchor" data-tooltip={user?.name ?? "Account"}>
          <span className="member-avatar small-avatar" aria-hidden="true">
            {userInitial}
          </span>
          <span className="account-copy">
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </span>
        </div>
        <button
          className="nav-item"
          data-tooltip="Sign out"
          onClick={() => void onSignOut()}
          type="button"
        >
          <Icon className="nav-icon" name="sign-out" />
          <span className="nav-label">Sign out</span>
        </button>
      </div>
    </>
  );

  if (mobile) {
    return (
      <div
        aria-label="Navigation menu"
        aria-modal="true"
        className={panelClassName}
        id="mobile-navigation"
        ref={panelRef}
        role="dialog"
      >
        {panelContent}
      </div>
    );
  }

  return (
    <aside aria-label="Primary" className={panelClassName} id="desktop-navigation">
      {panelContent}
    </aside>
  );
}

function ApplicationShell({ workspaces }: Readonly<{ workspaces: WorkspaceSummary[] }>) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [view, setView] = useState<ApplicationView>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("nexo.sidebar-collapsed") === "true",
  );
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => localStorage.getItem("nexo.active-workspace") ?? workspaces[0]?.id,
  );
  const mobileNavigationRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const workspace =
    workspaces.find((candidate) => candidate.id === activeWorkspaceId) ?? workspaces[0];

  useEffect(() => {
    if (workspace) {
      localStorage.setItem("nexo.active-workspace", workspace.id);
    }
  }, [workspace]);

  useEffect(() => {
    localStorage.setItem("nexo.sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const desktopViewport = window.matchMedia("(min-width: 900px)");
    const closeDrawerAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileNavigationOpen(false);
    };
    desktopViewport.addEventListener("change", closeDrawerAtDesktop);
    return () => desktopViewport.removeEventListener("change", closeDrawerAtDesktop);
  }, []);

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = mobileNavigationRef.current;
    requestAnimationFrame(() => {
      drawer?.querySelector<HTMLElement>("[data-drawer-close]")?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavigationOpen(false);
        requestAnimationFrame(() => mobileTriggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !drawer) return;

      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavigationOpen]);

  const closeMobileNavigation = () => {
    setMobileNavigationOpen(false);
    requestAnimationFrame(() => mobileTriggerRef.current?.focus());
  };

  const navigate = (nextView: ApplicationView) => {
    setView(nextView);
    window.scrollTo(0, 0);
    if (mobileNavigationOpen) closeMobileNavigation();
  };

  const changeWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    setView("home");
    window.scrollTo(0, 0);
    if (mobileNavigationOpen) closeMobileNavigation();
  };

  const signOut = async () => {
    await authClient.signOut();
    queryClient.clear();
  };

  if (!workspace) {
    return null;
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "has-collapsed-sidebar" : ""}`}>
      <SidebarPanel
        collapsed={sidebarCollapsed}
        onNavigate={navigate}
        onSignOut={signOut}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        onWorkspaceChange={changeWorkspace}
        user={session?.user}
        view={view}
        workspace={workspace}
        workspaces={workspaces}
      />

      <main className="main-area">
        <header className="topbar">
          <button
            aria-controls="mobile-navigation"
            aria-expanded={mobileNavigationOpen}
            aria-label="Open navigation"
            className="icon-button mobile-menu-button"
            onClick={() => setMobileNavigationOpen(true)}
            ref={mobileTriggerRef}
            type="button"
          >
            <Icon name="menu" />
          </button>
          <div className="topbar-heading">
            <span className="eyebrow">{workspace.name}</span>
            <h1>{viewTitles[view]}</h1>
          </div>
          <div
            aria-label={`Signed in as ${session?.user.name}`}
            className="mobile-account"
            role="img"
          >
            <span className="member-avatar small-avatar" aria-hidden="true">
              {session?.user.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        {view === "home" && <WorkspaceHome workspace={workspace} />}
        {view === "members" && <Members workspace={workspace} />}
        {view === "projects" && <Projects errorMessage={errorMessage} workspace={workspace} />}
        {view === "settings" && workspace.role === "owner" && (
          <WorkspaceSettings workspace={workspace} />
        )}
      </main>

      {mobileNavigationOpen && (
        <div className="drawer-layer">
          <button
            aria-label="Close navigation"
            className="drawer-backdrop"
            onClick={closeMobileNavigation}
            tabIndex={-1}
            type="button"
          />
          <SidebarPanel
            collapsed={false}
            mobile
            onClose={closeMobileNavigation}
            onNavigate={navigate}
            onSignOut={signOut}
            onWorkspaceChange={changeWorkspace}
            panelRef={mobileNavigationRef}
            user={session?.user}
            view={view}
            workspace={workspace}
            workspaces={workspaces}
          />
        </div>
      )}
    </div>
  );
}

function AuthenticatedApp() {
  const workspaces = useQuery({
    queryFn: ({ signal }) => getWorkspaces(signal),
    queryKey: workspaceQueryKey,
  });
  const invitationToken =
    new URLSearchParams(window.location.hash.slice(1)).get("invitation") ??
    new URLSearchParams(window.location.search).get("invitation");

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

function StandardApp() {
  const session = authClient.useSession();
  if (session.isPending) {
    return <LoadingScreen label="Restoring your session…" />;
  }
  if (!session.data?.user) {
    return window.location.pathname === "/login" || window.location.pathname === "/signup" ? (
      <AuthScreen />
    ) : (
      <LandingPage />
    );
  }

  return <AuthenticatedApp />;
}

export function App() {
  if (window.location.pathname === "/admin" || window.location.pathname === "/admin/login") {
    return <AdminGate />;
  }
  return <StandardApp />;
}
