# ADR-0002: TypeScript modular monolith

Status: accepted — 2026-08-16

## Context

Nexo needs clear business boundaries and asynchronous extension points without distributed transactions or multi-service operations.

## Decision

Use an npm-workspaces TypeScript repository with a React/Vite client, Fastify API, PostgreSQL via Drizzle, Better Auth, and a worker runtime introduced with the outbox. Deploy the API as one modular monolith.

## Consequences

- Domain code remains framework-independent.
- Modules own writes and expose application operations.
- Read models may join data for efficient views while enforcing tenant visibility.
- Services are extracted only for demonstrated scale or ownership needs.
