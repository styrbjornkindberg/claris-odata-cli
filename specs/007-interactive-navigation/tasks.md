# Tasks — Interactive Navigation & Credential Management (v0.7)

**Spec:** `specs/007-interactive-navigation/spec.md`
**Branch:** `007-interactive-navigation`

---

- [ ] T001 [P1] [US1] Fix silent skip — warn when `--password` given without `--username`/`--database` on `server add`
- [ ] T002 [P1] [US1] Add `fmo server credentials add` subcommand with hidden password prompt
- [ ] T003 [P1] [US1] Add `fmo server credentials list` and `remove` subcommands
- [ ] T004 [P2] [US2] Add `@clack/prompts` dependency and scaffold `fmo browse` with server selection (Level 1)
- [ ] T005 [P2] [US2] Add database and table navigation levels (Level 2 + 3) with back navigation
- [ ] T006 [P2] [US2] Add action menu and execution (Level 4 + 5) with post-action nav
- [ ] T007 [P2] [US3] Add `--server` and `--database` quick-entry flags to `fmo browse`
