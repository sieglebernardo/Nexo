# ADR-0005: Separate activity from domain events

Status: accepted — 2026-08-16

## Context

Users need understandable history; notifications, search, real-time delivery, and webhooks need reliable machine events. One stream cannot serve both without noise or coupling.

## Decision

Write typed user-visible Task Activity separately from versioned domain/outbox events. Persist both with canonical state in the same transaction when relevant.

## Consequences

- Internal retries and projections never pollute the user timeline.
- Activity payloads remain small, safe, and renderable after soft deletion.
- The transactional outbox becomes the reliable seam for asynchronous consumers.
