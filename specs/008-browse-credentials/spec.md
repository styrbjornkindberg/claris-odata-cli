# Feature Specification: Interactive Navigation and Credential Management

**Feature Branch**: `008-browse-credentials`
**Created**: 2026-03-28
**Status**: Draft
**Input**: User description: "Credential management: fmo server credentials add/list/remove commands. Warn when --password passed to server add without --username/--database. Interactive browse mode: fmo browse TUI menu - server -> database -> table -> action. Keychain credentials. Back navigation. --server/--database flags."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Credentials After Server Creation (Priority: P1)

A user has already added a server via `fmo server add` but did not provide credentials at that time, or needs to change them. They run `fmo server credentials add` specifying the server, database, and username, and are prompted for a password. The password is stored securely in the system keychain. Later, they can list which credential entries exist for a server and remove credentials they no longer need.

**Why this priority**: Without working credential management, neither the existing commands nor the new browse feature can authenticate to servers. This is the foundation that unblocks all authenticated operations.

**Independent Test**: Can be fully tested by adding a server, then running `fmo server credentials add/list/remove` and verifying keychain entries are created, listed, and deleted correctly.

**Acceptance Scenarios**:

1. **Given** a configured server "dev", **When** the user runs `fmo server credentials add --server-id dev --database contacts --username admin`, **Then** the system prompts for a password (hidden input) and stores it in the system keychain.
2. **Given** a configured server "dev", **When** the user runs `fmo server credentials add --server-id dev --database contacts --username admin --password secret`, **Then** the system stores the credentials directly without prompting.
3. **Given** a configured server "dev" with stored credentials, **When** the user runs `fmo server credentials list --server-id dev`, **Then** the system displays all stored database/username pairs for that server (passwords are never shown).
4. **Given** a configured server "dev" with stored credentials, **When** the user runs `fmo server credentials remove --server-id dev --database contacts --username admin`, **Then** the system removes that credential entry from the keychain and confirms deletion.
5. **Given** no stored credentials for server "dev", **When** the user runs `fmo server credentials list --server-id dev`, **Then** the system displays a message indicating no credentials are stored.
6. **Given** a non-existent server ID, **When** the user runs any `fmo server credentials` subcommand with that ID, **Then** the system displays an error that the server does not exist.

---

### User Story 2 - Warning on Incomplete Credentials at Server Add (Priority: P1)

A user runs `fmo server add` with `--password` but forgets to include `--username` or `--database`. The system warns them that the password cannot be stored without all three credential fields, so credentials are not silently lost.

**Why this priority**: This is a bug fix for existing behavior that silently discards passwords. It prevents user confusion and data loss, and is low-effort to implement.

**Independent Test**: Can be tested by running `fmo server add` with `--password` but missing `--username` or `--database` and verifying the warning message appears.

**Acceptance Scenarios**:

1. **Given** the user runs `fmo server add --name dev --host example.com --password secret` without `--username`, **When** the command executes, **Then** the server is added successfully but a clear warning is displayed: credentials were not stored because `--username` and `--database` are also required.
2. **Given** the user runs `fmo server add --name dev --host example.com --password secret --username admin` without `--database`, **When** the command executes, **Then** the server is added but a warning is displayed that `--database` is also required to store credentials.
3. **Given** the user runs `fmo server add` with all three credential flags (`--password`, `--username`, `--database`), **When** the command executes, **Then** the server is added and credentials are stored without any warning.

---

### User Story 3 - Browse Servers, Databases, and Tables Interactively (Priority: P2)

A user who does not remember exact server IDs, database names, or table names runs `fmo browse`. An interactive menu appears showing their configured servers. They select a server, then a database (fetched live from the server), then a table (fetched from the database schema). At the table level, they choose an action (list records, get by ID, create, view schema). The system uses stored keychain credentials automatically. The user can navigate back at each level.

**Why this priority**: This is the core discovery feature that makes the CLI usable without memorizing identifiers. It depends on credential management (P1) being functional for authenticated access.

**Independent Test**: Can be tested by configuring at least one server with credentials, running `fmo browse`, and navigating through all levels to perform an action on a table.

**Acceptance Scenarios**:

1. **Given** at least one configured server, **When** the user runs `fmo browse`, **Then** a menu displays all configured servers for selection.
2. **Given** the user selects a server, **When** the server has stored keychain credentials, **Then** the system authenticates automatically and presents a list of databases fetched from the server.
3. **Given** the user selects a server, **When** no keychain credentials exist, **Then** the system prompts for database name, username, and password before proceeding.
4. **Given** the user selects a database, **When** the database has tables, **Then** the system displays a list of tables fetched from the database schema.
5. **Given** the user selects a table, **When** the action menu appears, **Then** available actions include: list records, get record by ID, create record, and view schema.
6. **Given** the user is at any navigation level beyond server selection, **When** they choose "Back", **Then** the system returns to the previous level.
7. **Given** the user completes an action, **When** results are displayed, **Then** the system offers options: "Back to tables", "Back to databases", or "Exit".
8. **Given** no servers are configured, **When** the user runs `fmo browse`, **Then** the system displays a message that no servers are configured and suggests using `fmo server add`.

