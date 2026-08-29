# Nexo delivery roadmap

Deliver end-to-end slices. Do not build every table or generic abstraction before a user-visible path needs it.

## Foundation — delivered

- Repository, package workspaces, formatting, type checking, tests, and builds.
- Executable API health endpoint and web application shell.
- Framework-independent workflow category semantics.
- PostgreSQL development environment and persistence package boundary.

## Slice 1 — identity and workspace — delivered

- Verified email/password authentication and sessions.
- Create workspace and General team on onboarding.
- Workspace switcher context.
- Owner/Admin/Member/Guest authorization policy.
- Invite and deactivate members.

Exit: two users can collaborate in one workspace, and cross-workspace access tests pass.

## Slice 2 — project and workflow — delivered

- Create workspace-visible/private project under a team.
- Create default workflow and statuses.
- Configure status name, color, order, default, and category.
- Project Lead/Contributor/Viewer access.

Exit: a project can be configured without hardcoded lifecycle names.

## Slice 3 — tasks and list

- Create, view, edit, transition, archive, trash, and restore a task.
- Single assignee, priority, due date, and labels.
- Structured activity and optimistic concurrency.
- Cursor-paginated list with server filters.

Exit: Nexo is usable as a fast collaborative task list.

## Slice 4 — board and ordering

- Board view grouped by status.
- Per-lane cursor loading.
- Accessible drag and command-based movement.
- Server-computed fractional ranks using neighbor anchors.
- Optimistic movement with rollback/reconciliation.

Exit: board and list remain consistent under concurrent use.

## Slice 5 — collaboration and inbox

- Comments, mentions, private attachments, and task activity timeline.
- Assignment, mention, and relevant comment notifications.
- Inbox and My Work.

Exit: a team can coordinate work without an external chat for basic task context.

## Slice 6 — speed and polish

- Command palette, global quick create, keyboard navigation, and universal search.
- Responsive task drawer/page.
- Empty, loading, optimistic, conflict, and error states.
- Performance and accessibility audit against the V1 design target.

Exit: V1 meets the product quality bar in `docs/product/product-contract.md`.
