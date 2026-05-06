# Implementation Plan: claris-odata-cli OData Compliance & Hardening

Source spec: [`SPEC.md`](../SPEC.md). Generated 2026-05-06.

## Overview

Twelve vertical slices that together close every code-review finding and ship the FileMaker OData capabilities the CLI advertises but doesn't expose (scripts, container upload, batch, FileMaker `Prefer` extensions). Each slice leaves the system green and shippable.

## Architecture Decisions

- **`EndpointBuilder` becomes the single URL source.** Currently dead code; commands hand-roll URLs. We adopt it everywhere so a misspelled segment fails at one place.
- **`Prefer` header is a first-class concern via a new `PreferHeaderBuilder`.** `fmodata.include-specialcolumns` is always-on so `__Id`/`__ModId` appear by default. `IEEE754Compatible=true` is always-on so 64-bit IDs survive JSON.
- **`getRecords` returns `QueryResult<T>` (`{records, count, nextLink}`), not `T[]`.** Breaking change. Justified because the current shape silently drops `@odata.count`. All in-tree callers updated in the same task.
- **`handleApiError` throws typed subclasses (`AuthenticationError`, `NotFoundError`, …).** The classes already exist — we just start using them.
- **CRUD/script/upload/batch commands all sit on `ODataClient`.** No more inline `axios.get`/`Buffer.from` in command files. `list.ts`, `health.ts`, `overview.ts`, `schema.ts`, `browse.ts` all migrate to client methods.
- **Batch input format = JSON DSL we transcode to `multipart/mixed`.** Friendlier than raw multipart; we still hit the spec endpoint.

## Dependency Graph

```
                  api/prefer.ts (new)
                          │
                          ▼
api/endpoints.ts ──► api/client.ts (refactored)
       ▲                  │
       │                  ├──► CRUD commands (get/create/update/delete)
       │                  ├──► list/schema/health/overview/browse  (migrate off inline axios)
       │                  ├──► script command (new)
       │                  ├──► upload command (new)
       │                  └──► batch command (new)
       │
api/errors.ts ──► client.handleApiError ──► cli/index.ts:resolveErrorCode

cli/index.ts:BaseCommand ──► shared formatError utility ──► list/health/overview
```

## Phase Map

| Phase | Goal | Tasks | Risk |
|---|---|---|---|
| 1 | Stop the bleeding — pure bug fixes, no API change | 1, 2 | Low |
| 2 | Build the foundations new code will lean on | 3, 4, 5 | Med (breaking) |
| 3 | Spec-conformant data plane | 6, 7 | Low |
| 4 | New OData capabilities | 8, 9, 10 | Med (multipart) |
| 5 | Cleanup + verification | 11, 12 | Low |

---

## Task List

### Phase 1: Bug fixes (no API change)

#### Task 1: Fix protocol detection across `list` / `health` / `overview`

**Description:** Three commands choose `https` vs `http` from `server.port === 443`. A server on HTTPS port 8443 silently downgrades. Replace with `server.secure ?? true` (matches the pattern already used in `get`/`create`/`update`/`delete`).

**Acceptance:**
- [ ] `list databases`, `health`, `overview` connect to a server with `{ secure: true, port: 8443 }`
- [ ] No occurrences of `port === 443 ? 'https' : 'http'` remain in the repo
- [ ] No regression on the default `port: 443, secure: true` case

**Verification:**
- [ ] New unit test in `tests/unit/cli/protocol-detection.test.ts` covering both ports
- [ ] `npm test`, `npm run lint`

**Dependencies:** None

**Files likely touched:** `src/cli/list.ts`, `src/cli/health.ts`, `src/cli/overview.ts`, `tests/unit/cli/protocol-detection.test.ts`

**Scope:** S

---

#### Task 2: Throw typed error subclasses from `handleApiError`

