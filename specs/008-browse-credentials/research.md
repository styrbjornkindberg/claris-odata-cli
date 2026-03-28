# Research: Interactive Navigation and Credential Management

**Feature Branch**: `008-browse-credentials`
**Date**: 2026-03-28

## R1: Listing All Keychain Credentials for a Server

**Decision**: Use `keytar.findCredentials(service)` to retrieve all stored credentials for the service, then filter by server ID prefix.

**Rationale**: keytar's `findCredentials` returns all `{ account, password }` pairs for a given service name. Since the account key format is `{serverId}:{database}:{username}`, we can parse the account string to extract server ID, database, and username. This avoids maintaining a separate credential index.

**Alternatives considered**:
- Maintaining a separate credential registry in conf store — rejected because it duplicates state and can drift out of sync with the keychain.
- Iterating known databases — rejected because it requires knowing database names upfront, which defeats the purpose of listing.

## R2: Interactive TUI Library for Node.js CLI

**Decision**: Use `@inquirer/prompts` (Inquirer.js v5+) for interactive selection menus.

**Rationale**: Inquirer is the de facto standard for Node.js CLI prompts. The `@inquirer/prompts` package (ES module, tree-shakeable) provides `select`, `input`, and `password` prompts. It supports Ctrl+C handling natively and works with the existing commander.js setup. It has excellent TTY detection.

**Alternatives considered**:
- `prompts` — lighter but less maintained, weaker TypeScript support.
- `ink` (React-based TUI) — too heavy for simple menu navigation; would introduce React dependency.
- `blessed`/`blessed-contrib` — powerful but complex, designed for dashboard UIs not simple menus.
- Custom readline implementation — unnecessary reinvention.

## R3: Non-TTY Detection

**Decision**: Check `process.stdin.isTTY` and `process.stdout.isTTY` before launching interactive mode. If either is false, display an error message and exit.

**Rationale**: Standard Node.js approach. Inquirer also handles this internally but an early check provides a better error message.

**Alternatives considered**:
- Using `is-interactive` package — unnecessary dependency for a one-line check.

## R4: Fetching Database and Table Lists via OData

**Decision**: Use the existing `ODataClient` with the FileMaker OData service document endpoint.

**Rationale**: The FileMaker OData API at `/fmi/odata/v4` (no database) returns available databases. The service document at `/fmi/odata/v4/{database}` returns available entity sets (tables). The `$metadata` endpoint provides schema details. The existing `EndpointBuilder` and `ODataClient` classes already support these patterns.

**Alternatives considered**:
- FileMaker Data API — not in scope; this CLI is specifically for OData.

## R5: Password Hidden Input for Credential Add

**Decision**: Use `@inquirer/prompts`'s `password` prompt for hidden input when `--password` flag is not provided.

**Rationale**: Consistent with the TUI library choice. The `password` prompt type masks input by default. This is preferred over raw `readline` with `{ terminal: true }` and manual character masking.

**Alternatives considered**:
- `readline` with output masking — more code, fragile across platforms.

## R6: Back Navigation Pattern in Interactive Browse

**Decision**: Implement browse as a loop-based state machine with navigation levels (server → database → table → action). Each level presents a menu with a "Back" option that returns to the previous level. A `while(true)` loop with a `level` variable controls which menu is shown.

**Rationale**: Simple, readable, and easy to maintain. The navigation depth is fixed (4 levels), so a recursive approach would add unnecessary complexity. The loop pattern naturally supports "restart from any level" post-action navigation.

**Alternatives considered**:
- Recursive function calls per level — harder to implement "back to databases" from action results.
- Event-driven state machine — overengineered for 4 fixed levels.
