# Command Reference

This document describes the current CLI command surface.

The executable name is `fmo`.

## Global Options

Available on the root command:

- `--verbose`
- `--format <table|json|jsonl|csv>`
- `--server <id>`
- `--database <name>`

Example:

```bash
fmo --format json --verbose list servers
```

## init

Generate `~/.fmo/context.json` with discovered servers, databases, and tables.

```bash
fmo init
fmo init --refresh
fmo init --json
```

Use this when you want a compact summary for humans or AI tooling.

## list

List servers, databases, or tables.

### List Servers

```bash
fmo list servers
```

### List Databases

```bash
fmo list databases --server <server-id>
```

### List Tables

```bash
fmo list tables --server <server-id> --database <database>
```

Notes:

- `databases` requires a configured server and stored credentials
- `tables` requires a server, a database name, and valid stored credentials

## get

Fetch records from a table using common OData query options.

```bash
fmo get <table> --server <server-id> --database <database>
```

Useful options:

- `--filter <expr>`
- `--select <field1,field2>`
- `--top <n>`
- `--skip <n>`
- `--orderby <field>`
- `--count`

Example:

```bash
fmo get Customers \
  --server prod-abc123 \
  --database Sales \
  --filter "Country eq 'Sweden'" \
  --select Name,City \
  --top 25 \
  --orderby Name \
  --format json
```

## create

Create a record in a table.

```bash
fmo create <table> --server <server-id> --database <database> --data <json>
```

Example:

```bash
fmo create Customers \
  --server prod-abc123 \
  --database Sales \
  --data '{"Name":"Acme Corp","City":"Stockholm"}'
```

## update

Update a record by record ID.

```bash
fmo update <table> <recordId> --server <server-id> --database <database> --data <json>
```

Example:

```bash
fmo update Customers 42 \
  --server prod-abc123 \
  --database Sales \
  --data '{"City":"Malmo"}'
```

## delete

Delete a record by record ID.

```bash
fmo delete <table> <recordId> --server <server-id> --database <database>
```

Example:

```bash
fmo delete Customers 42 --server prod-abc123 --database Sales
```

## schema

Read schema information from OData metadata.

### List Tables from Metadata

```bash
fmo schema --server <server-id> --database <database> --format json
```

### Show One Table Schema

```bash
fmo schema <table> --server <server-id> --database <database> --format json
```

The command returns parsed field names and the raw schema fragment for the table.

## health

Check connectivity for all configured servers.

```bash
fmo health
fmo health --format json
```

Use this to quickly see:

- which servers are reachable
- whether credentials exist
- latency for successful checks

## browse

Interactive browsing mode for servers, databases, tables, and actions.

```bash
fmo browse
fmo browse --server <server-id>
fmo browse --server <server-id> --database <database>
```

Notes:

- requires an interactive terminal
- not intended for CI, scripts, or piped execution

## server

Manage server definitions.

### Add Server

```bash
fmo server add --name <name> --host <host>
```

Optional:

- `--port <port>`
- `--insecure` to use HTTP instead of HTTPS
- `--database <name>`, `--username <user>`, and `--password <pass>` if you want to store credentials during server creation

### List Servers

```bash
fmo server list
```

### Remove Server

```bash
fmo server remove --server-id <server-id>
```

## server credentials

Manage stored credentials for one server.

### Add Credentials

```bash
fmo server credentials add \
  --server-id <server-id> \
  --database <database> \
  --username <username>
```

Optional:

- `--password <password>`

If omitted, the CLI prompts securely.

### List Credentials

```bash
fmo server credentials list --server-id <server-id>
```

### Remove Credentials

```bash
fmo server credentials remove \
  --server-id <server-id> \
  --database <database> \
  --username <username>
```

## Output Guidance

Use these defaults depending on the task:

- `table`: good for a person in a terminal
- `json`: good for automation and LLM workflows
- `jsonl`: best when you want one record per line
- `csv`: useful for export-style output

## Error Handling Expectations

Common failure modes include:

- missing server ID
- missing database name
- no credentials stored for the requested server and database
- connection errors to the FileMaker server
- authentication errors from invalid credentials
- malformed JSON passed to `create` or `update`
