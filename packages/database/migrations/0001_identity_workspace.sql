CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member', 'guest');

CREATE TABLE users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX users_email_normalized_unique ON users (lower(email));

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);

CREATE TABLE auth_accounts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  id_token text,
  password text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT auth_accounts_provider_account_unique UNIQUE (provider_id, account_id)
);

CREATE INDEX auth_accounts_user_id_idx ON auth_accounts (user_id);

CREATE TABLE auth_verifications (
  id uuid PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz,
  updated_at timestamptz
);

CREATE INDEX auth_verifications_identifier_idx ON auth_verifications (identifier);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role workspace_role NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deactivated_at timestamptz,
  deactivated_by_membership_id uuid,
  CONSTRAINT memberships_workspace_user_unique UNIQUE (workspace_id, user_id),
  CONSTRAINT memberships_workspace_id_id_unique UNIQUE (workspace_id, id),
  CONSTRAINT memberships_deactivator_same_workspace_fk
    FOREIGN KEY (workspace_id, deactivated_by_membership_id)
    REFERENCES memberships(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT memberships_deactivation_shape CHECK (
    (deactivated_at IS NULL AND deactivated_by_membership_id IS NULL)
    OR (deactivated_at IS NOT NULL AND deactivated_by_membership_id IS NOT NULL)
  )
);

CREATE INDEX memberships_user_id_idx ON memberships (user_id);
CREATE INDEX memberships_workspace_active_idx ON memberships (workspace_id, deactivated_at);

CREATE TABLE teams (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  is_general boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT teams_workspace_name_unique UNIQUE (workspace_id, name),
  CONSTRAINT teams_workspace_id_id_unique UNIQUE (workspace_id, id)
);

CREATE INDEX teams_workspace_id_idx ON teams (workspace_id);
CREATE UNIQUE INDEX teams_one_general_per_workspace_unique
  ON teams (workspace_id) WHERE is_general;

CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email)),
  role workspace_role NOT NULL CHECK (role <> 'owner'),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  invited_by_membership_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by_membership_id uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT invitations_inviter_same_workspace_fk
    FOREIGN KEY (workspace_id, invited_by_membership_id)
    REFERENCES memberships(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT invitations_acceptor_same_workspace_fk
    FOREIGN KEY (workspace_id, accepted_by_membership_id)
    REFERENCES memberships(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT invitations_acceptance_shape CHECK (
    (accepted_at IS NULL AND accepted_by_membership_id IS NULL)
    OR (accepted_at IS NOT NULL AND accepted_by_membership_id IS NOT NULL)
  ),
  CONSTRAINT invitations_terminal_state_exclusive CHECK (
    accepted_at IS NULL OR revoked_at IS NULL
  )
);

CREATE INDEX invitations_workspace_email_idx ON invitations (workspace_id, email);
CREATE INDEX invitations_pending_idx ON invitations (workspace_id, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX invitations_one_pending_email_per_workspace_unique
  ON invitations (workspace_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
