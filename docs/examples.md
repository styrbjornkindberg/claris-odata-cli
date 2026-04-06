# Examples

This page collects realistic examples for day-to-day CLI usage.

## First-Time Setup

Add a server:

```bash
fmo server add --name production --host fms.example.com
```

List servers to get the generated ID:

```bash
fmo server list --format json
```

Add credentials:

```bash
fmo server credentials add \
  --server-id production-m123abc \
  --database Sales \
  --username admin
```

Build local context:

```bash
fmo init
```

## Discovery Workflow

List databases on a server:

```bash
fmo list databases --server production-m123abc --format json
```

List tables in one database:

```bash
fmo list tables --server production-m123abc --database Sales --format json
```

Inspect schema for one table:

```bash
fmo schema Customers --server production-m123abc --database Sales --format json
```

## Query Workflow

Fetch the first 10 customers:

```bash
fmo get Customers \
  --server production-m123abc \
  --database Sales \
  --top 10 \
  --format json
```

Filter and select fields:

```bash
fmo get Customers \
  --server production-m123abc \
  --database Sales \
  --filter "City eq 'Stockholm'" \
  --select Name,City,Country \
  --orderby Name \
  --format json
```

Stream records as JSONL:

```bash
fmo get Customers \
  --server production-m123abc \
  --database Sales \
  --top 100 \
  --format jsonl
```

## Write Workflow

Create a record:

```bash
fmo create Customers \
  --server production-m123abc \
  --database Sales \
  --data '{"Name":"Northwind","City":"Stockholm","Country":"Sweden"}' \
  --format json
```

Update a record:

```bash
fmo update Customers 42 \
  --server production-m123abc \
  --database Sales \
  --data '{"City":"Uppsala"}' \
  --format json
```

Delete a record:

```bash
fmo delete Customers 42 \
  --server production-m123abc \
  --database Sales \
  --format json
```

## Health and Diagnostics

Check all configured servers:

```bash
fmo health
```

Get structured health output:

```bash
fmo health --format json
```

## Interactive Workflow

Start at the top of the tree:

```bash
fmo browse
```

Skip directly to one server:

```bash
fmo browse --server production-m123abc
```

Skip to one database:

```bash
fmo browse --server production-m123abc --database Sales
```

## AI and Automation Examples

Create a local environment snapshot for an agent:

```bash
fmo init --json
```

Use JSON output for deterministic parsing:

```bash
fmo list tables --server production-m123abc --database Sales --format json
```

Use JSONL when processing many rows:

```bash
fmo get Customers --server production-m123abc --database Sales --top 500 --format jsonl
```

## Practical Notes

- prefer `--format json` for scripts, CI, and agent workflows
- prefer `browse` when you do not remember the exact database or table name
- use `init` to reduce discovery time when collaborating with coding agents
- avoid putting passwords directly in shell history unless you have to
