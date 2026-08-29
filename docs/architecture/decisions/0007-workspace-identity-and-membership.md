# ADR-0007: Global identity and workspace membership authority

Status: accepted — 2026-08-16

## Context

Users may belong to several workspaces, while Workspace remains the tenant and authorization
boundary. Authentication state must not accidentally become tenant authority, and inactive members
must remain attributable in later task and activity history.

## Decision

Better Auth owns global users, credential accounts, email verification, and database-backed cookie
sessions. An active Nexo Workspace Membership is the sole source of tenant access.

Workspace onboarding creates the Workspace, Owner Membership, and General Team in one database
transaction. Memberships are deactivated, not deleted. Invitations contain a hashed, single-use,
seven-day token and can only be accepted by a verified user whose normalized email matches the
recipient.

The V1 workspace policy is:

- Owner manages workspace settings, teams, admins, members, and guests.
- Admin manages teams and may invite or deactivate Members and Guests, but not Owners or peer
  Admins.
- Member may view workspace context, teams, and the member directory.
- Guest may view workspace context only; later project access must be explicit.
- Owners cannot be invited, deactivated, or self-deactivated through ordinary membership operations.
  Ownership transfer is a separate future product operation.

## Consequences

- A valid global session grants no workspace data without an active membership.
- Historical attribution survives deactivation and can use Membership IDs.
- Cross-workspace route failures do not disclose whether another tenant exists.
- Promoting or transferring ownership requires an explicit operation with its own invariants.
- Invitation delivery can change providers without changing invitation persistence or acceptance.
