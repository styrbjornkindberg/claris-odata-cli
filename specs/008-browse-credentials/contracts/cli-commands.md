# CLI Command Contracts: Interactive Navigation and Credential Management

**Feature Branch**: `008-browse-credentials`
**Date**: 2026-03-28

## New Commands

### `fmo server credentials add`

Add credentials for a configured server.

```
fmo server credentials add --server-id <id> --database <name> --username <user> [--password <pass>]
```

| Flag          | Required | Description                                     |
|---------------|----------|-------------------------------------------------|
| `--server-id` | Yes      | Server ID (must exist in config)                |
| `--database`  | Yes      | FileMaker database name                         |
| `--username`  | Yes      | Username for authentication                     |
| `--password`  | No       | Password (prompted with hidden input if omitted)|

**Success output** (exit 0):
```
Credentials stored for server "dev" (database: contacts, user: admin)
```

**JSON output** (`--output json`):
```json
{
  "serverId": "dev-abc123",
  "database": "contacts",
  "username": "admin",
  "message": "Credentials stored successfully"
}
```

**Error cases**:
- Server not found → exit 1, `Error: Server not found: <id>`
- Keychain access failure → exit 1, `Error: Failed to store credentials: <message>`

---

### `fmo server credentials list`

List stored credential entries for a server.

```
fmo server credentials list --server-id <id>
```

| Flag          | Required | Description                      |
|---------------|----------|----------------------------------|
| `--server-id` | Yes      | Server ID (must exist in config) |

**Success output** (exit 0):
```
Credentials for server "dev":

  Database: contacts
    Username: admin

  Database: inventory
    Username: readonly
```

**JSON output** (`--output json`):
```json
[
  { "database": "contacts", "username": "admin" },
  { "database": "inventory", "username": "readonly" }
]
```

**Empty result**: `No credentials stored for server "dev".`

**Error cases**:
- Server not found → exit 1, `Error: Server not found: <id>`

---

### `fmo server credentials remove`

Remove a credential entry from the keychain.

```
fmo server credentials remove --server-id <id> --database <name> --username <user>
```

| Flag          | Required | Description                      |
|---------------|----------|----------------------------------|
| `--server-id` | Yes      | Server ID                        |
| `--database`  | Yes      | Database name                    |
| `--username`  | Yes      | Username                         |

**Success output** (exit 0):
```
Credentials removed for server "dev" (database: contacts, user: admin)
```

**Error cases**:
- Server not found → exit 1
- Credentials not found → exit 1, `Error: No credentials found for the specified server, database, and username`

---

### `fmo browse`

Interactive navigation through servers, databases, tables, and actions.

```
fmo browse [--server <id>] [--database <name>]
```

| Flag         | Required | Description                                   |
|--------------|----------|-----------------------------------------------|
| `--server`   | No       | Skip to database selection for this server    |
| `--database` | No       | Skip to table selection (requires `--server`) |

**Behavior**:
- Launches interactive TUI menu
- Navigation levels: Server → Database → Table → Action
- Actions at table level: List records, Get record by ID, Create record, View schema
- "Back" option at each level
- Post-action options: Back to tables, Back to databases, Exit
- Auto-uses keychain credentials when available
- Prompts for credentials when not in keychain

**Non-interactive mode**: If stdin/stdout is not a TTY, exits with error:
```
Error: Interactive mode requires a terminal. Use direct commands instead (e.g., fmo list, fmo get).
```

## Modified Commands

### `fmo server add` (existing — enhanced warning)

Already implemented in current code. The warning for `--password` without `--username`/`--database` is already in place. No contract changes needed.
