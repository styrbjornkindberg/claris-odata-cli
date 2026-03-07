# Integration Test Setup

## Prerequisites

1. FileMaker Server with OData API enabled
2. Credentials with database creation/deletion permissions
3. Network access to the server

## Setup Steps

1. **Copy environment template**
   ```bash
   cp tests/integration/.env.example tests/integration/.env
   ```

2. **Configure credentials**
   - Open `.env` and fill in your FileMaker server details
   - `FM_USERNAME` and `FM_PASSWORD` must have schema modification permissions

3. **Run integration tests**
   ```bash
   npm run test:integration
   ```

## How Tests Work

Tests are **self-constructing**:

1. **Setup phase**: Creates test database and tables
   - Database: `test_claris_odata_cli` (or custom name in `.env`)
   - Tables: Customers, Orders, Products (configurable)

2. **Test phase**: Runs CRUD operations against the constructed database
   - Create records
   - Read records (single and list)
   - Update records
   - Delete records

3. **Cleanup phase**: Truncates tables (leaves database intact for reuse)

## CI/CD Integration

For GitHub Actions, add secrets:

```yaml
env:
  FM_SERVER: ${{ secrets.FM_SERVER }}
  FM_USERNAME: ${{ secrets.FM_USERNAME }}
  FM_PASSWORD: ${{ secrets.FM_PASSWORD }}
```

## Test Tables Schema

Tests will create these tables:

### Customers
| Field | Type |
|-------|------|
| id | Text (primary key) |
| name | Text |
| email | Text |
| created_at | Timestamp |

### Orders
| Field | Type |
|-------|------|
| id | Text (primary key) |
| customer_id | Text |
| total | Number |
| status | Text |
| created_at | Timestamp |

### Products
| Field | Type |
|-------|------|
| id | Text (primary key) |
| name | Text |
| price | Number |
| stock | Number |

## Troubleshooting

### "Connection refused"
- Check `FM_SERVER` URL is correct
- Verify the server is accessible from your network

### "Insufficient permissions"
- Ensure the OData user has database creation permissions
- Contact your FileMaker Server administrator

### "Database already exists"
- This is fine! Database is reused across test runs
- Tables are truncated before each test run
- No manual cleanup needed

## Running Tests Locally

```bash
# Unit tests only (no server needed)
npm run test:unit

# Integration tests (requires server)
npm run test:integration

# All tests
npm run test
```