**Description:** `client.handleApiError` always throws the bare `ODataError`, making the `AuthenticationError`/`NotFoundError`/`ValidationError`/`RateLimitError` hierarchy decorative. Map status codes (400 → ValidationError, 401 → AuthenticationError, 403 → AuthorizationError, 404 → NotFoundError, 429 → RateLimitError, default → ODataError). Existing status-code fallback in `cli/index.ts:resolveErrorCode` keeps working unchanged.

**Acceptance:**
- [ ] 401 response → `instanceof AuthenticationError === true`
- [ ] 403 → `AuthorizationError`, 404 → `NotFoundError`, 400 → `ValidationError`, 429 → `RateLimitError`
- [ ] Other 5xx → bare `ODataError`
- [ ] `RateLimitError.retryAfter` populated from `Retry-After` header when present

**Verification:**
- [ ] `tests/unit/api/client-errors.test.ts` exercises each status with a mocked HTTP layer
- [ ] `npm test`

**Dependencies:** None

**Files likely touched:** `src/api/client.ts`, `tests/unit/api/client-errors.test.ts`

**Scope:** S

---

### Checkpoint A: After Tasks 1-2
- [ ] `npm test` green
- [ ] `npm run lint` clean
- [ ] No behavior regression on existing commands
- [ ] Human review before Phase 2 (breaking changes ahead)

---

### Phase 2: Foundations

#### Task 3: Adopt `EndpointBuilder` as the single URL source

**Description:** `api/endpoints.ts` exists but is unused — every command hand-rolls URLs. Have `ODataClient` instantiate `EndpointBuilder` from its config, and have all commands that currently call `axios.get` directly (`list.ts`, `schema.ts`, `health.ts`, `overview.ts`, `browse.ts`) migrate to `ODataClient` methods. Add `EndpointBuilder` methods for: `serviceDocument()`, `metadata()`, `tableQuery(name, options)`, `script(name, table?, id?)`, `containerField(table, id, field)`, `batch()`.

**Acceptance:**
- [ ] No command imports `axios` directly except possibly `client.ts`
- [ ] `EndpointBuilder` has methods for every URL the CLI constructs
- [ ] `ODataClient` exposes `getServiceDocument()`, `getMetadata()` so `list databases`/`schema` can drop their inline calls

**Verification:**
- [ ] `tests/unit/api/endpoints.test.ts` covers each builder method (URLs are pure strings — easy to test)
- [ ] All existing command tests still pass
- [ ] `grep -rE "axios\\." src/cli` returns nothing

**Dependencies:** None

**Files likely touched:** `src/api/endpoints.ts`, `src/api/client.ts`, `src/cli/list.ts`, `src/cli/schema.ts`, `src/cli/health.ts`, `src/cli/overview.ts`, `src/cli/browse.ts`, `tests/unit/api/endpoints.test.ts`

**Scope:** L — split if it grows past ~8 files

---

#### Task 4: Add `PreferHeaderBuilder` + always-on FM extensions

**Description:** Create `src/api/prefer.ts` exporting `PreferOptions` and `buildPreferHeader(options)`. `ODataClient` accepts `defaultPrefer` in its config and merges per-call overrides. Defaults: `fmodata.include-specialcolumns` (so `__Id`/`__ModId` populate) and `Accept: application/json;IEEE754Compatible=true` (so 64-bit IDs survive). Per-call options support `odata.maxpagesize`, `return=representation|minimal`, `fmodata.basic-timestamp`, `fmodata.gmtoffset`, `fmodata.entity-ids`.

**Acceptance:**
- [ ] `PreferOptions` type covers every header in the FM docs
- [ ] `buildPreferHeader({})` returns the include-specialcolumns default
- [ ] Per-call options override defaults; a call requesting `return: 'minimal'` does NOT include `return=representation`
- [ ] `ODataClient` request inspector shows `Accept: application/json;IEEE754Compatible=true` on every request

