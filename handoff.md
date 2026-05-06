# Handoff: claris-odata-cli OData Compliance & Hardening

**Date:** 2026-05-06 (session 2)
**Branch:** `feature/odata-conformance-sweep`
**Repo:** `/Users/styrbjorn/Sites/claris-odata-cli`

## Where We Are

Phase 1 complete. T1 + T2 done, Checkpoint A passed. Starting next session at **T3**.

Node version needed: **20** (`nvm use 20`). Default shell has v10 active.

## What Landed This Session

### T1 — Protocol detection fix (commit `b97074f`)
- `list.ts`, `health.ts`, `overview.ts` all used `port === 443 ? 'https' : 'http'`
- Fixed to `(server.secure ?? true) ? 'https' : 'http'` in all three
- Added `secure?: boolean` to `checkServer` param type in `health.ts`
- 12 new tests: `tests/unit/cli/protocol-detection.test.ts`
- Fixed pre-existing overview.test.ts that encoded the buggy behavior

### T2 — Typed error subclasses (commit `0822db3`)
- `handleApiError` now switches on status: 401→`AuthenticationError`, 403→`AuthorizationError`, 404→`NotFoundError`, 400→`ValidationError`, 429→`RateLimitError` (parses `Retry-After` header), else→`ODataError`
- 8 new tests: `tests/unit/api/client-errors.test.ts`

### Checkpoint A (commit `36b24d1`)
- 34 test files, 485 tests, 0 lint errors. Green.

## Start Here: T3

**Task:** Adopt `EndpointBuilder` as single URL source. Commands migrate off inline `axios`.

**Acceptance:**
- No command imports `axios` directly (except `client.ts`)
- `EndpointBuilder` has methods for every URL the CLI constructs
- `ODataClient` exposes `getServiceDocument()` + `getMetadata()` so `list`/`schema` drop their inline calls

**Files to touch:**
- `src/api/endpoints.ts` — already has most builder methods; needs `serviceDocument()` + `batch()` added; also needs to accept port in constructor
- `src/api/client.ts` — add `getServiceDocument()` + `getMetadata()` methods
- `src/cli/list.ts` — drop direct axios, use `ODataClient.getServiceDocument()` + `getMetadata()`
- `src/cli/schema.ts` — drop direct axios, use `ODataClient.getMetadata()`
- `src/cli/health.ts` — drop direct axios, use `ODataClient.getServiceDocument()`
- `src/cli/overview.ts` — drop direct axios, use `ODataClient.getServiceDocument()` + `getMetadata()`
- `src/cli/browse.ts` — `fetchDatabases` + `fetchTables` + `executeAction` (view-schema) all use axios directly; migrate to `ODataClient`
- `tests/unit/api/endpoints.test.ts` — extend with new builder methods

**Key context already read this session:**
- `endpoints.ts` current state: has `metadata()`, `tables()`, `table()`, `record()`, `createRecord()`, `script()`, `container()` — missing `serviceDocument()` (root `/fmi/odata/v4/`) and `batch()`
- `EndpointBuilder` constructor takes `(host, database, useHttps)` — no port. Add port param.
- `browse.ts:fetchDatabases` calls `/fmi/odata/v4` (no database suffix) — that's the service document for the server root, not database-scoped
- `browse.ts:fetchTables` calls `/fmi/odata/v4/{database}` — database-scoped service document
- `browse.ts:executeAction` case `view-schema` uses inline axios for metadata
- `list.ts:listDatabases` calls `/fmi/odata/v4/` (service document)
- `list.ts:listTables` calls `/{db}/$metadata` XML
- `health.ts:checkServer` calls `/fmi/odata/v4/` (service document)
- `overview.ts` calls service document then `/{db}/$metadata` for each db

**Approach for T3:**
1. Add port to `EndpointBuilder` constructor
2. Add `serviceDocument()` method (returns `/fmi/odata/v4/` — no database)
3. Add `batch()` method
4. Add `getServiceDocument()` + `getMetadata()` to `ODataClient`
5. Migrate each command, one by one
6. Verify `grep -rE "axios\." src/cli` returns nothing

**Tricky bit:** `list.ts` + `health.ts` + `overview.ts` build their own axios calls because they don't have access to `ODataClient` — they construct one ad-hoc. Migrate them to instantiate `ODataClient` the same way `get.ts` does.

**browse.ts** is the biggest one — `fetchDatabases`/`fetchTables` use axios directly and build their own auth header. These should delegate to `ODataClient` methods. `executeAction view-schema` also needs to go through the client.

**Test strategy:** Write failing tests for new `ODataClient` methods first, then migrate commands. Existing command tests mock axios — update them to mock `ODataClient` methods instead after migration.

## Checkpoint B (after T3, T4, T5)
- All commands use `ODataClient` (no direct `axios` in `cli/`)
- Prefer + Accept headers verified
- `fmo get --count` works
- Human review before Phase 3

## Decisions Already Locked In
(unchanged from session 1 — see SPEC.md for full list)

- `EndpointBuilder` = single URL source
- `Prefer` first-class via `src/api/prefer.ts`
- `getRecords` → `QueryResult<T>` (breaking, major bump)
- `handleApiError` → typed subclasses ✅ done
- Batch input = JSON DSL → multipart
- Container download out of scope

## Hard Rules
- Never `any` or `as` to silence types
- Never disable a failing test
- Never `git push --force` or `--no-verify`
- Never log passwords or full auth headers
- Don't change keychain account-key format

## Todo State
```
Phase 1: ✅ T1 ✅ T2 ✅ Checkpoint A
Phase 2: ⬜ T3 ⬜ T4 ⬜ T5 ⬜ Checkpoint B
Phase 3: ⬜ T6 ⬜ T7
Phase 4: ⬜ T8 ⬜ T9 ⬜ T10 ⬜ Checkpoint C
Phase 5: ⬜ T11 ⬜ T12 ⬜ Checkpoint D
```

## Repo State
```
Branch: feature/odata-conformance-sweep
Last commit: 36b24d1 chore: tick T1, T2, Checkpoint A in todo
Tests: 34 files, 485 passing
Lint: 0 errors, 49 warnings (all pre-existing explicit-return-type in test files)
```
