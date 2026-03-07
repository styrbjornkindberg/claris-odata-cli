# Claris ODATA CLI - Project Methodology

## Methodology: Kanban

We use Kanban because:
- Continuous flow (no sprints)
- Pull-based (agents pull tasks when ready)
- Visual board (Mission Control)
- WIP limits (prevent overload)

## Workflow

```
┌─────────┐   ┌──────────┐   ┌─────────────┐   ┌────────┐   ┌─────────┐
│  Inbox  │ → │ Assigned │ → │ In Progress │ → │ Review │ → │  Done   │
└─────────┘   └──────────┘   └─────────────┘   └────────┘   └─────────┘
     ↑                                ↓
     └─────────── Blocked ───────────┘
```

## Roles

| Role | Who | Responsibility |
|------|-----|----------------|
| **Product Owner** | Seldon (main) | Task creation, prioritization, acceptance |
| **Coordination** | Seldon (main) | Assigns tasks to agents, tracks progress |
| **Developer** | Coder agent | Implementation |
| **QA** | Tester agent | Testing |
| **Security** | Security agent | Security audits |
| **DevOps** | DevOps agent | CI/CD, deployment |

## Task Creation

**Who creates tasks:**
- **Seldon (main)** - Creates all tasks based on:
  1. Project requirements (from user)
  2. Research findings
  3. Discovery during development
  4. Bug reports / issues

**Task format:**
```yaml
- title: Clear what/why
- description: Details, acceptance criteria
- priority: critical | high | medium | low
- assigned_to: agent:coder:main | agent:tester:main | etc
- status: inbox → assigned → in_progress → review → done
```

## WIP Limits

| Agent | Max In Progress | Rationale |
|-------|-----------------|-----------|
| coder | 2 | Focus on quality |
| tester | 2 | Thorough testing |
| security | 1 | Deep audit |
| devops | 1 | One pipeline at a time |

## Daily Rhythm

| Time | What | Who |
|------|------|-----|
| Morning | Progress report | Seldon → User |
| 08:00 | Check overnight work | Seldon |
| 12:00 | Mid-day coordination | Seldon |
| 20:00 | Progress report | Seldon → User |
| Continuous | Work on tasks | All agents |

## Git Workflow

### Branching Strategy: Feature Branches
```
main (protected)
  └── feature/102-cli-framework
  └── feature/105-odata-client
  └── feature/111-test-framework
```

**Rules:**
- One branch per task
- Branch naming: `feature/{task-id}-{short-description}`
- No direct commits to `main`
- Agent creates branch, commits, then notifies main agent

### Commit Frequency
**MINIMUM: Commit every 30 minutes.**

```bash
# Good: Small, frequent commits
git add src/api/client.ts
git commit -m "feat(api): add authentication headers"

# Later (30 min later)
git add src/api/endpoints.ts
git commit -m "feat(api): add endpoint builders"
```

**Why:**
- Never lose work
- Easy to rollback
- Clear history for review
- AI agents crash → work survives in git

### Agent Workflow
1. Create branch: `git checkout -b feature/102-cli-framework`
2. Work in small increments
3. Commit every 30min: `git commit -m "feat(cli): add command parser"`
4. Push frequently: `git push origin feature/102-cli-framework`
5. When done: Notify main agent (creates PR)

### Commit Message Format
```
type(scope): description

Types: feat, fix, docs, test, refactor, chore
Scope: cli, api, config, utils

Examples:
feat(api): add authentication headers
fix(client): handle rate limiting correctly  
test(config): add unit tests for credential storage
docs(readme): add installation instructions
```

### Pre-commit Checks
Agent MUST run before committing:
```bash
npm run lint      # ESLint passes
npm run test      # Tests pass
npm run build     # TypeScript compiles
```

If any fail: FIX before committing.

## Definition of Done

A task is DONE when:
1. ✅ Code/implementation complete
2. ✅ Tests pass (for code tasks)
3. ✅ `npm run lint` passes
4. ✅ `npm run build` compiles
5. ✅ Committed to feature branch
6. ✅ Pushed to origin
7. ✅ Security audit passed (if applicable)
8. ✅ Documentation updated
9. ✅ Notify main agent for review

## Blocking

If an agent is blocked:
```sql
UPDATE tasks SET status = 'blocked', 
  blocked_reason = 'Need clarification on X',
  blocked_at = unixepoch()
WHERE id = X;
```

Seldon sees blocked tasks and resolves blockers.

## Communication

- **Progress reports:** Twice daily (morning, evening)
- **Blockers:** Immediate alert to Seldon
- **Questions:** Seldon asks user only if critical

## Metrics

Track in Mission Control:
- Tasks completed per day
- Average time in progress
- Blocked tasks
- Bugs found in review