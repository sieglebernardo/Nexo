# ADR-0006: View ranks and recoverable deletion

Status: accepted — 2026-08-16

## Context

Sequential integer order causes mass updates, while task-global order conflicts with multiple views. Completion, archive, trash, and deletion have different meanings.

## Decision

Store lexicographic fractional ranks per view and lane, calculated by the server from neighbor task IDs. Keep workflow outcome, archive, 30-day trash, and physical purge separate.

## Consequences

- Ordinary reorders update one position row.
- Dense lanes require occasional batch rebalance.
- Archive remains a visibility choice, not a status.
- Purge must clean dependent files and projections after retention.
