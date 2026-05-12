---
name: fmo-cli
description: >
  How to use the fmo CLI tool to query and manipulate FileMaker databases via
  the OData API. Use this skill whenever the user wants to: read or write data
  in FileMaker, list servers/databases/tables, filter or paginate records, run
  scripts, build live artifacts that pull FileMaker data, set up credentials, or
  debug fmo errors. Trigger even when the user just mentions "FileMaker", "OData",
  "fmo", or any ERP data that might live in FileMaker.
---

# fmo — FileMaker OData CLI

`fmo` is a CLI tool for the Claris FileMaker OData v4 API.
MCP tool: `mcp__fmo__fmo_run` (single `command` argument).

## Command reference

```bash
# Explore
fmo health                                              # check server connectivity
fmo overview -s <id> -d <db>                           # dashboard: servers, dbs, table counts
fmo list servers
fmo list databases -s <id>
fmo list tables -s <id> -d <db>
fmo schema <Table> -s <id> -d <db>                     # field names + types
fmo browse                                             # interactive TUI

# Query
fmo get <Table> -s <id> -d <db> [options]

# Write
fmo create <Table> -s <id> -d <db> --data '<json>'
fmo update <Table> <recordId> -s <id> -d <db> --data '<json>'   # PATCH (partial)
fmo update <Table> <recordId> -s <id> -d <db> --data '<json>' --replace  # PUT (full replace)
fmo delete <Table> <recordId> -s <id> -d <db>

# Scripts & uploads
fmo script <name> -s <id> -d <db> [--table <t>] [--id <n>] [--params '<json>']
fmo upload <Table> <recordId> <field> <file> -s <id> -d <db>

# Batch
fmo batch -s <id> -d <db> --file <path>               # JSON DSL file of OData requests

# Server management
fmo server add --name <name> --host <host>             # register a server
fmo server credentials add --server-id <id> --database <db> --username <u> --password <p>
fmo server credentials list --server-id <id>
fmo server credentials remove --server-id <id> --database <db>

# Context bootstrap
fmo init                                               # write ~/.fmo/context.json
fmo init --refresh                                     # update existing context
```

**Short flags:** `-s` server id · `-d` database · `-f` format · `-t` top/limit ·
`--skip` offset · `--filter` · `--select` · `--orderby` · `--expand`

> **`server credentials add` uses `--server-id`, not `-s`** — that flag belongs
> to the top-level command, not this subcommand.

---

## MCP quoting rules (critical)

When calling `fmo_run`, any argument value that contains spaces **must** be
wrapped in single or double quotes. This includes filter expressions, JSON data,
and date ranges. The MCP tool uses POSIX shell tokenization — unquoted spaces
split the value into multiple arguments and silently break the command.

```
# ✓ CORRECT
get TidRad --filter "AnvID eq 126 and Datum ge '2026-04-01'" -s my-server -d MyDB
create Contacts --data '{"Name":"Jane Doe","Status":"Active"}' -s my-server -d MyDB

# ✗ WRONG — filter value will be split on spaces
get TidRad --filter AnvID eq 126 and Datum ge 2026-04-01 -s my-server -d MyDB
```

---

## Format: always use `-f jsonl`

**Never use `-f json`** when calling from artifacts or parsing output.
JSONL outputs one object per line — partial reads still parse. JSON wraps
everything in a single array that fails entirely if truncated.

---

## Filter syntax

Wrap the entire expression in double quotes; string/date values use single
quotes inside:

```bash
--filter "CreatedDate ge '2025-01-01' and CreatedDate le '2025-12-31'"
--filter "Status eq 'Active' and CategoryCode eq 'SALES'"
--filter "NumericId gt 0"
```

Swedish characters in filter *values* are fine. The issue is only with field
names in `--select` (see below).

---

## `--select` limitation: ASCII field names only

`--select` passes field names directly into the OData URL. Names with Swedish
characters (å, ä, ö) or spaces cause a URL syntax error:

```bash
# ✗ FAILS
--select "Användare,Datum,Belopp"
--select "Antal dagar,Datum,Status"

# ✓ WORKS
--select "RecordId,CreatedDate,Status,Category"
```

When a needed field has non-ASCII name, omit `--select` and fetch full records.
Use `-t` / `--skip` pagination to keep batch sizes manageable.
Run `fmo schema <Table>` to check field names first.

---

## Known FileMaker OData quirks

- **Global / calculated / summary fields** (`g`, `c`, `cg`, `s` prefixes) are
  read-only and often return `null` via OData. Don't filter on them.
- **Summary fields** (`s` prefix) reflect aggregate values for the *current
  found set*, not individual records — every row shows the same value by design.
- **Tables with non-ASCII names** (e.g. `Månadsrapport`) cannot be queried —
  same URL encoding issue as `--select`.
- **OData date filters** require ISO date without time: `'2025-07-01'` not
  `'2025-07-01T00:00:00'`.
- **Database name casing matters.** Use `fmo list databases` to confirm exact casing.
- **Avoid `--count`** — changes output format to a JSON wrapper prone to
  truncation. Use pagination instead.

---

## Error messages

When a command fails, the MCP returns:

```
Command failed: node /path/to/index.js get MyTable --filter ...
{"code":"SOME_ERROR","message":"Human-readable message","type":"error"}
```

The first line is cosmetic — Node.js joins the args array with spaces for
display, so the filter *looks* split even when it was passed correctly as a
single argument. The JSON body on the next line is the real error.

| Error | Cause | Fix |
|---|---|---|
| `syntax error in URL at: '<partial>'` | Swedish char or space in `--select` field | Remove `--select` or use ASCII field names only |
| `No credentials stored` | No creds for this server+database | `fmo server credentials add --server-id <id> --database <db> ...` |
| `Server not found: <id>` | Unknown server ID | `fmo list servers` to check IDs |
| `timeout of 30000ms exceeded` | Server unreachable or wrong database name | `fmo health`; verify casing with `fmo list databases` |
| Response truncated | Batch too large | Reduce `-t`; use `--select` with ASCII fields |
| Empty result when data exists | Filter on calculated/global field | Use `fmo schema` to identify safe filter fields |

---

## Live artifacts

See [references/artifact-helper.md](references/artifact-helper.md) for:
- The `fmoJSONL()` helper function (matches the MCP response shape)
- Parallel pagination pattern with deduplication
