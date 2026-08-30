# ADR-0010: Company isolation and platform administration

Status: accepted — 2026-08-30

## Context

Nexo needs a platform operator surface that can manage customer companies without turning an
ordinary workspace role into cross-tenant authority. A company can own several workspaces, but
joining a company must not expose every workspace.

## Decision

Companies are a platform-owned grouping and isolation root above workspaces. Each workspace belongs
to exactly one company. A company membership confirms the user belongs to that company; an active
workspace membership remains required for all ordinary workspace, project, workflow, and task
access.

Platform administration is represented only by a `platform_admins` grant associated with a global
user. It is not a workspace role, has no public assignment API, and is checked by every `/api/v1/admin`
endpoint. It may access company data only through these explicit protected operations.

Company creation occurs with first-workspace onboarding. Invitations inherit their company from the
invited workspace and create or retain a company membership without creating a company.

## Consequences

- Workspace Owner, Member, and Guest remain workspace-scoped. The old workspace `admin` value is
  demoted to Member by migration and placed in `legacy_workspace_admin_reviews`; it never becomes a
  platform admin automatically.
- Existing workspaces are backfilled into one review-marked company each. This avoids guessing that
  separately existing workspaces should be combined; an operator must resolve any intended grouping.
- A composite database constraint requires a workspace membership's company to match both its user
  company membership and its workspace's company.
- Administrative mutations are written to `administrative_audit_logs`. Destructive cross-company
  operations are intentionally not exposed in this slice.
