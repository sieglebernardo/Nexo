CREATE TABLE companies (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 160),
  requires_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX companies_name_idx ON companies (name, id);

CREATE TABLE company_memberships (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (company_id, user_id)
);

CREATE INDEX company_memberships_user_idx ON company_memberships (user_id, company_id);

CREATE TABLE platform_admins (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL,
  granted_by text NOT NULL CHECK (char_length(trim(granted_by)) BETWEEN 1 AND 160)
);

CREATE INDEX platform_admins_granted_at_idx ON platform_admins (granted_at);

CREATE TABLE administrative_audit_logs (
  id uuid PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (char_length(trim(action)) BETWEEN 1 AND 160),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX administrative_audit_logs_company_time_idx
  ON administrative_audit_logs (company_id, occurred_at DESC, id DESC);

-- A legacy workspace is an unambiguous isolation root, but relationships between separate
-- workspaces are not. Keep each legacy workspace in its own review-marked company so no data is
-- merged or exposed while an operator decides whether companies should later be consolidated.
INSERT INTO companies (id, name, requires_review, created_at, updated_at)
SELECT id, name, true, created_at, updated_at FROM workspaces;

ALTER TABLE workspaces ADD COLUMN company_id uuid;
UPDATE workspaces SET company_id = id;
ALTER TABLE workspaces
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT workspaces_company_fk FOREIGN KEY (company_id)
    REFERENCES companies(id) ON DELETE RESTRICT,
  ADD CONSTRAINT workspaces_company_id_id_unique UNIQUE (company_id, id);

INSERT INTO company_memberships (company_id, user_id, role, created_at, updated_at)
SELECT
  memberships.workspace_id,
  memberships.user_id,
  CASE WHEN memberships.role = 'owner' THEN 'owner' ELSE 'member' END,
  memberships.created_at,
  memberships.updated_at
FROM memberships;

ALTER TABLE memberships ADD COLUMN company_id uuid;
UPDATE memberships SET company_id = workspace_id;
ALTER TABLE memberships
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT memberships_company_member_fk FOREIGN KEY (company_id, user_id)
    REFERENCES company_memberships(company_id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT memberships_company_workspace_fk FOREIGN KEY (company_id, workspace_id)
    REFERENCES workspaces(company_id, id) ON DELETE CASCADE;
CREATE INDEX memberships_company_user_idx ON memberships (company_id, user_id);

CREATE TABLE legacy_workspace_admin_reviews (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- The old workspace-admin role is deliberately never promoted to platform administration.
-- Operators can review this table, then use the trusted provision command for any actual
-- platform administrators.
INSERT INTO legacy_workspace_admin_reviews (workspace_id, user_id)
SELECT workspace_id, user_id FROM memberships WHERE role = 'admin';
UPDATE memberships SET role = 'member' WHERE role = 'admin';
UPDATE invitations SET role = 'member' WHERE role = 'admin';
