# Nexo

Nexo is a fast, focused collaborative task-management application for product and delivery teams.

This repository is a greenfield modular monolith. The canonical product contract is in `docs/product/product-contract.md`; architecture and decisions are under `docs/architecture/`.

## Prerequisites

- Node.js 24 or newer
- npm 11 or newer
- Docker Desktop for local PostgreSQL

## Local development

```sh
cp .env.example .env
docker compose up -d postgres mailpit
npm install
npm run db:migrate
npm run dev
```

The web app runs at `http://localhost:5173` and the API at `http://localhost:3000`.
Development verification and invitation emails are available in Mailpit at
`http://localhost:8025`.

## Validation

```sh
npm run check
npm run typecheck
npm test
npm run build
```

## Repository map

```text
apps/api          Fastify API and application modules
apps/web          React client
packages/contracts Shared transport contracts
packages/database PostgreSQL schema and persistence
packages/domain    Framework-independent domain rules
docs               Product, architecture, ADRs, and delivery plan
```