**Verification:**
- [ ] `tests/unit/api/prefer.test.ts` (table-driven over each option permutation)
- [ ] Integration test using a mocked HTTP layer asserts the headers actually go on the wire

**Dependencies:** Task 3

**Files likely touched:** `src/api/prefer.ts`, `src/api/client.ts`, `src/types/index.ts`, `tests/unit/api/prefer.test.ts`

**Scope:** M

---

#### Task 5: Change `getRecords` return shape to `QueryResult<T>`

**Description:** Today `getRecords` returns `T[]` and discards `@odata.count` and `@odata.nextLink`. Change return to `{ records: T[]; count?: number; nextLink?: string }`. Update every caller (`get.ts`, `browse.ts:executeAction`). `fmo get --count` prints the count alongside the records.

**Acceptance:**
- [ ] `getRecords({ count: true })` returns `count` matching `@odata.count`
- [ ] `getRecords()` without `count` leaves `count` undefined
- [ ] `fmo get --count` output includes the count in JSON, JSONL, table modes
- [ ] No caller breaks; build green

**Verification:**
- [ ] `tests/unit/api/client-queryresult.test.ts`
- [ ] `tests/unit/cli/get.test.ts` covers `--count`
- [ ] Existing `browse` tests still pass

**Dependencies:** Task 3

**Files likely touched:** `src/api/client.ts`, `src/cli/get.ts`, `src/cli/browse.ts`, `src/types/index.ts`, tests for each

**Scope:** M

---

### Checkpoint B: After Tasks 3-5
- [ ] All commands use `ODataClient` (no direct `axios` in `cli/`)
- [ ] `Prefer: fmodata.include-specialcolumns` and `Accept: …;IEEE754Compatible=true` show up on every request in integration tests
- [ ] `fmo get --count` returns the right number on a real FileMaker Cloud instance (manual smoke)
- [ ] Human review before Phase 3

---

### Phase 3: Spec-conformant data plane

#### Task 6: Surface `$expand` and missing `Prefer` overrides on `fmo get`

**Description:** `QueryOptions.expand` already exists; expose `--expand <fields...>` on `fmo get`. Also expose `--prefer-maxpagesize <n>`, `--prefer-basic-timestamp`, `--prefer-gmtoffset`, `--prefer-entity-ids` for parity with the docs.

**Acceptance:**
- [ ] `fmo get T --expand "Children" --top 5` issues `$expand=Children` and parses the result
- [ ] Each `--prefer-*` flag adds the corresponding header
- [ ] `fmo get --help` documents every flag

**Verification:**
- [ ] `tests/unit/cli/get-expand.test.ts`
- [ ] `tests/unit/cli/get-prefer.test.ts`

**Dependencies:** Task 4, Task 5

**Files likely touched:** `src/cli/get.ts`, `src/cli/index.ts` (commander wiring lives here per the existing pattern)

**Scope:** S

---

#### Task 7: Add `--replace` flag to `fmo update` (PUT vs PATCH)

**Description:** Docs say PATCH for partial update, PUT for full replacement. Today only PATCH is supported. Add `--replace` to switch to PUT, expose `client.replaceRecord(table, id, data)`.

**Acceptance:**
- [ ] `fmo update T 5 --data '{"Name":"X"}'` issues PATCH (existing)
- [ ] `fmo update T 5 --replace --data '{"Name":"X"}'` issues PUT
- [ ] Documented in `--help`

**Verification:**
- [ ] `tests/unit/cli/update-replace.test.ts`
- [ ] `tests/unit/api/client-put.test.ts`

**Dependencies:** Task 3

**Files likely touched:** `src/api/client.ts`, `src/cli/update.ts`

**Scope:** S

---

### Phase 4: New OData capabilities

#### Task 8: `fmo script <name>` — run FileMaker scripts

