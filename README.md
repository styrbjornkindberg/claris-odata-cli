# Claris OData CLI

Claris OData CLI is a command-line tool for working with the Claris FileMaker OData API.

It is designed for two audiences:

- humans who want a practical CLI for exploring servers, databases, tables, and records
- automation tools and coding agents that need predictable commands and structured output

The main executable is `fmo`. An alias, `fmodata`, is also installed.

## What It Can Do

- manage FileMaker server definitions locally
- store credentials in the system keychain
- list servers, databases, and tables
- query records with common OData options
- create, update, and delete records
- inspect table schema from OData metadata
- run connectivity checks against configured servers
- interactively browse servers, databases, tables, and actions in a TTY
- generate a local context file for humans and AI tooling with `fmo init`

## Installation

### From Source

```bash
git clone https://github.com/styrbjornkindberg/claris-odata-cli.git
cd claris-odata-cli
npm install
npm run build
npm link
```

After that, the `fmo` command should be available in your shell.

### Local Development Workflow

```bash
npm install
npm run build
npm test
```

## Requirements

- Node.js 18+
- access to a Claris FileMaker server with OData enabled
- valid FileMaker credentials for the target database
- macOS, Linux, or Windows environment with a supported system keychain for credential storage

## Quick Start

### 1. Add a Server

```bash
fmo server add --name prod --host fms.example.com
```

To use HTTP instead of HTTPS:

```bash
fmo server add --name dev --host localhost --port 8080 --insecure
```

### 2. Store Credentials

```bash
fmo server credentials add \
  --server-id prod-abc123 \
  --database Sales \
  --username admin
```

If `--password` is omitted, the CLI prompts securely.

### 3. List Databases

```bash
fmo list databases --server prod-abc123 --format json
```

### 4. List Tables

```bash
fmo list tables --server prod-abc123 --database Sales --format json
```

### 5. Query Records

```bash
fmo get Customers \
  --server prod-abc123 \
  --database Sales \
  --top 10 \
  --orderby Name \
  --format json
```

## Common Workflows

### Explore a Server Interactively

```bash
fmo browse
```

You can also skip levels:

```bash
fmo browse --server prod-abc123 --database Sales
```

### Create a Record

```bash
fmo create Customers \
  --server prod-abc123 \
  --database Sales \
  --data '{"Name":"Acme Corp","City":"Stockholm"}'
```

### Update a Record

```bash
fmo update Customers 42 \
  --server prod-abc123 \
  --database Sales \
  --data '{"City":"Gothenburg"}'
```

### Delete a Record

```bash
fmo delete Customers 42 \
  --server prod-abc123 \
  --database Sales
```

### Inspect Schema

```bash
fmo schema Customers \
  --server prod-abc123 \
  --database Sales \
  --format json
```

### Build Local Context for AI Workflows

```bash
fmo init
```

This writes `~/.fmo/context.json` with discovered servers, databases, and tables.

## Output Formats

Global output format is controlled with `--format`.

Supported formats:

- `table`
- `json`
- `jsonl`
- `csv`

Example:

```bash
fmo get Customers --server prod-abc123 --database Sales --format json
```

## Configuration and Storage

### Server and Profile Storage

The CLI stores local configuration in:

- `~/.config/claris-odata-cli/servers.json`
- `~/.config/claris-odata-cli/profiles.json`

### Credentials

Passwords are not stored in these JSON files.

Credentials are stored in the operating system keychain through `keytar`.

## Human-Friendly Notes

- use `fmo browse` when you are exploring manually
- use `--format json` for scripts and agents
- use `fmo init` when you want to give an LLM a compact snapshot of your environment
- prefer storing credentials once instead of passing passwords around in shell history

## Command Overview

- `fmo init`
- `fmo list <servers|databases|tables>`
- `fmo get <table>`
- `fmo create <table>`
- `fmo update <table> <recordId>`
- `fmo delete <table> <recordId>`
- `fmo schema [table]`
- `fmo health`
- `fmo browse`
- `fmo server add|list|remove`
- `fmo server credentials add|list|remove`

Detailed command documentation lives in [docs/commands.md](docs/commands.md).

More worked examples live in [docs/examples.md](docs/examples.md).

## Testing

```bash
npm test
npm run test:browse
npm run lint
npm run build
```

Notes:

- `npm test` runs the stable suite
- `npm run test:browse:all` includes the heavier browse action-menu test file

## Current Limitations

- the heavy browse action-menu test is not part of the default stable test path yet
- machine-readable output is improving, but some commands are still more human-oriented than ideal
- interactive browsing requires a TTY and is not suitable for CI or piped execution

## Documentation Map

- [docs/commands.md](docs/commands.md): command-by-command reference
- [docs/examples.md](docs/examples.md): practical usage examples
- [docs/INTEGRATION_TESTING.md](docs/INTEGRATION_TESTING.md): existing testing notes
- [docs/security-checklist.md](docs/security-checklist.md): security work items
