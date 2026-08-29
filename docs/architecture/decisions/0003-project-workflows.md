# ADR-0003: Project-owned configurable workflows

Status: accepted — 2026-08-16

## Context

Fixed lifecycle names are inflexible, while arbitrary statuses provide no reliable completion or reporting semantics.

## Decision

Each Project owns one Workflow. Its statuses have configurable names, colors, and order plus one stable category: `backlog`, `unstarted`, `started`, `completed`, or `canceled`.

## Consequences

- Completion and cancellation are derived from status category.
- Every transition goes through one application operation.
- V1 permits transitions between any active statuses for authorized contributors.
- Transition graphs, validators, and WIP limits may extend the operation later.
