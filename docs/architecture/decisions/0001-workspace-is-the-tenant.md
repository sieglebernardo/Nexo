# ADR-0001: Workspace is the tenant

Status: accepted — 2026-08-16

## Context

Separate Organization and Workspace concepts would duplicate ownership, membership, billing, and authorization before Nexo has a multi-workspace account requirement.

## Decision

Workspace is the tenant, security, membership, and initial billing boundary. All tenant-owned records carry `workspace_id`. No Organization entity is created in V1.

## Consequences

- Tenant isolation has one explicit root.
- A future enterprise account may group several workspaces above this boundary.
- Cross-workspace data movement requires an explicit product operation, not an ordinary update.
