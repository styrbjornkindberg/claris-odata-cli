# Handoff: claris-odata-cli OData Compliance & Hardening

Picking this up cold? Read this first. Five minutes max.

**Date:** 2026-05-06
**Branch:** `main` (no branch cut yet — first task should branch off)
**Repo:** `/Users/styrbjorn/Sites/claris-odata-cli`
**Owner:** styrbjorn.kindberg@squaremoon.se

## Where We Are

Just finished the **specify** and **plan** phases of spec-driven development against the FileMaker OData docs at https://help.claris.com/en/odata-guide/. Code review is done, spec is approved scope-wise ("All features"), implementation plan written.

**No code has been touched yet.** Next session = start executing T1.

## Three Files To Read First

1. **[`SPEC.md`](SPEC.md)** — the contract. Objective, tech stack, commands, structure, code style, testing strategy, boundaries, success criteria. Source of truth.
2. **[`tasks/plan.md`](tasks/plan.md)** — the implementation plan. 12 tasks, 5 phases, 4 checkpoints, dependency graph, risks, parallelization seam.
3. **[`tasks/todo.md`](tasks/todo.md)** — single-page checklist. Tick boxes as you go.

Optional context: the original code-review findings live in the conversation transcript — every finding is mapped to a Success Criterion in `SPEC.md` § Success Criteria.

## What This Sweep Is

Twelve vertical slices that close every code-review finding **and** ship the FileMaker OData capabilities the CLI advertises but doesn't expose:

- Bug: protocol detection uses `port === 443` instead of `secure` flag (3 commands)
- Bug: `client.handleApiError` always throws bare `ODataError`, never the typed subclasses
- Bug: `getRecords` discards `@odata.count`
- Missing: `Prefer: fmodata.include-specialcolumns` (so `__Id`/`__ModId` actually populate)
- Missing: `Accept: …;IEEE754Compatible=true` (large ID precision)
- Missing CLI commands: `fmo script`, `fmo upload`, `fmo batch`
- Missing flags: `--expand` on `get`, `--replace` (PUT) on `update`
- Cleanup: `EndpointBuilder` is dead code; commands hand-roll URLs; `formatError` duplicated 3x; unsafe `as HttpErrorShape` casts; redundant filter in `browse.ts`

## Decisions Already Locked In

These came out of the spec/plan dialogue. Don't relitigate without a reason.

- **`EndpointBuilder` becomes the single URL source.** Adopted everywhere — no more inline `axios` in `cli/`.
- **`Prefer` is a first-class concern via new `src/api/prefer.ts`.** `fmodata.include-specialcolumns` always-on. `IEEE754Compatible=true` always-on.
- **`getRecords` return shape changes to `QueryResult<T>`** (`{records, count, nextLink}`). Breaking. Justified by the `@odata.count` data loss bug. Bump major version.
- **`handleApiError` throws typed subclasses** — `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ValidationError`, `RateLimitError`. Existing status-code fallback in `cli/index.ts:resolveErrorCode` keeps working unchanged.
- **Batch input format = JSON DSL we transcode to `multipart/mixed`.** Friendlier than raw multipart.
- **Container download out of scope this sweep.** Follow-up.
- **Schema-modification verbs (POST table, etc.) out of scope this sweep.** Follow-up.
- **Container upload buffered with 25 MB cap.** Revisit if users hit it.

## What "Done" Looks Like

`SPEC.md` § Success Criteria has the exhaustive list. The short version:

- `npm test && npm run lint` green
- Coverage ≥ 80% overall, 100% on `api/client.ts` + `api/prefer.ts`
- Manual smoke against a real FileMaker Cloud: `list`, `get --count`, `get --expand`, `script`, `upload`, `batch`
- Records returned by `get` always have `__Id` / `__ModId`
- HTTPS works on non-443 ports

## Start Here

Open [`tasks/todo.md`](tasks/todo.md). First box: **T1 — Fix protocol detection across `list` / `health` / `overview`**.

Suggested kickoff:

```
git checkout -b feature/odata-conformance-sweep
```

Then execute T1 per [`tasks/plan.md`](tasks/plan.md) § Task 1. It's S-sized (3 files + 1 test), no API change, fast win to build momentum and validate the test setup.

After T1 + T2: hit **Checkpoint A** before continuing into Phase 2 (which has breaking changes).

## Recommended Skills For Next Session

- **`superpowers:test-driven-development`** — every task has a verification step; write the failing test first
- **`agent-skills:incremental-implementation`** — one task, one commit, verify, repeat
- **`agent-skills:context-engineering`** — load only the spec section + source files for the current task; don't flood the agent with the whole repo

## Open Questions Carrying Forward

1. **Always-on `IEEE754Compatible=true`** returns `Edm.Int64` as a string. Document loudly in the PR description; monitor first user feedback. Fallback: env-var opt-out.
2. **Multipart batch parsing** may have FileMaker-specific quirks. Build with golden fixtures from real responses, defer if it bloats T10.
3. **Major version bump** in `package.json` on first publish after the `getRecords` shape change. Note in CHANGELOG.

## What NOT To Do

Hard rules carried from `SPEC.md` § Boundaries:

- Never log passwords or full Authorization headers
- Never use `any` or `as` to silence type errors
- Never disable a failing test instead of fixing it
- Never use `git push --force` or `--no-verify`
- Don't change keychain account-key format without asking — it breaks existing users
- Don't rename or remove existing CLI flags without asking

## Parallelization Hint

Two-agent split is documented in [`tasks/plan.md`](tasks/plan.md) § Parallelization. Agent B blocks on Agent A's T3 (EndpointBuilder adoption); after that, lanes are independent. If running solo, follow the linear order in `tasks/todo.md`.

## Repo State Snapshot

```
Working tree:
  ?? .claude/settings.local.json
  ?? CLAUDE_CODE_BRIEF.md
  ?? SPEC.md            ← created this session
  ?? handoff.md         ← this file
  ?? tasks/plan.md      ← created this session
  ?? tasks/todo.md      ← created this session

Recent commits (untouched by this session):
  9569146 feat: add fmo overview command (CLA-1855)
  db18ac9 test: add comprehensive format mode tests for all commands
  0730fda test: add tests for all format modes (CLA-1865)
  16a41ed feat: add structured error formatter with SPEC-009 codes
  1479085 refactor(list): remove dead formatOutput code from ListCommand
```

Nothing committed yet from this session. First commit of next session should bundle `SPEC.md` + `tasks/plan.md` + `tasks/todo.md` + `handoff.md` as a `docs:` commit, then branch into T1.
