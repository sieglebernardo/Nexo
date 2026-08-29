# Nexo product contract

Status: accepted baseline for V1. Change through an explicit product decision or ADR.

## Product and customer

Nexo serves product and delivery teams that need clear, collaborative task execution without enterprise administration overhead. The initial design target is 5–100 members per workspace, up to 100 projects, and up to 100,000 active tasks in a large workspace.

The product term is **Task**. Nexo must remain useful without engineering-specific QA, deployments, time billing, employee measurement, or AI.

## Settled product defaults

| Decision | V1 default |
|---|---|
| Customer boundary | One Workspace is one tenant and paying account. No Organization entity. |
| Navigation hierarchy | Workspace → Team → Project. A General team is created automatically. |
| Project visibility | Workspace-visible by default; private is optional. |
| Guests | Access only explicitly granted projects as Viewer or Contributor. |
| Task ownership | Zero or one accountable assignee. |
| Workflow | One project-owned workflow with configurable statuses. |
| Status semantics | `backlog`, `unstarted`, `started`, `completed`, `canceled`. |
| Priority | Fixed: urgent, high, medium, low, or unset. |
| Description | Versioned structured rich-text document plus searchable plain text. |
| Due date | Date-only, interpreted using the workspace timezone. |
| Attachments | Private files up to 25 MB in V1; validate and scan before access. |
| Trash | Recoverable for 30 days before purge. |
| Authentication | Verified email/password, secure cookie sessions, invite-capable workspaces. |
| Project views | Default Board and List; saved views wait until V1.5. |
| Task board visibility | Workspace-wide Collaborative by default; Owner may switch to Private assigned-only boards. |
| Notifications | In-app assignment, mention, and relevant comment notifications. |
| AI | Excluded from V1. |

## V1

- Authentication, workspace creation, invitations, and workspace roles.
- Lightweight teams and project access roles.
- Projects with configurable workflow statuses and stable categories.
- Task creation, editing, transition, assignment, priority, labels, due date, archive, trash, and restore.
- Board and list over the same tasks.
- Owner-only workspace setting for Collaborative or Private assigned-only task boards.
- Server-side filters and workspace task search.
- Quick create, command access, keyboard basics, and optimistic common mutations.
- Comments, mentions, controlled attachments, structured activity, inbox, and My Work.
- Responsive task details and deep links.
- Cursor pagination, tenant isolation, backend authorization, and core audit/security controls.

## Intentionally later

- Saved views, real-time updates, followers, reminders, bulk operations.
- Subtasks, dependencies, checklists, estimates, start dates, recurring tasks.
- Templates, milestones, cycles, roadmaps, custom fields, automations.
- Public API, webhooks, integrations, enterprise identity, and AI.

## Explicit exclusions

- Multiple assignees.
- Time tracking or employee productivity scoring.
- Named-person permissions or approval chains.
- Company-specific QA, completion reports, capacity packing, deployments, daily reports, rankings, points, or gamification.
- Autonomous agents acting directly on task content.
- HTML used as workflow history.

## Product quality bar

A feature is incomplete if it cannot explain ownership, permissions, empty/loading/error states, mobile behavior, activity impact, notification impact, archive/deletion behavior, API behavior, tenant isolation, and performance at the stated design target.
