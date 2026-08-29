# ADR-0004: One assignee and view-independent tasks

Status: accepted — 2026-08-16

## Context

Multiple assignees obscure accountability. Treating a Board as a task container duplicates work between Board, List, My Work, and future saved views.

## Decision

A Task belongs to one Project and has zero or one accountable assignee. Board and List are views over the same tasks.

## Consequences

- Followers, mentions, and comments provide collaboration without diluting ownership.
- Task identity and permissions remain stable across views.
- Manual position is view-specific rather than a universal Task field.
