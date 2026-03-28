# Specification: Interactive Navigation & Credential Management (v0.7)

**Feature ID**: 007-interactive-navigation
**Created**: 2026-03-28
**Priority**: P1 (High)
**Depends on**: v0.6 (Import Pipeline)

---

## Problem Statement

The CLI has two critical friction points:

1. **Credential management is broken after server add** — credentials can only be set at `server add` time. No way to add, update, or remove them later. Silent skip when `--password` is given without `--username`/`--database`.

2. **No discovery mode** — users must know the exact server ID, database name, and table name before running any command. High cognitive load for daily use.

**User Persona:** Developer or consultant using FileMaker daily who wants to interact with data without memorizing command syntax.

---

## User Stories

### US1: Manage credentials for existing servers
**As a** user who already has servers configured
**I want** to add, update, or remove credentials at any time
**So that** I don't have to re-add an entire server just to fix auth

**Acceptance Criteria:**
- [ ] `fmo server credentials add -s <id> -d <db> -u <user>` prompts for password (hidden)
- [ ] `fmo server credentials add -s <id> -d <db> -u <user> -p <pass>` stores directly
- [ ] `fmo server credentials list -s <id>` shows stored db/user combos (no passwords shown)
- [ ] `fmo server credentials remove -s <id> -d <db> -u <user>` deletes from Keychain
- [ ] `fmo server add --password X` without `--username` prints a clear warning

### US2: Browse and navigate interactively
**As a** user who doesn't remember exact command syntax
**I want** to navigate server → database → table → action in a menu
**So that** I can discover and interact with data without reading docs

**Acceptance Criteria:**
- [ ] `fmo browse` launches interactive menu
- [ ] Level 1: select from configured servers
- [ ] Level 2: select database (fetched from server)
- [ ] Level 3: select table (fetched from database schema)
- [ ] Level 4: select action (list, get by ID, create, schema, run script, watch)
- [ ] Level 5: action-specific prompts (filter, limit, field input)
- [ ] Uses stored Keychain credentials silently; falls back to prompt if not set
- [ ] Back navigation at each level
- [ ] After action: offer "Back to tables / Back to databases / Exit"

### US3: Quick entry for known targets
**As a** user who knows their server/database but wants the table picker
**I want** to skip navigation levels via flags
**So that** browse is fast even for experienced users

**Acceptance Criteria:**
- [ ] `fmo browse -s <id>` skips server selection
- [ ] `fmo browse -s <id> -d <db>` skips to table selection

---

## Technical Design

### New: `fmo server credentials` subcommand
- New file: `src/cli/credentials.ts`
- Uses existing `CredentialsManager` from `src/config/credentials.ts`
- Keychain key format (keep consistent): `{serverId}:{database}:{username}`

### Fix: warning in `server add`
- In `src/cli/server.ts`: warn if `--password` given without `--username`/`--database`

### New: `fmo browse` command
- New file: `src/cli/browse.ts`
- Use `@clack/prompts` (check deps first, add if missing)
- Reuse existing API client — no duplicate logic

## Non-Goals
- GUI / Electron / web interface
- Breaking any existing commands (additive only)
