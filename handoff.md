# Handoff: claris-odata-cli OData Compliance & Hardening

**Last updated:** 2026-05-11 (session 13)
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
| T6 | `80e73c9` | `fmo script <name>` command — ODataClient.runScript(), ScriptCommand, commander wiring |
| T7 | `e5ca7e5` | `fmo upload <table> <id> <field> <file>` — PATCH container field with file bytes; MIME detection |
| T8 | `edd1a2c` | `fmo batch --file <batch.json>` — JSON DSL → multipart/mixed POST to `/$batch` |
| T9 | `a9a24da` | `fmo update --replace` — PUT via `ODataClient.replaceRecord`; `UpdateOptions.replace` flag |
| T10 | `0cabbdb` | Cleanup sweep: `formatApiError` centralised in `src/cli/index.ts`; HealthCommand imports it directly; BaseCommand.formatError delegates; private duplicates removed from health/overview; filter simplified to `e.kind !== 'FunctionImport'`; all `Buffer.from` → `AuthManager.createBasicAuthToken` |
| T11 | `165e35c` | Coverage sweep: `@vitest/coverage-v8` added; `profiles.test.ts` (22 tests, 0→100%); 429 NaN retry-after + empty-options branches in client tests; health latency threshold de-flaked; overall 83.15%, api/client.ts + api/prefer.ts 100% |
| T12 | `15b2cc4` | `docs/SMOKE_TEST.md` — manual checklist: health, list databases/tables, get, get --count, get w/ query opts, script (3 URL variants + params + invalid JSON guard), upload (txt + jpeg), error paths, cleanup |
| Smoke-fix | `41d2e13` | Live smoke test against tethys.squaremoon.se found 2 bugs: Commander option shadowing broke all commands with -s/-d; FileMaker EntityType suffix "_" broke `schema <table>`. Both fixed, 606 tests pass. |
| T13 | `9748bb4` | Stable server IDs: `buildServerId(name, host)` → SHA-256 8-char suffix; idempotent re-add prints "updated"; 615 tests pass. |

**Current state:** 43 test files, 615 tests passing, 0 lint errors, build clean.

---

## Start Here: Checkpoint C

**Goal:** Code review of the full branch diff (`main..feature/odata-conformance-sweep`) before merge.

---

## Smoke test findings (2026-05-11)

Live run against `tethys.squaremoon.se / ODATA_CLI_Integrationtest.fmp12`.

### DB contents discovered

| Table | Records | Notes |
|---|---|---|
| `CONTACTS` | 8 | Name, Company, `_Id`, audit fields |
| `CONTACTMETHODS` | 6 | Type (Email/Phone), Value, FK `_Id_Contacts` → CONTACTS |
| `ODATA_CLI_Integrationtest` | 32 | Integration test fixture data |
| `FileUploadTest_20260410_193815` | 1 | Container field test target |
| `TestTable_integration` | 2 | Name, Email, ID |
| `TestSchema_20260410_192652` | 0 | Schema-only |

### Bugs fixed (commit `41d2e13`)

**Commander option shadowing** (`src/index.ts`)
Root program defines `-s/--server` and `-d/--database`. All subcommands used `requiredOption` for the same names — Commander validated the subcommand's own (empty) option object before the `globalOpts` fallback could run, giving "required option not specified" on every command. Fixed by changing to `option()` on all affected subcommands (get, create, update, delete, script, upload, batch, schema, credentials add). The `?? globalOpts` fallback was already wired correctly.

**FileMaker EntityType suffix** (`src/cli/schema.ts`)
FM OData appends `_` to all EntityType names (e.g. `CONTACTS` → `CONTACTS_`). `schema <table>` searched for the bare name → always "not found". Fixed by appending `_` before the regex match; test mock XML updated to match.

### Bug outstanding → T13

`server add` generates a new random-suffix ID on every invocation. Stored keychain credentials use the server ID as part of the account key (`${serverId}:${database}:${username}`), so they are orphaned whenever a server is re-registered. During the smoke run this required bypassing the CLI entirely to store credentials via a Node script.

---

## T13 — Stable server IDs

**Goal:** `server add` must produce the same server ID every time for a given name + host combination. Currently it appends a random 8-char suffix on every call.

### What to change

#### `src/cli/server.ts` — ID generation

Replace the random suffix with a short deterministic hash of `${name}:${host}`:

```ts
import { createHash } from 'crypto';

function buildServerId(name: string, host: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = createHash('sha256')
    .update(`${name}:${host}`)
    .digest('hex')
    .slice(0, 8);
  return `${slug}-${suffix}`;
}
```

