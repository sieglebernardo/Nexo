ALTER TABLE projects
  ADD COLUMN next_task_number integer NOT NULL DEFAULT 1 CHECK (next_task_number >= 1);

CREATE TYPE task_activity_type AS ENUM (
  'task-created',
  'task-status-changed',
  'task-completed',
  'task-reopened',
  'task-canceled'
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  task_number integer NOT NULL CHECK (task_number >= 1),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 240),
  status_id uuid NOT NULL,
  due_date date,
  archived_at timestamptz,
  first_started_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT tasks_project_number_unique UNIQUE (project_id, task_number),
  CONSTRAINT tasks_workspace_id_id_unique UNIQUE (workspace_id, id),
  CONSTRAINT tasks_project_same_workspace_fk
    FOREIGN KEY (workspace_id, project_id)
    REFERENCES projects(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT tasks_status_same_workspace_fk
    FOREIGN KEY (workspace_id, status_id)
    REFERENCES workflow_statuses(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT tasks_creator_same_workspace_fk
    FOREIGN KEY (workspace_id, created_by_membership_id)
    REFERENCES memberships(workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX tasks_project_active_created_idx
  ON tasks (workspace_id, project_id, archived_at, created_at DESC, id DESC);
CREATE INDEX tasks_status_idx ON tasks (workspace_id, status_id);

CREATE TABLE task_activities (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  task_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  type task_activity_type NOT NULL,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT task_activities_task_same_workspace_fk
    FOREIGN KEY (workspace_id, task_id)
    REFERENCES tasks(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT task_activities_actor_same_workspace_fk
    FOREIGN KEY (workspace_id, actor_membership_id)
    REFERENCES memberships(workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX task_activities_task_time_idx
  ON task_activities (workspace_id, task_id, occurred_at, id);
