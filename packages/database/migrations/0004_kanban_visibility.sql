CREATE TYPE task_board_visibility AS ENUM ('collaborative', 'private');

ALTER TABLE workspaces
  ADD COLUMN task_board_visibility task_board_visibility NOT NULL DEFAULT 'collaborative';

ALTER TYPE task_activity_type ADD VALUE 'task-assigned';
ALTER TYPE task_activity_type ADD VALUE 'task-unassigned';

ALTER TABLE tasks
  ADD COLUMN assignee_membership_id uuid,
  ADD CONSTRAINT tasks_assignee_same_workspace_fk
    FOREIGN KEY (workspace_id, assignee_membership_id)
    REFERENCES memberships(workspace_id, id) ON DELETE RESTRICT;

CREATE INDEX tasks_project_assignee_active_idx
  ON tasks (workspace_id, project_id, assignee_membership_id, archived_at, created_at DESC, id DESC);