**Description:** Per `filemaker-scripts-odata.html`, scripts run via POST to `…/Script(<name>)` (optionally on a record context: `…/Table(<id>)/Script(<name>)`). Body carries script parameters. Add `client.runScript(name, opts)` and a new `cli/script.ts` command exposing `--table`, `--id`, `--params <json>`.

**Acceptance:**
- [ ] `fmo script MyScript --params '{"a":1}'` POSTs to `/fmi/odata/v4/{db}/Script(MyScript)` with the JSON body
- [ ] `fmo script MyScript --table T --id 5` adds the record context
- [ ] Script names with spaces are URL-encoded
- [ ] Response body is returned to stdout in the active output format

**Verification:**
- [ ] `tests/unit/cli/script.test.ts`
- [ ] `tests/unit/api/client-script.test.ts`
- [ ] Manual: run a known no-op script against real FileMaker Cloud

**Dependencies:** Task 3, Task 4

**Files likely touched:** `src/api/client.ts`, `src/cli/script.ts`, `src/cli/index.ts` (commander registration), `src/api/endpoints.ts` (already has `script()`)

**Scope:** M

---

#### Task 9: `fmo upload <table> <id> <field> <file>` — container upload

**Description:** Container fields take a binary upload via PATCH against `…/{Table}({id})/{field}` with `Content-Type` matching the file. Add `client.uploadContainer(table, id, field, body, contentType)` and a new `cli/upload.ts` command. Read the file from disk, infer content type from extension (or accept `--content-type`).

**Acceptance:**
- [ ] `fmo upload T 5 Photo ./pic.jpg` PATCHes the container field with `Content-Type: image/jpeg`
- [ ] `--content-type application/pdf` overrides inference
- [ ] File >10 MB is rejected with a clear error (or streamed; pick one — see open question)
- [ ] Returns success indicator on stdout

**Verification:**
- [ ] `tests/unit/cli/upload.test.ts` (uses a small fixture file)
- [ ] `tests/unit/api/client-upload.test.ts` (asserts headers + body)
- [ ] Manual: upload a small PNG to a real FileMaker Cloud container field

**Dependencies:** Task 3

**Files likely touched:** `src/api/client.ts`, `src/cli/upload.ts`, `src/cli/index.ts`, `tests/fixtures/`

**Scope:** M

---

#### Task 10: `fmo batch --file <batch.json>` — batch operations

**Description:** Per OData 4.0, batch is POST `…/$batch` with `multipart/mixed` body. Accept a friendly JSON DSL (array of `{method, table, id?, data?}` objects), transcode to `multipart/mixed`, and parse the multipart response back into a JSON array of per-request results.

**Acceptance:**
- [ ] `fmo batch --file ./b.json` where `b.json` is `[{"method":"POST","table":"T","data":{...}}, {"method":"DELETE","table":"T","id":5}]` succeeds
- [ ] Per-request errors are reported per-element in the response, not as a global failure
- [ ] `--continue-on-error` flag adds `Prefer: odata.continue-on-error`
- [ ] Documented JSON DSL schema in `--help`

**Verification:**
- [ ] `tests/unit/cli/batch.test.ts` (golden multipart fixtures)
- [ ] `tests/unit/api/multipart.test.ts` (transcode + parse round-trip)

**Dependencies:** Task 3, Task 4

**Files likely touched:** `src/api/client.ts`, `src/api/multipart.ts` (new — small helper), `src/cli/batch.ts`, `src/cli/index.ts`

**Scope:** L — flag for split if `multipart.ts` grows past ~250 lines

---

### Checkpoint C: After Tasks 6-10
- [ ] All new flags + commands work against a real FileMaker Cloud instance (manual smoke)
- [ ] Coverage ≥ 80% overall, 100% on `api/client.ts` + `api/prefer.ts`
- [ ] Human review before final cleanup

---

### Phase 5: Cleanup + verification

#### Task 11: Centralize `formatError`, kill `as HttpErrorShape`, simplify `browse.ts`

