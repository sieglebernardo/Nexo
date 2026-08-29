# Nexo repository instructions

Nexo is a greenfield collaborative task-management SaaS. It is not a rewrite of Skala.

Before changing product behavior or architecture, read:

- `docs/product/product-contract.md`
- `docs/architecture/architecture.md`
- Relevant ADRs under `docs/architecture/decisions/`
- `docs/delivery/roadmap.md` when selecting the next slice

Use the `$nexo-product` skill for Nexo planning, implementation, review, and refactoring.

## Non-negotiable rules

- Workspace is the tenant boundary.
- Project owns tasks; board and list are views.
- Workflow statuses are configurable but retain stable semantic categories.
- A task has at most one accountable assignee.
- Use IDs and foreign keys, never display names, for identity.
- The backend is the only authorization authority.
- Activity is structured; task descriptions never store workflow history.
- Completion, cancellation, archive, trash, and purge are distinct.
- AI is never required for basic task management.
- Build a modular monolith through end-to-end vertical slices.

## Required checks

Run these before handing off code:

```sh
npm run check
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The end-to-end check requires local PostgreSQL and Mailpit from `compose.yaml`. Local development
and the browser test apply pending database migrations before starting.
