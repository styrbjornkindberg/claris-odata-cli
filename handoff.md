# Handoff: claris-odata-cli OData Compliance & Hardening

**Last updated:** 2026-05-06 (session 6)
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
| Checkpoint B review | `ba53833` | Fixed health.ts ECONNREFUSED dead-code path, get.ts baseUrl suffix, --count null leak |

**Current state:** 38 test files, 530 tests passing, 0 lint errors, build clean.

---

## Start Here: T6

**Goal:** Add `fmo script <name>` command — POST to FileMaker script endpoint.

### What to build

#### 1. New method on `ODataClient` (`src/api/client.ts`)

```ts
async runScript(
  scriptName: string,
  options?: { table?: string; recordId?: number; params?: unknown },
): Promise<unknown>
```

- URL when no table context: `/fmi/odata/v4/${this.database}/Script('${scriptName}')`
- URL with table + recordId: `/fmi/odata/v4/${this.database}/${table}(${recordId})/Script('${scriptName}')`
- URL with table only: `/fmi/odata/v4/${this.database}/${table}/Script('${scriptName}')`
- POST body: `{ "scriptParameterValue": params }` when params provided, else `{}`
- Return: `response.data` (raw — callers decide how to display)

#### 2. New command class `src/cli/script.ts`

Follow the exact same structure as `src/cli/get.ts`:
- `ScriptOptions extends CommandOptions` with fields: `serverId`, `database`, `name`, `table?`, `id?`, `params?`
- `ScriptCommand extends BaseCommand<ScriptOptions>`
- Credential resolution identical to `get.ts` (listCredentials → find entry → getCredentials)
- baseUrl: `${protocol}://${server.host}:${port}` (no `/fmi/odata/v4` suffix — lesson from review item 2)
- Call `client.runScript(name, { table, recordId: id, params: parsedParams })`
- `formatOutput`: format result as JSON; on error use the same structured error shape as get.ts

#### 3. Wire into commander (`src/index.ts`)

```ts
program
  .command('script <name>')
  .description('Run a FileMaker script')
  .requiredOption('-s, --server <id>', 'Server ID')
  .requiredOption('-d, --database <name>', 'Database name')
  .option('--table <name>', 'Table context for the script')
  .option('--id <n>', 'Record ID context', parseInt)
  .option('--params <json>', 'Script parameter as JSON')
  .action(async (name: string, options) => { ... })
```

Parse `--params` with `JSON.parse`; surface a clear error if the JSON is invalid (see how `create` command does it in `src/index.ts:135-141`).

#### 4. Tests

- `tests/unit/api/client.test.ts` — add `describe('runScript')` block:
  - posts to correct URL (no table, table only, table+id)
  - sends `{ scriptParameterValue: params }` when params provided
  - sends `{}` when no params
  - returns response data
- `tests/unit/cli/script.test.ts` — new file, mirror structure of `get.test.ts`:
  - credential resolution path (happy path, missing server, missing entry)
  - params parsing error surfaces correctly

### Acceptance criteria
- `fmo script MyScript -s prod -d Sales` posts to `/fmi/odata/v4/Sales/Script('MyScript')`
- `--table Customers --id 5` changes URL to `/fmi/odata/v4/Sales/Customers(5)/Script('MyScript')`
- `--params '{"key":"val"}'` sends `{ "scriptParameterValue": {"key":"val"} }` in the body
- Invalid JSON in `--params` exits non-zero with a readable error, no stack trace
- All existing 530 tests still pass

---

## Checkpoint B (T3 + T4 + T5 + review)

- [x] All commands use `ODataClient` (no direct `axios` in `cli/`) ✅ T3
- [x] `Prefer` + `Accept` headers verified ✅ T4
- [x] `fmo get --count` works ✅ T5
- [x] Human review complete ✅ ba53833

---

## Remaining Work (Phase 3+)

### Phase 3
- **T6** — `fmo script <name>` command ⬅ START HERE
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
- `getRecords` → `QueryResult<T>` ✅
- `handleApiError` → typed subclasses ✅
- Batch input = JSON DSL → multipart
- `IEEE754Compatible=true` always-on ✅
- `baseUrl` passed to `ODataClient` is always `${protocol}://${host}:${port}` — no path suffix ✅
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
Phase 2: ✅ T3  ✅ T4  ✅ T5  ✅ Checkpoint B
Phase 3: ⬜ T6  ⬜ T7
Phase 4: ⬜ T8  ⬜ T9  ⬜ T10  ⬜ Checkpoint C
Phase 5: ⬜ T11  ⬜ T12  ⬜ Checkpoint D
```

## Repo State

```
Branch:      feature/odata-conformance-sweep
Last commit: ba53833 fix: review items 1-2+4 — health.ts ECONNREFUSED path, get.ts baseUrl, count omission
Tests:       38 files, 530 passing
Lint:        0 errors, 49 warnings (all pre-existing explicit-return-type in test files)
Build:       clean
```
