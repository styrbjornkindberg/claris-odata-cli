# SPEC-009: Machine-Readable Output Mode

## Overview

Add `--format json` / `--format jsonl` output mode to all data-returning commands in `fmo`. This enables AI agents to parse CLI output programmatically, chain commands, and make decisions based on structured data.

## Problem Statement

Currently `fmo` outputs human-readable formatted tables, colored status indicators, and prose summaries. AI agents that invoke `fmo` via `exec` cannot reliably parse this output to determine next steps. Every non-trivial agent workflow using `fmo` requires custom output parsing that breaks on minor formatting changes.

## Goals

- All data-returning commands gain `--format` flag with values: `table` (default), `json`, `jsonl`
- Structured errors returned in JSON format with machine-readable error codes
- Each output mode is self-contained and consistent across all commands
- Agents can use `fmo` as a reliable tool without output parsing fragility

## Non-Goals

- Does NOT add YAML, CSV, or other formats (keep scope tight)
- Does NOT change the default human-readable output (backwards compatible)
- Does NOT add streaming JSON output for long-running commands (future work)
- Does NOT add `--quiet` / `--silent` flags (separate concern)

## Technical Design

### Output Format Specification

#### `--format table` (default)
Current behavior: ANSI-colored tables, human-readable summaries.

#### `--format json`
Full JSON output. Each command returns a single JSON object.

**Command output shapes:**
```
fmo browse --format json
→ { "type": "schema", "server": "...", "database": "...", "tables": [...] }

fmo query "SELECT * FROM Customers" --format json
→ { "type": "result", "columns": [...], "rows": [...], "count": N }

fmo list servers --format json
→ { "type": "servers", "servers": [...] }

fmo list databases --format json
→ { "type": "databases", "database": "...", "databases": [...] }
```

#### `--format jsonl`
Streaming JSON Lines. Each row emitted as a separate JSON line.

```
fmo query "SELECT * FROM Customers" --format jsonl
→ {"id":1,"name":"Acme"}
{"id":2,"name":"Beta"}
...
```

Useful for piping to `jq`, file redirection, large result sets.

### Error Format (JSON)

When `--format json` or `--format jsonl` is set, errors return structured JSON:

```json
{
  "type": "error",
  "code": "ODATA_CONNECTION_FAILED",
  "message": "Failed to connect to server",
  "details": {
    "server": "https://fm.example.com",
    "statusCode": 401
  }
}
```

Error codes:
- `ODATA_CONNECTION_FAILED` — Cannot reach server
- `ODATA_AUTH_FAILED` — Authentication rejected
- `ODATA_QUERY_FAILED` — Query execution error
- `ODATA_TABLE_NOT_FOUND` — Referenced table doesn't exist
- `ODATA_IMPORT_FAILED` — Import operation failed
- `ODATA_VALIDATION_ERROR` — Input validation failed

### Implementation Approach

**Shared output formatter:**
- `src/output/formatter.ts` — `OutputFormatter` class with `formatJson()`, `formatJsonl()`, `formatTable()`
- All commands import from shared formatter, delegate output formatting to it
- JSON serialization uses `JSON.stringify` with consistent key ordering

**Flag handling:**
- Global `--format` flag added to CLI root in `src/index.ts`
- Propagates through command context
- Default remains `table` when flag absent

**Affected commands:**
- `browse` — schema output
- `query` — result sets
- `list servers` — server list
- `list databases` — database list  
- `list tables` — table list
- `import` — import results
- `seed` — seed results
- `health` — health status (CLA-1852, when built)
- `overview` — dashboard data (CLA-1855, when built)

## Acceptance Criteria

- [ ] `--format json` on `fmo list servers` returns valid JSON object
- [ ] `--format jsonl` on `fmo query` returns one JSON object per line
- [ ] Errors return `{"type":"error","code":"...",...}` in JSON mode
- [ ] Default `--format table` behavior unchanged
- [ ] `fmo browse --format json` includes all schema metadata
- [ ] All existing tests pass with new flag added
- [ ] `fmo --help` documents `--format` flag
- [ ] Format flag works when output is redirected to file

## Risks

- **Risk:** Breaking existing downstream scripts that parse table output  
  **Mitigation:** Flag is opt-in, default is unchanged
- **Risk:** JSON output formatting code duplicated across commands  
  **Mitigation:** Central formatter class, DRY principle applied

## Tasks

1. Create `src/output/formatter.ts` — `OutputFormatter` class
2. Add `--format` flag to CLI root, propagate through context
3. Refactor `browse` command to use formatter
4. Refactor `query` command to use formatter (supports jsonl for rows)
5. Refactor `list servers` to use formatter
6. Refactor `list databases` to use formatter
7. Refactor `list tables` to use formatter
8. Add structured error formatter with error codes
9. Add tests for all format modes
10. Update `health` command (CLA-1852) to use formatter
11. Update `overview` command (CLA-1855) to use formatter
