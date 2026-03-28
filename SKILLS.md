# Claris OData CLI (fmo) — Agent Skills

**Version:** tracks `package.json` version
**Binaries:** `fmo`, `fmodata`
**Docs:** FileMaker OData 4.0 API

---

## Core Concepts

| Term | Description |
|------|-------------|
| Server | A FileMaker Server instance (stored in local config via `fmo server add`) |
| Database | A FileMaker database/file on a server (e.g. `ProjectTracker.fmp12`) |
| Table | A FileMaker layout exposed via OData |
| Record | A row in a FileMaker table |
| Script | A FileMaker script executable via OData |

**Auth:** Credentials stored in macOS Keychain via `fmo server credentials add`.

---

## Commands

### Server Management
```bash
fmo server add --name "Prod" --host fms.example.com --database MyDB --username admin --password secret
fmo server list
fmo server remove --id <server-id>
```

### Credential Management *(v0.8, in progress)*
```bash
fmo server credentials add -s <server-id> -d <database> -u <username>   # prompts for password
fmo server credentials list -s <server-id>
fmo server credentials remove -s <server-id> -d <database> -u <username>
```

### Discovery
```bash
fmo list servers
fmo list databases -s <server-id>
fmo list tables -s <server-id> -d <database>
fmo introspect -s <server-id> -d <database>          # Full schema
fmo introspect -s <server-id> -d <database> -t <table>  # Single table schema
```

### Records
```bash
fmo get <table> -s <server-id> -d <database>
fmo get <table> -s <server-id> -d <database> --filter "Name eq 'John'"
fmo get <table> -s <server-id> -d <database> --limit 50 --format json
fmo create <table> -s <server-id> -d <database> --data '{"Name":"John"}'
fmo update <table> <record-id> -s <server-id> -d <database> --data '{"Name":"Jane"}'
fmo delete <table> <record-id> -s <server-id> -d <database>
```

### Schema
```bash
fmo schema <table> -s <server-id> -d <database>      # Show table schema
fmo schema export -s <server-id> -d <database>        # Export full schema as JSON
```

### Scripts
```bash
fmo script <script-name> -s <server-id> -d <database>
fmo script <script-name> -s <server-id> -d <database> --param "value"
```

### Import/Export
```bash
fmo get <table> -s <id> -d <db> --format csv --output records.csv
fmo import <table> -s <id> -d <db> --file data.csv
fmo import <table> -s <id> -d <db> --file data.csv --preview   # dry run
```

### Bulk Operations
```bash
fmo bulk <table> -s <id> -d <db> --operations '[{"method":"POST","data":{...}}]'
```

### Watch (live)
```bash
fmo watch <table> -s <id> -d <db>    # Poll for changes
```

### Interactive Browse *(v0.8, in progress)*
```bash
fmo browse                            # Full navigation: server → database → table → action
fmo browse -s <server-id>            # Skip server selection
fmo browse -s <server-id> -d <db>   # Skip to table selection
```

---

## Common Patterns

### Explore a new server
```bash
fmo server add --name "Prod" --host fms.example.com
fmo server credentials add -s prod-xxxx -d MyDB -u admin
fmo list databases -s prod-xxxx
fmo introspect -s prod-xxxx -d MyDB
```

### Query with filter
```bash
fmo get Contacts -s prod-xxxx -d CRM --filter "LastName eq 'Smith'" --format json
```

### Export and re-import
```bash
fmo get TimeEntries -s prod-xxxx -d Time --format csv --output entries.csv
# Edit CSV...
fmo import TimeEntries -s prod-xxxx -d Time --file entries.csv --preview
fmo import TimeEntries -s prod-xxxx -d Time --file entries.csv
```

### Run a script
```bash
fmo script "GenerateReport" -s prod-xxxx -d Reports
```

---

## Output Flags
- `--format json|table|csv` — output format (default: table)
- `--json` / `-j` — shorthand for JSON
- `--quiet` / `-q` — suppress non-essential output
- `--verbose` / `-v` — verbose logging

---

## OData Filter Syntax (FileMaker)
```
Name eq 'John'
Age gt 30
Status eq 'Active' and Department eq 'Sales'
contains(Name, 'Smith')
startswith(Email, 'john')
```

---

## Known Limitations
- Cannot create or delete databases (FileMaker OData restriction)
- Script execution requires script to be exposed via OData in FileMaker

---

## Evolution
Update this file when new commands ship. Current specs in `specs/` directory.
Active spec: `008-browse-credentials` (credential management + browse mode).