---

### User Story 4 - Quick Entry with Flags (Priority: P3)

An experienced user who knows their server and/or database wants to skip the early navigation levels. They pass `--server` and optionally `--database` flags to `fmo browse` to jump directly to the relevant level.

**Why this priority**: This is a convenience enhancement for power users. The core browse experience (P2) must work first.

**Independent Test**: Can be tested by running `fmo browse --server dev` and verifying it skips server selection, and `fmo browse --server dev --database contacts` to verify it skips to table selection.

**Acceptance Scenarios**:

1. **Given** a configured server "dev", **When** the user runs `fmo browse --server dev`, **Then** the system skips server selection and proceeds directly to database selection for "dev".
2. **Given** a configured server "dev" with credentials for database "contacts", **When** the user runs `fmo browse --server dev --database contacts`, **Then** the system skips to table selection for that database.
3. **Given** an invalid server ID passed via `--server`, **When** the command runs, **Then** the system displays an error that the server does not exist and exits.
4. **Given** a valid `--server` but invalid `--database`, **When** the system cannot connect or the database does not exist, **Then** the system displays an appropriate error message.

---

### Edge Cases

- What happens when the server is unreachable during browse? The system displays a connection error and offers to retry or go back to server selection.
- What happens when credentials in the keychain are expired or wrong? The system displays an authentication error and offers to re-enter credentials or go back.
- What happens when a server has no databases? The system displays a message that no databases were found.
- What happens when a database has no tables? The system displays a message that no tables were found and offers to go back.
- What happens when the user presses Ctrl+C during browse? The system exits cleanly without error output.
- What happens when the terminal does not support interactive input (piped/non-TTY)? The system detects non-interactive mode and displays an error suggesting to use direct commands instead.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide `fmo server credentials add` subcommand that accepts `--server-id`, `--database`, `--username`, and optionally `--password` flags.
- **FR-002**: System MUST prompt for password with hidden input when `--password` is not provided to `fmo server credentials add`.
- **FR-003**: System MUST provide `fmo server credentials list` subcommand that displays all stored credential entries (database and username) for a given server, without showing passwords.
- **FR-004**: System MUST provide `fmo server credentials remove` subcommand that deletes a specific credential entry from the system keychain.
- **FR-005**: System MUST validate that the referenced server exists before performing any credential operation.
- **FR-006**: System MUST display a clear warning when `fmo server add` receives `--password` without both `--username` and `--database`, explaining that credentials were not stored.
- **FR-007**: System MUST provide `fmo browse` command that presents an interactive menu for navigating server, database, table, and action levels.
- **FR-008**: System MUST fetch database lists and table lists live from the selected server during browse navigation.
- **FR-009**: System MUST use stored keychain credentials automatically during browse when available, and fall back to interactive prompting when not.
- **FR-010**: System MUST support back navigation at every level of the browse menu.
- **FR-011**: System MUST offer post-action navigation options (back to tables, back to databases, exit) after completing a browse action.
- **FR-012**: System MUST support `--server` and `--database` flags on `fmo browse` to skip navigation levels.
- **FR-013**: System MUST detect non-interactive terminals and display an error instead of launching the TUI.
- **FR-014**: System MUST handle Ctrl+C gracefully during interactive browse, exiting cleanly.

### Key Entities

- **Server**: A configured FileMaker OData server with host, port, and optional credentials. Identified by a unique server ID.
- **Credential Entry**: A stored set of authentication details (server ID, database name, username, password) persisted in the system keychain. The password is never displayed.
- **Database**: A FileMaker database hosted on a server, discovered live via the OData API.
- **Table**: A layout/table within a FileMaker database, discovered live via the database schema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can add, list, and remove credentials for any configured server without re-adding the server, completing each operation in under 10 seconds.
- **SC-002**: Users receive a clear warning when providing incomplete credential flags to `fmo server add`, with no credentials silently lost.
- **SC-003**: Users can navigate from server selection to performing an action on a table in under 30 seconds using the browse menu.
- **SC-004**: Users can return to any previous navigation level without restarting the browse session.
- **SC-005**: Experienced users can skip to table selection in under 5 seconds using `--server` and `--database` flags.
- **SC-006**: The browse feature automatically uses stored credentials without prompting when they are available in the keychain.

## Assumptions

- Users have at least one server configured via `fmo server add` before using credential management or browse features.
- The system keychain (macOS Keychain, Linux Secret Service, Windows Credential Vault) is accessible from the terminal environment.
- The existing `CredentialsManager` (keytar-based) and `ServerManager` classes will be reused and extended, not replaced.
- The OData API on FileMaker servers returns database and table listings when properly authenticated.
- Browse is a terminal-only feature; no web or GUI interface is in scope.
- The existing keychain key format (`{serverId}:{database}:{username}`) is maintained for backward compatibility with any credentials stored via `fmo server add`.
