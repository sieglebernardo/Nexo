# Nexo architecture

## Shape

Nexo is a TypeScript modular monolith in an npm-workspaces repository. It has a React web client, a Fastify API, a PostgreSQL database, and a worker entry point when asynchronous delivery begins.

```text
React client
    ↓ REST/OpenAPI
Fastify transport
    ↓ validate + authenticate + authorize
Application commands and queries
    ↓
Domain rules + database transaction
    ├── canonical state
    ├── user-visible activity
    └── transactional outbox
             ↓
          worker
          notifications / search / later realtime and webhooks
```

## Module boundaries

| Module | Owns |
|---|---|
| Identity & Access | Authentication integration, users, sessions, invitations, abilities. |
| Workspaces | Workspaces, memberships, roles, teams. |
| Projects & Workflows | Projects, project access, workflows, statuses, views. |
| Tasks | Task lifecycle, assignment, priority, labels, ordering. |
| Collaboration | Comments and mentions. |
| Files | File metadata, storage policy, scanning lifecycle, signed access. |
| Activity | Typed user-visible task history. |
| Notifications | Recipient derivation, inbox, read state. |
| Search | PostgreSQL-backed task search behind a replaceable interface. |
| Platform | Configuration, database, outbox, jobs, logging, observability. |

Automation and integrations are not empty V1 modules. Add them only with real product scope.

## Dependency rules

- Transport depends on application operations, never the reverse.
- Domain code does not import Fastify, React, Drizzle, or Better Auth.
- Database code implements persistence needed by application operations.
- Cross-module writes happen through the owning module's operation.
- Read queries may join modules for purpose-built projections while enforcing workspace visibility.
- Do not use ORM hooks for business workflows.

## Task transition

Every status change goes through one transition operation that:

1. Loads the task in workspace context.
2. Authorizes the actor.
3. Validates the target status belongs to the project's workflow.
4. Applies category timestamp semantics.
5. Updates task state and optimistic-concurrency version.
6. Writes structured activity in the same transaction.
7. Writes outbox messages for asynchronous effects.

V1 allows movement between any active project statuses for an authorized Contributor. Later transition graphs must extend this operation instead of adding controller conditions.

## Data and identity

- Generate opaque sortable IDs in the application; expose project-local task identifiers such as `NEX-142`.
- Put `workspace_id` on tenant-owned rows and enforce same-workspace references where practical.
- Attribute tasks, comments, activity, and notifications to workspace membership IDs.
- Retain inactive memberships for historical attribution.
- Store timestamps in UTC. Store V1 task due dates as SQL `date` values.

## Views and ordering

Project owns tasks. Board and List query the same rows. Manual order is stored per view and lane with lexicographic fractional ranks. Clients send before/after task IDs; the server validates anchors and calculates ranks. Field-sorted views disable manual drag ordering.

## Activity and events

Task activity is append-only, typed, schema-versioned, and user-visible. Domain/outbox events serve internal and external consumers. One user action may create one activity entry and several internal events; not every internal event becomes activity.

## Authorization

The backend policy layer is authoritative. Workspace roles are Owner, Admin, Member, and Guest. Project roles are Lead, Contributor, and Viewer. API resources may include calculated abilities for rendering, but the client never grants access.

## Read performance

- Board/list responses contain task summaries, not descriptions, comments, files, or activity.
- Load task detail separately.
- Paginate board lanes and lists with deterministic cursors.
- Apply visibility and filters server-side.
- Patch optimistic client caches and reconcile targeted queries.
- Begin search with PostgreSQL full-text and trigram indexes.

## Security baseline

- Secure HTTP-only session cookies and verified email identities.
- Exact production origins; no wildcard credentialed CORS.
- Request schema validation and rate limits.
- Private object storage with signed access, MIME/size validation, and scanning.
- Structured logs without secrets or task description bodies.
- Cross-workspace access tests for every tenant-owned module.
