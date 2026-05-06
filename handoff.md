# Handoff: claris-odata-cli OData Compliance & Hardening

**Last updated:** 2026-05-06 (session 5)
**Branch:** `feature/odata-conformance-sweep`
**Repo:** `/Users/styrbjorn/Sites/claris-odata-cli`

## Node Version

Node 20 is already active (`node --version` → v20.19.2). `nvm use 20` fails due to a
binary download issue in this environment — ignore it, the right version is already in use.

## What's Done

| Task | Commit | Summary |
|------|--------|---------|
| T1 | `b97074f` | Protocol fix: `secure ?? true` instead of `port === 443` in list/health/overview |
| T2 | `0822db3` | `handleApiError` throws typed subclasses (401→Auth, 403→Authz, 404→NotFound, 400→Validation, 429→RateLimit) |
| Checkpoint A | `36b24d1` | 34 files, 485 tests, 0 lint errors |
| T3 | `2ad3ab4` | ODataClient single HTTP layer — no direct axios in `src/cli/*`; added `getServiceDocument()` + `getMetadata()` |
| T4 | `de8b6ed` | `src/api/prefer.ts` created; `getRecords`/`getRecord` send `Accept: application/json;odata.metadata=minimal;IEEE754Compatible=true` and `Prefer: fmodata.include-specialcolumns` by default |
| T5 | `a5b908d` | `QueryResult<T>` + `ODataCollection<T>` types; `getRecords` returns `{ records, count, nextLink }`; `--expand` flag wired in CLI |

**Current state:** 38 test files, 530 tests passing, 0 lint errors, build clean.

---

## ✅ T5 COMPLETE

`QueryResult<T>` / `ODataCollection<T>` added, `getRecords` returns `{ records, count, nextLink }`, `--expand` wired. 530 tests, build clean.

---

## Start Here: Checkpoint B review, then T6

Checkpoint B criteria all met (T3+T4+T5 done). Human review before Phase 3. After review, start T6.

### What to build

1. Add `QueryResult<T>` and `ODataCollection<T>` to `src/types/index.ts`:
   ```ts
   export interface QueryResult<T> {
     records: T[];
     count?: number;       // populated when options.count === true
     nextLink?: string;    // @odata.nextLink if present
   }

   export interface ODataCollection<T> {
     value: T[];
     '@odata.count'?: number;
     '@odata.nextLink'?: string;
   }
   ```

2. Change `ODataClient.getRecords` signature and return type:
   ```ts
   async getRecords<T = unknown>(
     tableName: string,
     options?: QueryOptions,
     prefer?: PreferOptions,
   ): Promise<QueryResult<T>>
   ```
   Response mapping:
   ```ts
   return {
     records: response.data.value,
     count: response.data['@odata.count'],
     nextLink: response.data['@odata.nextLink'],
   };
   ```

3. Update all callers of `getRecords`:
   - `src/cli/get.ts` — use `result.records` instead of bare array; pass `count` through to output
   - `src/cli/browse.ts` — use `result.records`

4. Wire `--expand` flag in `src/cli/get.ts` (it's already in `QueryOptions` but missing from the commander option and the `GetOptions` interface mapping).

5. Update tests:
   - `tests/unit/api/client.test.ts` — `getRecords` mocks need to return `{ value: [...] }` (already do) and assertions on return value now expect `{ records: [...] }` shape
   - `tests/unit/cli/get.test.ts` — update mock setup and assertions
   - Add new test: `getRecords({ count: true })` → `result.count` equals `@odata.count` from response

### Acceptance criteria (from SPEC.md)
- `getRecords({ count: true })` returns `{ records, count }` with `count` matching `@odata.count`
- `--expand` flag on `fmo get` populates `$expand` in the URL
- All existing tests still pass after the breaking return-type change

---

## Checkpoint B (T3 + T4 + T5)

- [ ] All commands use `ODataClient` (no direct `axios` in `cli/`) ✅ T3
- [ ] `Prefer` + `Accept` headers verified ✅ T4
- [ ] `fmo get --count` works ✅ T5
- [ ] Human review before Phase 3

---

## Remaining Work (Phase 3+)

### Phase 3
- **T6** — `fmo script <name>` command: POST to `.../Script(<name>)`, support `--table`, `--id`, `--params <json>`
- **T7** — `fmo upload <table> <id> <field> <file>` command: PATCH container field with file bytes

### Phase 4
- **T8** — `fmo batch --file <batch.json>`: POST `multipart/mixed` to `/$batch` (JSON DSL → multipart)
- **T9** — `fmo update --replace`: PUT instead of PATCH
- **T10** — Cleanup sweep:
  - `formatError` centralised in `BaseCommand` (remove duplicates in list/health/overview)
  - Eliminate any remaining `error as HttpErrorShape` casts
  - `browse.ts`: change entity filter to `e.kind !== 'FunctionImport'`
  - Ensure `Authorization` header always goes through `AuthManager` (no inline `Buffer.from`)
- **Checkpoint C** — review

### Phase 5
- **T11** — Coverage: ≥ 80% overall, 100% on `api/client.ts` + `api/prefer.ts`
- **T12** — Smoke-test notes: manual verification checklist against real FileMaker Cloud instance (`list`, `get --count`, `script`, `upload`)
- **Checkpoint D** — final review, merge

---

## Decisions Locked In

- `EndpointBuilder` = single URL source
- `Prefer` first-class via `src/api/prefer.ts` ✅
- `getRecords` → `QueryResult<T>` (breaking, major bump) — implement in T5
- `handleApiError` → typed subclasses ✅
- Batch input = JSON DSL → multipart
- `IEEE754Compatible=true` always-on ✅
- Container download (`fmo download`) = out of scope this sweep

## Hard Rules

- Never `any` or `as` to silence types
- Never disable a failing test
- Never `git push --force` or `--no-verify`
- Never log passwords or full auth headers
- Don't change keychain account-key format
- Run `npm test && npm run lint` before every commit

## Todo State

```
Phase 1: ✅ T1  ✅ T2  ✅ Checkpoint A
Phase 2: ✅ T3  ✅ T4  ✅ T5  ⬜ Checkpoint B
Phase 3: ⬜ T6  ⬜ T7
Phase 4: ⬜ T8  ⬜ T9  ⬜ T10  ⬜ Checkpoint C
Phase 5: ⬜ T11  ⬜ T12  ⬜ Checkpoint D
```

## Repo State

```
Branch:      feature/odata-conformance-sweep
Last commit: de8b6ed feat: T4 — add prefer.ts and send correct Prefer/Accept headers on reads
Tests:       38 files, 529 passing
Lint:        0 errors, 49 warnings (all pre-existing explicit-return-type in test files)
Build:       clean
```