Examples:
- `--name tethys --host tethys.squaremoon.se` → `tethys-4a7f2b1c` (stable)
- `--name prod --host fm.example.com` → `prod-9e3d5a8f` (stable)

#### `server add` idempotency

If a server with the same ID already exists, update it in place (host/port/secure may have changed) rather than erroring. Print "Server updated" instead of "Server added" in that case.

#### `src/config/servers.ts` — no change needed

`ServerStore.set()` already overwrites by ID, so idempotency is free once the ID is stable.

### Tests

Update `tests/unit/cli/server.test.ts`:
- Add: same name+host always produces the same ID
- Add: re-adding an existing server updates it, prints "updated"
- Existing tests: update any hardcoded ID expectations to match the new deterministic format

### Acceptance criteria

- `fmo server add --name tethys --host tethys.squaremoon.se` twice → same ID both times
- Running `server add` when the ID already exists: overwrites host/port/secure, exits 0, message says "updated"
- Stored credentials are not affected by re-registration (same ID = same keychain account key)
- All existing tests pass

---

## Checkpoint C — Code review

**Goal:** Review the full branch diff (`main..feature/odata-conformance-sweep`) before merge.

Checklist:
- [ ] No `any` or unsafe `as` casts introduced
- [ ] All error paths return typed errors, no raw `throw`
- [ ] `Authorization` header only via `AuthManager.createBasicAuthToken` — no inline `Buffer.from`
- [ ] No direct `axios` calls in `src/cli/*`
- [ ] Commander option shadowing fix is complete (all subcommands use `option` for `-s`/`-d`)
- [ ] Schema EntityType `_` suffix fix present in `src/cli/schema.ts`
- [ ] T13 server ID fix in place
- [ ] `npm test && npm run lint` passes

---

## Checkpoint D — Final review + merge

**Goal:** Final review + merge to `main`. See `docs/SMOKE_TEST.md` for pre-merge manual verification.

Pre-merge:
- [ ] Checkpoint C complete
- [ ] Smoke test run against `tethys.squaremoon.se` with stable server IDs (T13)
- [ ] `git log --oneline main..HEAD` reviewed — no stray commits
- [ ] PR created, CI green, squash-merge to main

---

## T12 (done)

**Goal:** Smoke-test notes — manual verification checklist against a real FileMaker Cloud instance (`list`, `get --count`, `script`, `upload`). ✅

---

## T11 (done)

**Goal:** Coverage — ≥ 80% overall, 100% on `api/client.ts` + `api/prefer.ts`. ✅

---

## T9 (done)

**Goal:** Add `fmo update --replace`: PUT instead of PATCH. ✅

---

## T8 (done)

**Goal:** Add `fmo upload <table> <id> <field> <file>` command — PATCH container field with file bytes.

- `ODataClient.uploadContainerField(table, recordId, field, buffer, contentType)` — PATCH `/fmi/odata/v4/{db}/{table}({id})/{field}`
- `UploadCommand` reads file from disk, detects MIME from extension (jpeg/png/gif/pdf/xml/txt/csv → octet-stream fallback)
- Commander wiring: `upload <table> <id> <field> <file>` with `-s` and `-d` required options

---

## T6 (done)

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
- **T11** — Coverage: ≥ 80% overall, 100% on `api/client.ts` + `api/prefer.ts` ✅
- **T12** — Smoke-test notes: manual checklist ✅
- **Smoke-fix** — Commander option shadowing + schema EntityType suffix ✅

### Phase 6
- **T13** — Stable server IDs: deterministic ID from name+host, idempotent re-add ⬅ START HERE
- **Checkpoint C** — Code review
- **Checkpoint D** — Final review + merge

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
Phase 3: ✅ T6  ✅ T7
Phase 4: ✅ T8  ✅ T9  ✅ T10  ⬜ Checkpoint C
Phase 5: ✅ T11  ✅ T12  ✅ Smoke-fix
Phase 6: ✅ T13  ⬜ Checkpoint C  ⬜ Checkpoint D
```

## Repo State

```
Branch:      feature/odata-conformance-sweep
Last commit: 9748bb4 feat(T13): stable deterministic server IDs from name+host hash
Tests:       43 files, 615 passing
Coverage:    83.15% stmt/lines, 81.21% branch, 88.37% fn — all ≥ 80%
             api/client.ts 100%, api/prefer.ts 100%, config/profiles.ts 100%
Lint:        0 errors, 51 warnings (all pre-existing explicit-return-type in test files)
Build:       clean
```
