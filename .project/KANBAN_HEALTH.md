# Kanban Health Check

## Stall Detection

A task is **stalled** if:
- `status = 'in_progress'` for > 24 hours
- `status = 'inbox'` for > 7 days

## Query for Stalled Tasks

```sql
-- In progress for > 24 hours
SELECT id, title, assigned_to, 
       (unixepoch() - updated_at) / 3600 as hours_stalled
FROM tasks 
WHERE status = 'in_progress' 
AND (unixepoch() - updated_at) > 86400;

-- In inbox for > 7 days
SELECT id, title, assigned_to,
       (unixepoch() - created_at) / 86400 as days_waiting
FROM tasks 
WHERE status = 'inbox'
AND (unixepoch() - created_at) > 604800;
```

## Recovery Actions

### Stalled in_progress:
1. Check agent is running: `openclaw status`
2. Check agent logs: `~/.openclaw/agents/{agent}/logs/`
3. If agent crashed, respawn: `sessions_spawn --agent {agent} --task "Resume work"`
4. If blocked, update task: `UPDATE tasks SET status = 'blocked', blocked_reason = '...' WHERE id = X`

### Stalled in inbox:
1. Check if agent heartbeat is correct
2. Check if agent exists: `openclaw status`
3. Manually trigger: `openclaw heartbeat agent:{name}:main`
4. Or spawn agent directly: `sessions_spawn --agent {name} --task "Pick up task #{id}"`

## Kanban Board View

```sql
-- Board summary
SELECT 
  status,
  COUNT(*) as count,
  GROUP_CONCAT(id) as task_ids
FROM tasks 
WHERE project_id = 8
GROUP BY status;
```

## Heartbeat Monitoring

```bash
# Check agent status
openclaw status | grep -A5 "Heartbeat"

# Check last agent run
ls -ltr ~/.openclaw/agents/*/sessions/*.jsonl | tail -5
```

## Daily Report (08:00 and 20:00)

Run during heartbeats:
1. Board status (inbox, in_progress, done)
2. Stalled tasks
3. Recent activity (last updated)
4. Blocking issues