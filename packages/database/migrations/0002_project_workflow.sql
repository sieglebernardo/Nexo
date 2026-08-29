CREATE TYPE project_visibility AS ENUM ('workspace', 'private');
CREATE TYPE project_role AS ENUM ('lead', 'contributor', 'viewer');
CREATE TYPE workflow_status_category AS ENUM (
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled'
);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  project_key text NOT NULL CHECK (project_key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  visibility project_visibility NOT NULL DEFAULT 'workspace',
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT projects_workspace_key_unique UNIQUE (workspace_id, project_key),
  CONSTRAINT projects_workspace_id_id_unique UNIQUE (workspace_id, id),
  CONSTRAINT projects_team_same_workspace_fk
    FOREIGN KEY (workspace_id, team_id)
    REFERENCES teams(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT projects_creator_same_workspace_fk
    FOREIGN KEY (workspace_id, created_by_membership_id)
    REFERENCES memberships(workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX projects_workspace_visibility_idx ON projects (workspace_id, visibility, name, id);
CREATE INDEX projects_team_id_idx ON projects (team_id);

CREATE FUNCTION prevent_project_key_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_key IS DISTINCT FROM OLD.project_key THEN
    RAISE EXCEPTION 'project key is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_project_key_immutable
  BEFORE UPDATE OF project_key ON projects
  FOR EACH ROW EXECUTE FUNCTION prevent_project_key_change();

CREATE TABLE project_access (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  role project_role NOT NULL,
  granted_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, membership_id),
  CONSTRAINT project_access_project_same_workspace_fk
    FOREIGN KEY (workspace_id, project_id)
    REFERENCES projects(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT project_access_member_same_workspace_fk
    FOREIGN KEY (workspace_id, membership_id)
    REFERENCES memberships(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT project_access_grantor_same_workspace_fk
    FOREIGN KEY (workspace_id, granted_by_membership_id)
    REFERENCES memberships(workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX project_access_membership_idx ON project_access (workspace_id, membership_id, project_id);

CREATE TABLE workflows (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT workflows_project_unique UNIQUE (project_id),
  CONSTRAINT workflows_workspace_id_id_unique UNIQUE (workspace_id, id),
  CONSTRAINT workflows_project_same_workspace_fk
    FOREIGN KEY (workspace_id, project_id)
    REFERENCES projects(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE workflow_statuses (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  category workflow_status_category NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  is_default boolean NOT NULL DEFAULT false,
  retired_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT workflow_statuses_workflow_order_unique UNIQUE (workflow_id, sort_order),
  CONSTRAINT workflow_statuses_workspace_id_id_unique UNIQUE (workspace_id, id),
  CONSTRAINT workflow_statuses_workflow_same_workspace_fk
    FOREIGN KEY (workspace_id, workflow_id)
    REFERENCES workflows(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT workflow_statuses_default_shape CHECK (
    NOT is_default OR (retired_at IS NULL AND category NOT IN ('completed', 'canceled'))
  )
);

CREATE UNIQUE INDEX workflow_statuses_one_default_unique
  ON workflow_statuses (workflow_id) WHERE is_default;
CREATE INDEX workflow_statuses_workflow_active_order_idx
  ON workflow_statuses (workflow_id, retired_at, sort_order, id);
