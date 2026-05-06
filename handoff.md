# Handoff: claris-odata-cli OData Compliance & Hardening

**Date:** 2026-05-06 (session 3)
**Branch:** `feature/odata-conformance-sweep`
**Repo:** `/Users/styrbjorn/Sites/claris-odata-cli`

## Where We Are

Phase 1 + T3 complete. T1 + T2 + T3 done. Starting next session at **T4**.

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

### T3 — EndpointBuilder + ODataClient single HTTP layer (commit `2ad3ab4`)
- Added `serviceDocument()` + `batch()` + port param to `EndpointBuilder`
- Added `getServiceDocument()` + `getMetadata()` to `ODataClient`
- Removed all direct `axios` imports from `src/cli/*`: browse, init, health, overview, list, schema
- Rewrote all affected tests to mock `ODataClient` instead of axios
- 36 test files, 506 tests, 0 lint errors

## Start Here: T4

**Task:** Ensure `Prefer` and `Accept` headers are sent correctly on all relevant requests.

See `src/api/prefer.ts` (if it exists) or create it. Every `getRecords` / `getRecord` call should send `Prefer: odata.maxpagesize=N` and `Accept: application/json;odata.metadata=minimal`.

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
Phase 2: ✅ T3 ⬜ T4 ⬜ T5 ⬜ Checkpoint B
Phase 3: ⬜ T6 ⬜ T7
Phase 4: ⬜ T8 ⬜ T9 ⬜ T10 ⬜ Checkpoint C
Phase 5: ⬜ T11 ⬜ T12 ⬜ Checkpoint D
```

## Repo State
```
Branch: feature/odata-conformance-sweep
Last commit: 2ad3ab4 feat: T3 — adopt ODataClient as single HTTP layer in all CLI commands
Tests: 36 files, 506 passing
Lint: 0 errors, 49 warnings (all pre-existing explicit-return-type in test files)
```