**Description:** Three commands have an identical `formatError`. Move it to `BaseCommand` as a `protected formatHttpError(error: unknown): string`. Replace every `error as HttpErrorShape` with `axios.isAxiosError(error)` narrowing. Reduce the redundant filter in `browse.ts:fetchDatabases` to `.filter((e) => e.kind !== 'FunctionImport')`. Centralize Authorization header building through `AuthManager` everywhere — no inline `Buffer.from(...).toString('base64')` outside `auth.ts`.

**Acceptance:**
- [ ] `formatError` exists once, in `BaseCommand`
- [ ] `grep "as HttpErrorShape" src/` returns nothing
- [ ] `grep "Buffer.from.*base64" src/cli` returns nothing (only in `src/api/auth.ts`)
- [ ] `browse.ts:fetchDatabases` filter reduced to single condition

**Verification:**
- [ ] All tests still pass
- [ ] `npm run lint` clean

**Dependencies:** Task 3 (commands already on `ODataClient` makes this cleaner)

**Files likely touched:** `src/cli/index.ts`, `src/cli/list.ts`, `src/cli/health.ts`, `src/cli/overview.ts`, `src/cli/browse.ts`

**Scope:** M

---

#### Task 12: Quality gates + smoke test

**Description:** Verify the whole sweep against the success criteria in `SPEC.md`. Run coverage report; gap-fill where below 80% overall or 100% on `api/client.ts` / `api/prefer.ts`. Manual smoke against a real FileMaker Cloud instance: `list`, `get --count`, `get --expand`, `script`, `upload`, `batch`.

**Acceptance:**
- [ ] `npm run test:coverage` shows ≥80% overall
- [ ] `api/client.ts` and `api/prefer.ts` at 100%
- [ ] Manual smoke checklist completed and recorded
- [ ] Every box in `SPEC.md` § Success Criteria is checked

**Verification:**
- [ ] Coverage report committed under `coverage/` (or summary noted in PR)
- [ ] Smoke results pasted into PR description

**Dependencies:** Tasks 1-11

**Files likely touched:** Any thin gap-filling tests, no production code

**Scope:** S

---

### Checkpoint D: Done
- [ ] Every Success Criterion in `SPEC.md` checked
- [ ] PR opened, linked back to `SPEC.md`

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Always-on `IEEE754Compatible=true` returns `Edm.Int64` as a string and breaks downstream JSON consumers | High | Document in `SPEC.md` open question + flag in PR description; monitor first user feedback. Fallback: make it opt-out via env var. |
| Multipart batch parsing has FileMaker-specific quirks not in OData 4.0 spec | Med | Build incrementally with golden fixtures from real FileMaker Cloud responses. Defer if it bloats. |
| `getRecords` shape change breaks downstream consumers if anyone imports `ODataClient` directly | Med | The package is `@claris/odata-cli` (CLI), not a library; in-tree callers are the only ones. Bump major in `package.json` regardless. |
| `EndpointBuilder` migration touches 8+ files in one task | Med | Acceptable for a refactor where reviewer verifies intent (per code-review skill); keep the diff mechanical, no behavior change. |
| Container upload streaming vs buffering decision (open question) | Low | Default to buffering with a 25 MB cap; revisit if real users hit the limit. |

## Open Questions Carrying Forward From SPEC

1. Container *download* — out of scope this sweep, follow-up.
2. Schema-modification verbs (POST table, etc.) — out of scope this sweep.
3. Upload size cap (buffer vs stream) — assume 25 MB buffer, revisit on user feedback.

## Parallelization

Two-agent split is safe along this seam:

- **Agent A:** Tasks 1, 2, 3, 11 (bug fixes + foundation refactor + cleanup)
- **Agent B:** Tasks 4, 5, 6, 7, 8, 9, 10 (Prefer + QueryResult + new commands)

Agent B blocks on Agent A's Task 3 (EndpointBuilder adoption). Everything after that can run in parallel within each agent's lane.
