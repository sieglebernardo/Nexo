# ADR-0009: Workspace task board visibility

Status: accepted — 2026-08-29

## Context

Some teams coordinate from a shared project board, while others require each member's task board to
show only their accountable work. Implementing this as a client filter would expose hidden task
summaries and make behavior inconsistent across projects.

## Decision

Workspace owns one task board visibility setting with two modes:

- `collaborative` is the default and returns every task the actor can access through the project.
- `private` returns only tasks whose accountable assignee is the actor's active Workspace Membership.

Unassigned tasks are visible only in Collaborative mode. Private mode applies to every workspace
role, including Owner, while existing project access remains a prerequisite. The Workspace Owner is
the only role that can read or change the setting, and non-owners do not receive a Settings UI for
it. Task queries enforce the mode on the server.

## Consequences

- Project privacy and task board visibility remain separate: project access is evaluated first,
  followed by the workspace board filter.
- Assignment uses Workspace Membership IDs and remains zero-or-one.
- Reassigning a task can make it disappear from the current member's Private board.
- Direct task authorization remains based on project contribution rights; the setting controls the
  board read model rather than creating per-task edit permissions.
