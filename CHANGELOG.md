# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-06

### Added
- Full CRUD commands: `get`, `create`, `update`, `delete` for FileMaker OData records
- `list` command for servers, databases, and tables
- `schema` command to inspect table field definitions
- `health` command to check server connectivity
- `browse` command for interactive TUI navigation
- `server add|list|remove` for server configuration management
- `server credentials add|list|remove` for secure keychain credential storage
- `profile add|list|use|remove` for managing configuration profiles
- `init` command to bootstrap local context cache
- Machine-readable output formats: `--format json|jsonl|table|csv`
- OData query support: `--filter`, `--select`, `--top`, `--skip`, `--orderby`, `--count`
- Stable error code vocabulary in JSON output: `AUTH_FAILED`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONNECTION_ERROR`, `COMMAND_FAILED`

### Changed
- All logger output writes to stderr, keeping stdout clean for machine consumption
- ASCII header only displays for interactive TTY sessions with table format
- `-f` flag reserved for global `--format`; `get --filter` uses long form only
