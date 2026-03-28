# Implementation Plan: Interactive Navigation and Credential Management

**Branch**: `008-browse-credentials` | **Date**: 2026-03-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-browse-credentials/spec.md`

## Summary

Add credential management subcommands (`fmo server credentials add/list/remove`) backed by the existing keytar-based `CredentialsManager`, enhance `fmo server add` warning for incomplete credential flags (already partially implemented), and build an interactive `fmo browse` command using `@inquirer/prompts` for hierarchical server → database → table → action navigation with automatic keychain credential resolution.

## Technical Context

**Language/Version**: TypeScript 5.x, targeting ES2022 (Node.js 18+)
**Primary Dependencies**: commander ^12, keytar ^7.9, axios ^1.6, conf ^12, `@inquirer/prompts` (new — for interactive TUI)
**Storage**: System keychain (via keytar) for credentials; conf-based local store for server configs
**Testing**: vitest ^1.0
**Target Platform**: macOS, Linux, Windows (anywhere Node.js + system keychain works)
**Project Type**: CLI tool
**Performance Goals**: Interactive menus render < 100ms; API calls bound by network latency
**Constraints**: Must work in standard terminal emulators; must detect non-TTY and refuse interactive mode
**Scale/Scope**: Single-user CLI tool; ~5-10 configured servers typical

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is unconfigured (template placeholders only). No gates to evaluate. Proceeding.

**Post-Phase 1 re-check**: No constitution violations. The design follows existing patterns (keytar for credentials, commander for CLI commands, vitest for testing).

## Project Structure

### Documentation (this feature)

```text
specs/008-browse-credentials/
├── plan.md              # This file
├── research.md          # Phase 0 output — technology decisions
├── data-model.md        # Phase 1 output — entity definitions
├── quickstart.md        # Phase 1 output — usage guide
├── contracts/
│   └── cli-commands.md  # Phase 1 output — CLI command contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── api/
│   ├── auth.ts          # Existing — AuthManager
│   ├── client.ts        # Existing — ODataClient (used by browse)
│   ├── endpoints.ts     # Existing — EndpointBuilder
│   └── errors.ts        # Existing — error codes
├── cli/
│   ├── index.ts         # Existing — BaseCommand
│   ├── server.ts        # Existing — ServerCommand (add credentials subcommand routing)
│   ├── credentials.ts   # NEW — CredentialsCommand (add/list/remove)
│   ├── browse.ts        # NEW — BrowseCommand (interactive navigation)
│   ├── create.ts        # Existing
│   ├── delete.ts        # Existing
│   ├── get.ts           # Existing
│   ├── list.ts          # Existing
│   ├── schema.ts        # Existing
│   └── update.ts        # Existing
├── config/
│   ├── credentials.ts   # Existing — CredentialsManager (add listCredentials method)
│   ├── profiles.ts      # Existing
│   └── servers.ts       # Existing — ServerManager
├── types/
│   └── index.ts         # Existing — add CredentialEntry, BrowseLevel, BrowseAction types
├── utils/
│   ├── logger.ts        # Existing
│   └── output.ts        # Existing
└── index.ts             # Existing

tests/
├── unit/
│   ├── cli/
│   │   ├── server.test.ts      # Existing
│   │   ├── credentials.test.ts # NEW — credentials subcommand tests
│   │   └── browse.test.ts      # NEW — browse command tests
│   ├── credentials.test.ts     # NEW — CredentialsManager.listCredentials tests
│   └── ...existing...
└── utils/
    └── test-helpers.ts         # Existing
```

**Structure Decision**: Single project layout (Option 1). The project already follows this structure with `src/` and `tests/` at root. New files are added to existing directories following established patterns.

## Key Design Decisions

### 1. Credential Listing via keytar.findCredentials

The `CredentialsManager` will gain a `listCredentials(serverId: string)` method that calls `keytar.findCredentials(SERVICE_NAME)`, parses the `{serverId}:{database}:{username}` account keys, and filters by the target server ID. This avoids maintaining a separate index.

### 2. Commander Subcommand Routing

`fmo server credentials` will be implemented as a commander subcommand group under the existing `server` command. The `credentials` subcommand will have its own `add`, `list`, and `remove` actions, implemented in a new `CredentialsCommand` class.

### 3. Browse as Loop-Based State Machine

The `fmo browse` command uses a `while(true)` loop with a `BrowseLevel` state variable. Each iteration renders the appropriate menu for the current level. Selecting "Back" decrements the level. This is simple, readable, and naturally supports post-action navigation.

### 4. New Dependency: @inquirer/prompts

The only new runtime dependency. Used for `select` (menu choices), `input` (text entry), and `password` (hidden input) prompts. Chosen for TypeScript support, active maintenance, and compatibility with commander.js.

## Complexity Tracking

> No constitution violations to justify.
