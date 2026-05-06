# Spec: claris-odata-cli — OData Compliance & Hardening

Sweep that closes correctness bugs, eliminates dead code, and lands the FileMaker OData capabilities the CLI advertises but doesn't ship: scripts, container upload, batch, and FileMaker `Prefer` extensions.

## Objective

Bring `claris-odata-cli` to full conformance with the FileMaker OData guide (https://help.claris.com/en/odata-guide/) and fix the bugs surfaced in the 2026-05-06 code review.

**Users:** FileMaker developers + ops engineers who interact with FileMaker Server / FileMaker Cloud OData endpoints from a terminal or in scripts/CI.

**Success means:**
- No protocol-detection bugs (HTTPS works on non-443 ports)
- `__Id` / `__ModId` are always populated on returned records
- `--count` actually returns a count
- The CLI exposes every OData capability FileMaker documents as supported
- Error hierarchy is real, not decorative
- No dead modules

## Tech Stack

- TypeScript 5.x, target ES2022, Node 18+
- commander ^12 (CLI framework)
- axios ^1.6 (HTTP)
- keytar ^7.9 (OS keychain — passwords)
- conf ^12 (config files — non-secret)
- @inquirer/prompts ^8 (interactive TUI)
- chalk ^4 (colors)
- vitest ^1 (tests)
- eslint + prettier (lint/format)

## Commands

```
Build:   npm run build
Dev:     npm run dev          # tsc --watch
Test:    npm test             # vitest run
Cover:   npm run test:coverage
Lint:    npm run lint         # eslint src/**/*.ts
Format:  npm run format       # prettier --write src/**/*.ts
```

CLI surface after this work:

```
fmo init                              # first-run setup
fmo server add|list|remove
fmo server credentials add|list|remove
fmo profile add|list|use
fmo list servers|databases|tables
fmo schema [--table <t>]
fmo get      <table> [--filter --select --top --skip --orderby --count --expand]
fmo create   <table> --data <json>
fmo update   <table> <id> --data <json> [--replace]   # NEW: --replace = PUT vs PATCH
fmo delete   <table> <id>
fmo script   <script> [--table <t>] [--id <n>] [--params <json>]   # NEW
fmo upload   <table> <id> <field> <file>                            # NEW: container
fmo batch    --file <batch.json>                                    # NEW
fmo browse                            # interactive TUI
fmo health
fmo overview [--detailed]
```

## Project Structure

```
src/
├── api/
│   ├── auth.ts            # Basic Auth header builder
│   ├── client.ts          # ODataClient — single source for HTTP
│   ├── endpoints.ts       # EndpointBuilder — used by client + commands
│   ├── errors.ts          # ODataError + subclasses
│   └── prefer.ts          # NEW: PreferHeaderBuilder (FM extensions)
├── cli/
│   ├── index.ts           # BaseCommand + shared error formatting
│   ├── browse.ts          # interactive TUI
│   ├── create.ts get.ts update.ts delete.ts list.ts schema.ts
│   ├── health.ts overview.ts init.ts profile.ts server.ts
│   ├── credentials.ts
│   ├── script.ts          # NEW
│   ├── upload.ts          # NEW
│   └── batch.ts           # NEW
├── config/
│   ├── credentials.ts     # keychain via keytar
│   ├── profiles.ts
│   └── servers.ts
├── output/
│   ├── formatter.ts
│   └── index.ts
├── lib/theme.ts
├── types/index.ts
├── utils/logger.ts
└── index.ts               # CLI entry
tests/
├── unit/                  # *.test.ts mirroring src/
└── integration/           # hits a mocked OData server
SPEC.md
```

## Code Style

Per `~/.claude/rules/typescript/coding-style.md`. Example of the target shape for the new client method that fixes the `$count` bug and adopts FileMaker `Prefer` extensions:

```ts
export interface QueryResult<T> {
  records: T[]
  count?: number   // populated when options.count === true
  nextLink?: string
}

export interface ClientConfig {
  baseUrl: string
  database: string
  authToken: string
  timeout?: number
  /** Always-on FM extensions; callers may override per-call. */
  defaultPrefer?: PreferOptions
}

async getRecords<T = Record>(
  tableName: string,
  options?: QueryOptions,
  prefer?: PreferOptions,
): Promise<QueryResult<T>> {
  const url = this.endpoints.tableQuery(tableName, options)
  const response = await this.http.get<ODataCollection<T>>(url, {
    headers: buildPreferHeader({ ...this.defaultPrefer, ...prefer }),
  })
  return {
    records: response.data.value,
    count: response.data['@odata.count'],
    nextLink: response.data['@odata.nextLink'],
  }
}
```

Conventions:
- No `any`. `unknown` at boundaries, narrow with type guards or `axios.isAxiosError`
- No `as` casts to bypass `unknown` (kill `as HttpErrorShape`)
- Public methods get explicit param + return types
- Errors thrown from `client` are always typed subclasses of `ODataError` — never the bare class for known HTTP statuses
- File size target 200–400 lines, hard cap 800
- Comments only when WHY is non-obvious
- Immutable updates via spread; never mutate input args

## Testing Strategy

- **Framework:** vitest, tests live in `tests/unit/` and `tests/integration/`
- **Coverage target:** 80%+ overall; 100% on `api/client.ts` and `api/prefer.ts`
- **Levels:**
  - **Unit** — pure functions (endpoint builder, prefer builder, error mapper, formatters). No network.
  - **Integration** — `ODataClient` against a mocked HTTP server (msw or nock). Covers status-code → error-subclass mapping, `$count` propagation, `Prefer` headers actually sent.
  - **Command** — each CLI command tested via its `execute()` method with stubbed config + http.
  - **TUI** — `browse.ts` already has TTY tests; extend for new failure paths.
- **TDD:** new features (script, upload, batch) must have a failing test before implementation
- **Regression:** every code-review finding gets a test that fails on old code, passes on fixed code

## Boundaries

**Always:**
- Add `Prefer: fmodata.include-specialcolumns` to every read by default so `__Id`/`__ModId` are populated
- Use `server.secure ?? true` (never `port === 443`) to choose protocol
- Throw a typed `ODataError` subclass from `client.handleApiError` for 400/401/403/404/429
- Run `npm test && npm run lint` before committing
- Update SPEC.md when scope or decisions change

**Ask first:**
- Adding a new dependency
- Changing the keychain account-key format (breaks existing users)
- Renaming or removing existing CLI flags
- Changing config file location or format

**Never:**
- Log passwords or full Authorization headers, in any output mode
- Commit `.env` or anything with real credentials
- Use `git push --force` or `--no-verify`
- Disable a failing test instead of fixing it
- Use `any` or `as` to silence type errors

## Success Criteria

Each item testable. Done when all pass.

### Correctness fixes
- [ ] `list databases`, `health`, `overview` connect over HTTPS on a non-443 port (regression test: server with `secure:true, port:8443`)
- [ ] `client.handleApiError` throws `AuthenticationError` for 401, `AuthorizationError` for 403, `NotFoundError` for 404, `ValidationError` for 400, `RateLimitError` for 429
- [ ] `getRecords({ count: true })` returns `{ records, count }` with `count` matching `@odata.count`
- [ ] Records returned by `get` always include `__Id` and `__ModId` (verified via `Prefer: fmodata.include-specialcolumns`)

### OData spec coverage
- [ ] `--expand` flag on `fmo get` populates `$expand`
- [ ] `fmo script <name>` POSTs to `…/Script(<name>)` and returns the response (per `filemaker-scripts-odata.html`)
- [ ] `fmo upload <table> <id> <field> <file>` PATCHes a container field with the file content
- [ ] `fmo batch --file <batch.json>` POSTs a `multipart/mixed` batch to `/$batch`
- [ ] Client honors `Prefer` options: `odata.maxpagesize`, `return=representation|minimal`, `fmodata.basic-timestamp`, `fmodata.gmtoffset`, `fmodata.entity-ids`, `fmodata.include-specialcolumns`
- [ ] Accept header includes `IEEE754Compatible=true` so 64-bit IDs survive JSON
- [ ] `update` supports both PATCH (default) and PUT (`--replace`)

### Cleanup
- [ ] `EndpointBuilder` is the single URL source; no command builds URLs inline
- [ ] `formatError` lives in `BaseCommand`, not duplicated across `list`/`health`/`overview`
- [ ] No `error as HttpErrorShape` casts remain; use `axios.isAxiosError` + narrowing
- [ ] `browse.ts` filter reduced to `e.kind !== 'FunctionImport'`
- [ ] `Authorization` header construction goes through `AuthManager` everywhere (no inline `Buffer.from(…).toString('base64')` in commands)

### Quality gates
- [ ] `npm test` green
- [ ] `npm run lint` clean
- [ ] Coverage ≥ 80% overall, 100% on `api/client.ts` + `api/prefer.ts`
- [ ] Manual smoke against a real FileMaker Cloud instance: `list`, `get --count`, `script`, `upload`

## Open Questions

1. Batch input format — accept the raw OData `multipart/mixed` body, or a friendlier JSON DSL we transcode? **Default assumption:** accept JSON DSL and transcode.
2. `IEEE754Compatible=true` — opt-in via flag, or always-on? **Default assumption:** always-on for safety.
3. Container download (GET on a container field) — in scope or follow-up? **Default assumption:** add `fmo download` as a follow-up, not this sweep.
4. Schema-modification verbs (POST table, PATCH/PUT field, DELETE table) — the docs list these as supported. In scope? **Default assumption:** out of scope; data-plane only this round.
