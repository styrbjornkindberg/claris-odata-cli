# Claris ODATA CLI - Coding Standards

> **FOR THE SQUAD:** These standards apply to all agents implementing code (coder, tester, devops). Follow them strictly.

## Git Workflow (CRITICAL)

### Branch Per Task
```bash
# Create branch for each task
git checkout -b feature/102-cli-framework

# Naming: feature/{task-id}-{description}
```

### Commit Every 30 Minutes
**This is not optional.** Frequent commits prevent work loss.

```bash
# Good: Small commits
git add src/api/client.ts
git commit -m "feat(api): add authentication headers"

# Bad: Huge commits once per day ❌
```

### Before Every Commit
```bash
npm run lint    # Must pass
npm run test    # Must pass  
npm run build   # Must compile
```

If any fail: **FIX FIRST**, then commit.

## Language Choice

**TypeScript + Node.js**

Why:
- TypeScript provides type safety (catch bugs early)
- Node.js is universal for CLI tools
- Great ecosystem for HTTP clients (axios, got)
- Easy to install via npm (`npm install -g @claris/odata-cli`)
- AI agents can work efficiently with TypeScript

## Project Structure

```
claris-odata-cli/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── cli/                # Command handlers
│   │   ├── list.ts         # fmo list servers/databases/tables
│   │   ├── get.ts          # fmo get records
│   │   ├── create.ts       # fmo create record
│   │   ├── update.ts       # fmo update record
│   │   ├── delete.ts       # fmo delete record
│   │   └── schema.ts       # fmo schema
│   ├── api/                 # OData client
│   │   ├── client.ts        # HTTP client wrapper
│   │   ├── auth.ts          # Authentication
│   │   └── endpoints.ts     # Endpoint builders
│   ├── config/              # Configuration
│   │   ├── servers.ts       # Server management
│   │   ├── credentials.ts   # Secure credential storage
│   │   └── profiles.ts      # Environment profiles
│   ├── utils/               # Utilities
│   │   ├── output.ts        # Output formatting (JSON, table, CSV)
│   │   └── logger.ts        # Logging
│   └── types/                # TypeScript types
│       └── index.ts         # Shared types
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── mocks/               # Mock OData server
├── docs/
│   ├── api-research.md      # Research notes
│   ├── architecture.md      # System design
│   └── user-guide.md        # User documentation
├── package.json
├── tsconfig.json
├── eslint.config.js
└── README.md
```

## Naming Conventions

### Files
```
kebab-case.ts          # All source files
*.test.ts               # Test files
*.types.ts              # Type definitions
```

### Variables
```typescript
// Use descriptive names - no single letter except loops
const serverName = "production";       // ✅
const s = "production";                  // ❌

// Boolean prefix
const isAuthenticated = true;           // ✅
const connected = true;                  // ✅

// Collections
const servers = [];                     // Array of servers
const serverMap = new Map();            // Map of servers
```

### Functions
```typescript
// Verb + Noun pattern
function getRecords() {}        // ✅
function records() {}           // ❌

// Async explicit
async function fetchRecords() {} // ✅

// Single responsibility
function buildUrl(server: string, path: string): string {
  return `${server}/fmi/odata/v4/${path}`;
}
```

### Classes
```typescript
// PascalCase
class ODataClient {}        // ✅
class odataClient {}        // ❌

// Interface prefix I (optional, but consistent)
interface IConfig {}        // ✅ or
interface Config {}         // ✅

// Private prefix underscore
class Client {
  private _baseUrl: string;    // ✅
  private baseUrl: string;      // ✅ (no underscore is fine too)
}
```

### Constants
```typescript
// UPPER_SNAKE_CASE for true constants
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30000;

// camelCase for configuration objects
const defaultConfig = {
  timeout: 30000,
  retries: 3,
};
```

## Comments

### When to Comment
```typescript
// ✅ WHY comments (explain purpose, not what)
// FileMaker requires X-Database header for each request
headers['X-Database'] = database;

// ✅ TODO/FIXME with context
// TODO: Add retry logic for rate limiting (FileMaker has 100 req/min)
// FIXME: This fails on container fields with binary data

// ✅ JSDoc for public APIs
/**
 * Fetches records from a FileMaker table via OData API
 * @param tableName - The FileMaker table name
 * @param options - Query options ($filter, $select, etc.)
 * @returns Array of records
 * @throws {AuthenticationError} If credentials are invalid
 */
async function getRecords(tableName: string, options?: QueryOptions): Promise<Record[]>

// ❌ WHAT comments (obvious from code)
// Loop through servers
for (const server of servers) {}
```

### File Headers
```typescript
/**
 * OData CLI - Record Operations
 * 
 * Provides CRUD operations for FileMaker records via OData API.
 * 
 * @module cli/get
 * @see https://help.claris.com/en/odata-guide/
 */
```

## Maintainability

### Function Length
```typescript
// Maximum 50 lines per function
// If longer, split into smaller functions
```

### File Length
```typescript
// Maximum 300 lines per file
// If longer, split into multiple modules
```

### Dependencies
```typescript
// Use dependency injection for testability
class ODataClient {
  constructor(
    private readonly http: HttpClient,
    private readonly config: Config
  ) {}
}

// No global state (except config)
```

### Error Handling
```typescript
// Always use typed errors
class ODataError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = 'ODataError';
  }
}

// Handle errors at boundaries
try {
  return await client.getRecords(tableName);
} catch (error) {
  if (error instanceof ODataError) {
    logger.error(`OData error: ${error.message}`, { statusCode: error.statusCode });
  }
  throw error;
}
```

## Code Review Checklist

Before marking task as "review":

- [ ] TypeScript compiles with no errors
- [ ] ESLint passes (no warnings)
- [ ] All tests pass
- [ ] Public functions have JSDoc comments
- [ ] No console.log (use logger)
- [ ] No hardcoded credentials or URLs
- [ ] Error handling for all async operations
- [ ] Types defined for all inputs/outputs

## Formatting

### Prettier Config
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### ESLint Config
```javascript
// eslint.config.js
import tseslint from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-plugin-prettier';

export default [
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      'no-console': 'error', // Use logger instead
    }
  }
];
```

## Testing Standards

### Unit Tests
```typescript
// Describe the unit being tested
describe('ODataClient', () => {
  describe('getRecords', () => {
    it('should return records from a table', async () => {
      // Arrange
      const client = createMockClient();
      
      // Act
      const records = await client.getRecords('Users');
      
      // Assert
      expect(records).toHaveLength(10);
    });
    
    it('should throw ODataError on authentication failure', async () => {
      const client = createMockClient({ authFailure: true });
      
      await expect(client.getRecords('Users'))
        .rejects.toThrow(ODataError);
    });
  });
});
```

### Test Coverage
- Minimum 80% coverage
- 100% coverage on authentication and error handling
- All edge cases tested

## Git Commits

### Commit Format
```
type(scope): description

# Examples:
feat(cli): add list command for databases
fix(auth): handle expired tokens correctly
docs(api): add OData endpoint documentation
test(client): add unit tests for authentication
refactor(config): extract credential storage to separate module
```

### Types
- feat: New feature
- fix: Bug fix
- docs: Documentation
- test: Tests
- refactor: Code refactoring
- chore: Maintenance