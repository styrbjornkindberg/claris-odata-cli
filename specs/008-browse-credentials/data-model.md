# Data Model: Interactive Navigation and Credential Management

**Feature Branch**: `008-browse-credentials`
**Date**: 2026-03-28

## Entities

### CredentialEntry (display model for listing)

Represents a stored credential entry parsed from keytar's `findCredentials` response.

| Field      | Type     | Description                          | Source                        |
|------------|----------|--------------------------------------|-------------------------------|
| serverId   | string   | Server ID                            | Parsed from account key (1st) |
| database   | string   | Database name                        | Parsed from account key (2nd) |
| username   | string   | Username                             | Parsed from account key (3rd) |

**Validation rules**:
- Account key must contain exactly 2 colons separating 3 non-empty segments
- Entries with malformed keys are silently skipped during listing

**Notes**: Passwords are never included in the display model. The `CredentialEntry` is derived at runtime by parsing keytar account strings; it is not persisted separately.

### Server (existing — no changes)

Already defined in `src/types/index.ts`. No schema changes required.

| Field  | Type    | Description              |
|--------|---------|--------------------------|
| id     | string  | Unique server identifier |
| name   | string  | Display name             |
| host   | string  | Hostname/IP              |
| port   | number? | Port (default: 443)      |
| secure | boolean?| Use HTTPS (default: true)|

### BrowseState (runtime only)

Internal state for the browse navigation loop. Not persisted.

| Field       | Type             | Description                     |
|-------------|------------------|---------------------------------|
| level       | BrowseLevel      | Current navigation depth        |
| serverId    | string?          | Selected server ID              |
| database    | string?          | Selected database name          |
| table       | string?          | Selected table name             |
| credentials | { username, password }? | Resolved credentials    |

**BrowseLevel enum**: `'server' | 'database' | 'table' | 'action'`

## Relationships

```
Server 1 ──── * CredentialEntry (via serverId prefix in keytar account key)
Server 1 ──── * Database (discovered live via OData API)
Database 1 ── * Table (discovered live via OData service document)
```

## New Types (to add to `src/types/index.ts`)

```typescript
/** Parsed credential entry for display (no password) */
export interface CredentialEntry {
  serverId: string;
  database: string;
  username: string;
}

/** Browse navigation level */
export type BrowseLevel = 'server' | 'database' | 'table' | 'action';

/** Browse action choices at the table level */
export type BrowseAction = 'list' | 'get' | 'create' | 'schema';
```
