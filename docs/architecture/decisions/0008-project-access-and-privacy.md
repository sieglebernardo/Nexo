# ADR-0008: Project access and privacy authority

Status: accepted — 2026-08-17

## Context

Project roles must combine predictably with workspace membership without making private projects
visible to workspace administrators by accident. Guests also need narrower defaults than ordinary
workspace members.

## Decision

Active Owner, Admin, and Member memberships may create projects; Guests may not. The creator gets
explicit Lead access in the project-creation transaction.

For a workspace-visible project, Owner, Admin, and Member memberships receive baseline Viewer
access. A private project requires explicit project access regardless of workspace role. Guests
always require explicit Viewer or Contributor access and cannot be Project Leads.

Explicit project roles are authoritative inside a project:

- Lead may view, contribute, manage project settings and privacy, manage access, and configure the
  workflow.
- Contributor may view and contribute.
- Viewer may view.

Workspace Owner and Admin roles do not bypass private-project access or Project Lead authority.
Project access operations must retain at least one active Lead.

## Consequences

- Private means the same thing for all workspace roles and does not silently weaken for admins.
- Workspace-visible projects remain discoverable without per-project grants for ordinary members.
- Guests can collaborate only where explicitly invited and cannot become access administrators.
- Workspace member deactivation is rejected when it would orphan a project without an active Lead.
- The server calculates effective project roles and abilities; client-side visibility is advisory.
