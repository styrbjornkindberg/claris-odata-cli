# Quickstart: Interactive Navigation and Credential Management

**Feature Branch**: `008-browse-credentials`

## Prerequisites

- Node.js 18+
- A FileMaker Server with OData API enabled
- At least one server configured via `fmo server add`

## Managing Credentials

### Store credentials for a server

```bash
# With interactive password prompt (recommended)
fmo server credentials add --server-id dev-abc123 --database Contacts --username admin

# With inline password (for scripting)
fmo server credentials add --server-id dev-abc123 --database Contacts --username admin --password secret
```

### List stored credentials

```bash
fmo server credentials list --server-id dev-abc123
```

### Remove credentials

```bash
fmo server credentials remove --server-id dev-abc123 --database Contacts --username admin
```

## Interactive Browse

### Full navigation

```bash
fmo browse
```

Navigate: Select server → Select database → Select table → Choose action

### Skip to a specific server

```bash
fmo browse --server dev-abc123
```

### Skip directly to table selection

```bash
fmo browse --server dev-abc123 --database Contacts
```

## Typical Workflow

```bash
# 1. Add a server
fmo server add --name production --host fms.example.com

# 2. Store credentials
fmo server credentials add --server-id production-xyz --database Contacts --username admin

# 3. Browse interactively
fmo browse
```
