# Tasks: Interactive Navigation and Credential Management

**Input**: Design documents from `/specs/008-browse-credentials/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-commands.md

**Tests**: Not explicitly requested — test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependency and prepare project for feature work

- [ ] T001 Install `@inquirer/prompts` dependency via `npm install @inquirer/prompts`
- [ ] T002 [P] Add new types (`CredentialEntry`, `BrowseLevel`, `BrowseAction`) to `src/types/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend `CredentialsManager` with listing capability needed by both credential commands and browse

**⚠️ CRITICAL**: US1 and US3 both depend on `listCredentials` — must complete before user story work begins

- [ ] T003 Add `listCredentials(serverId: string): Promise<CredentialEntry[]>` method to `src/config/credentials.ts` using `keytar.findCredentials()`, parsing account keys with format `{serverId}:{database}:{username}` and filtering by server ID
- [ ] T004 [P] Add `deleteCredential(serverId: string, database: string, username: string): Promise<boolean>` method to `src/config/credentials.ts` using `keytar.deletePassword()`

**Checkpoint**: Foundation ready — `CredentialsManager` supports list and delete operations

---

## Phase 3: User Story 1 — Manage Credentials After Server Creation (Priority: P1) 🎯 MVP

**Goal**: Users can add, list, and remove credentials for any configured server via `fmo server credentials add/list/remove`

**Independent Test**: Add a server, then run `fmo server credentials add/list/remove` and verify keychain entries are created, listed, and deleted correctly

### Implementation for User Story 1

- [ ] T005 [US1] Create `CredentialsCommand` class in `src/cli/credentials.ts` with commander subcommand group defining `add`, `list`, and `remove` subcommands with flags per contracts/cli-commands.md
- [ ] T006 [US1] Implement `add` action in `src/cli/credentials.ts` — validate server exists via `ServerManager`, prompt for password via `@inquirer/prompts` `password()` if `--password` omitted, store via `CredentialsManager.saveCredentials()`
- [ ] T007 [US1] Implement `list` action in `src/cli/credentials.ts` — validate server exists, call `CredentialsManager.listCredentials()`, format output per contract (text and JSON modes)
- [ ] T008 [US1] Implement `remove` action in `src/cli/credentials.ts` — validate server exists, call `CredentialsManager.deleteCredential()`, display confirmation or error per contract
- [ ] T009 [US1] Register `credentials` subcommand under `server` command in `src/cli/server.ts` by importing and attaching `CredentialsCommand`

**Checkpoint**: `fmo server credentials add/list/remove` fully functional — can manage keychain entries independently

---

## Phase 4: User Story 2 — Warning on Incomplete Credentials at Server Add (Priority: P1)

**Goal**: `fmo server add` warns when `--password` is provided without `--username` or `--database`

**Independent Test**: Run `fmo server add --name dev --host example.com --password secret` without `--username` and verify warning message appears

### Implementation for User Story 2

- [ ] T010 [US2] Verify and enhance incomplete-credential warning logic in `src/cli/server.ts` — ensure warning is displayed when `--password` is provided without both `--username` and `--database`, matching acceptance scenarios in spec.md

**Checkpoint**: `fmo server add` correctly warns on incomplete credential flags

---

## Phase 5: User Story 3 — Browse Servers, Databases, and Tables Interactively (Priority: P2)

**Goal**: Users can run `fmo browse` and navigate interactively through servers → databases → tables → actions using a TUI menu

**Independent Test**: Configure a server with credentials, run `fmo browse`, navigate through all levels, and perform an action on a table

### Implementation for User Story 3

