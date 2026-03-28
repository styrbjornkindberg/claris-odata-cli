---
name: claris-odata-cli
description: Use when working with FileMaker databases via the `fmo` or `fmodata` CLI. Triggers on any request to query, create, update, or delete FileMaker records, inspect schemas, run scripts, import/export data, manage server connections, or interact with FileMaker OData API in any way.
---

# Claris OData CLI Skill

The `fmo` CLI connects to FileMaker Server via OData 4.0 and lets you query records, inspect schemas, run scripts, and import/export data from the terminal.

## Setup

```bash
# Add a server
fmo server add --name "Prod" --host fms.example.com

# Store credentials in macOS Keychain
fmo server credentials add -s <server-id> -d <database> -u <username>
# (prompts for password securely)
```

## Core Commands

### Server & Credentials
```bash
fmo server add --name "Prod" --host fms.example.com [--database DB --username U --password P]
fmo server list
fmo server remove --id <server-id>

fmo server credentials add -s <id> -d <database> -u <username>     # prompts for password
fmo server credentials list -s <id>
fmo server credentials remove -s <id> -d <database> -u <username>
```

### Discovery
```bash
fmo list servers
fmo list databases -s <server-id>
fmo list tables -s <server-id> -d <database>
fmo introspect -s <server-id> -d <database>                         # Full schema
fmo introspect -s <server-id> -d <database> -t <table>             # Single table
```

### Records
```bash
fmo get <table> -s <id> -d <db>
fmo get <table> -s <id> -d <db> --filter "Name eq 'John'" --limit 50
fmo create <table> -s <id> -d <db> --data '{"Name":"John"}'
fmo update <table> <record-id> -s <id> -d <db> --data '{"Name":"Jane"}'
fmo delete <table> <record-id> -s <id> -d <db>
```

### Schema
```bash
fmo schema <table> -s <id> -d <db>
fmo schema export -s <id> -d <db>                                   # Full schema as JSON
```

### Scripts
```bash
fmo script "ScriptName" -s <id> -d <db>
fmo script "ScriptName" -s <id> -d <db> --param "value"
```

### Import / Export
```bash
fmo get <table> -s <id> -d <db> --format csv --output records.csv
fmo import <table> -s <id> -d <db> --file data.csv --preview        # dry run
fmo import <table> -s <id> -d <db> --file data.csv
```

### Interactive Browse *(v0.8, in progress)*
```bash
fmo browse                           # server → database → table → action
fmo browse -s <server-id>           # skip server selection
fmo browse -s <id> -d <database>   # skip to table selection
```

### Watch
```bash
fmo watch <table> -s <id> -d <db>  # Poll table for changes
```

## OData Filter Syntax

```
Name eq 'John'
Age gt 30
Status eq 'Active' and Department eq 'Sales'
contains(Name, 'Smith')
startswith(Email, 'john')
```

## Output Flags

| Flag | Effect |
|------|--------|
| `--format json\|table\|csv` | Output format (default: table) |
| `--json` / `-j` | Shorthand for JSON |
| `--quiet` / `-q` | Suppress non-essential output |
| `--verbose` / `-v` | Verbose logging |

## Common Patterns

**Explore a new server:**
```bash
fmo server add --name "Prod" --host fms.example.com
fmo server credentials add -s prod-xxxx -d MyDB -u admin
fmo list databases -s prod-xxxx
fmo introspect -s prod-xxxx -d MyDB
```

**Query with filter and export:**
```bash
fmo get Contacts -s prod-xxxx -d CRM --filter "LastName eq 'Smith'" --format json
fmo get TimeEntries -s prod-xxxx -d Time --format csv --output entries.csv
```

## Known Limitations

- Cannot create or delete FileMaker databases (OData restriction)
- Scripts must be exposed via OData in FileMaker Server settings