- [ ] T011 [US3] Create `BrowseCommand` class in `src/cli/browse.ts` with non-TTY detection (`process.stdin.isTTY && process.stdout.isTTY`) — display error and exit if not interactive
- [ ] T012 [US3] Implement server selection level in `src/cli/browse.ts` — fetch servers from `ServerManager`, display via `@inquirer/prompts` `select()`, handle empty state ("no servers configured")
- [ ] T013 [US3] Implement credential resolution in `src/cli/browse.ts` — check keychain via `CredentialsManager.listCredentials()` for selected server; if found, use automatically; if not, prompt for database, username, password via `@inquirer/prompts`
- [ ] T014 [US3] Implement database selection level in `src/cli/browse.ts` — fetch database list from server via `ODataClient` at `/fmi/odata/v4`, display via `select()` with "Back" option
- [ ] T015 [US3] Implement table selection level in `src/cli/browse.ts` — fetch table list from `ODataClient` service document at `/fmi/odata/v4/{database}`, display via `select()` with "Back" option
- [ ] T016 [US3] Implement action menu in `src/cli/browse.ts` — present actions (list records, get by ID, create record, view schema) via `select()`, execute selected action using existing CLI commands (`ListCommand`, `GetCommand`, `CreateCommand`, `SchemaCommand`) or `ODataClient` directly
- [ ] T017 [US3] Implement post-action navigation in `src/cli/browse.ts` — after action completes, offer "Back to tables", "Back to databases", "Exit" via `select()`
- [ ] T018 [US3] Implement browse loop state machine in `src/cli/browse.ts` — `while(true)` loop with `BrowseLevel` state variable, "Back" navigation decrements level, Ctrl+C exits cleanly
- [ ] T019 [US3] Implement error handling in `src/cli/browse.ts` — connection errors offer retry/go-back, auth errors offer re-enter credentials/go-back, empty database/table lists display messages
- [ ] T020 [US3] Register `browse` command in `src/index.ts` by importing and attaching `BrowseCommand`

**Checkpoint**: `fmo browse` fully navigable with back navigation, credential auto-resolution, and all four table actions

---

## Phase 6: User Story 4 — Quick Entry with Flags (Priority: P3)

**Goal**: Experienced users can pass `--server` and `--database` flags to skip navigation levels

**Independent Test**: Run `fmo browse --server dev` to skip server selection, and `fmo browse --server dev --database contacts` to skip to table selection

### Implementation for User Story 4

- [ ] T021 [US4] Add `--server` and `--database` option flags to browse command definition in `src/cli/browse.ts`
- [ ] T022 [US4] Implement flag-based level skipping in `src/cli/browse.ts` — if `--server` provided, validate server exists and skip to database level; if `--database` also provided, resolve credentials and skip to table level; display errors for invalid IDs

**Checkpoint**: `fmo browse --server dev --database contacts` jumps directly to table selection

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [ ] T023 Run `npm test && npm run lint` and fix any failures
- [ ] T024 Run quickstart.md validation — manually verify all commands in `specs/008-browse-credentials/quickstart.md` work as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — credential commands need `listCredentials` and `deleteCredential`
- **US2 (Phase 4)**: Depends on Phase 1 only — can run in parallel with Phase 2/3
- **US3 (Phase 5)**: Depends on Phase 2 and Phase 3 — browse needs credential resolution and credential commands as a fallback
- **US4 (Phase 6)**: Depends on Phase 5 — extends browse with flag support
- **Polish (Phase 7)**: Depends on all phases complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) — no dependency on other stories
- **US2 (P1)**: Can start after Setup (Phase 1) — independent of all other stories
- **US3 (P2)**: Depends on Phase 2 (credential listing for auto-resolution)
- **US4 (P3)**: Depends on US3 (extends browse command)

### Within Each User Story

- Models/types before services
- Services before CLI commands
- Core implementation before integration/registration
- Story complete before moving to next priority

### Parallel Opportunities

- T001 and T002 can run in parallel (Phase 1)
- T003 and T004 can run in parallel (Phase 2)
- US2 (T010) can run in parallel with Phase 2 and US1
- T011, T012, T013 can be started in parallel within US3 (different concerns in same file — but sequential is safer since same file)
- T021 and T022 are sequential (same file)

---

## Parallel Example: Phase 1 + Phase 2

```bash
# Phase 1 — both in parallel:
Task T001: "Install @inquirer/prompts dependency"
Task T002: "Add new types to src/types/index.ts"

# Phase 2 — both in parallel:
Task T003: "Add listCredentials method to src/config/credentials.ts"
Task T004: "Add deleteCredential method to src/config/credentials.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (credential management)
4. Complete Phase 4: User Story 2 (server add warning)
5. **STOP and VALIDATE**: Test credential add/list/remove and server add warning independently
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 → Test credential management independently → MVP!
3. Add US2 → Test server add warning → Low-effort fix shipped
4. Add US3 → Test interactive browse → Core discovery feature
5. Add US4 → Test flag-based shortcuts → Power user enhancement
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
