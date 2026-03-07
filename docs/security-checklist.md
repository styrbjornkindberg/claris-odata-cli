# Security Checklist - Claris OData CLI

> **Purpose:** Define security standards and audit criteria for this CLI project.
> **Last Updated:** 2026-03-07
> **Owner:** Security Agent (Task #109, #110)

---

## What "Secure" Means for This Project

A secure Claris OData CLI means:

1. **Credentials are NEVER exposed** - No plaintext passwords in code, logs, or config files
2. **All API communication is encrypted** - HTTPS enforced, no HTTP allowed
3. **User input is validated** - No injection attacks possible through CLI arguments
4. **Dependencies are vetted** - No known vulnerabilities in dependencies
5. **Errors fail securely** - No sensitive data leaked in error messages
6. **Token/secret handling is safe** - Proper cleanup, no memory leaks

---

## OWASP Top 10 for CLI Applications

| OWASP Category | CLI Implication | Status |
|----------------|-----------------|--------|
| **A01:2021 - Broken Access Control** | Credentials must be validated before API calls | ⬜ Pending |
| **A02:2021 - Cryptographic Failures** | HTTPS required; secure credential storage | ⬜ Pending |
| **A03:2021 - Injection** | SQL/Command injection via CLI args | ⬜ Pending |
| **A04:2021 - Insecure Design** | Security-first architecture | ⬜ Pending |
| **A05:2021 - Security Misconfiguration** | Secure defaults, no debug mode in production | ⬜ Pending |
| **A06:2021 - Vulnerable Components** | npm audit, Dependabot | ⬜ Pending |
| **A07:2021 - Auth Failures** | Secure credential storage via Keytar | ⬜ Pending |
| **A08:2021 - Software/Data Integrity** | Verify downloads, signed commits | ⬜ Pending |
| **A09:2021 - Security Logging** | Log security events, sanitize logs | ⬜ Pending |
| **A10:2021 - SSRF** | Not applicable (CLI, not web server) | ✅ N/A |

---

## Credential Storage Security

### ✅ Approved: Keytar (System Keychain)

```typescript
// CORRECT: Using system keychain
import keytar from 'keytar';

// Store credentials securely
await keytar.setPassword('claris-odata-cli', serverName, credentials);

// Retrieve credentials securely
const credentials = await keytar.getPassword('claris-odata-cli', serverName);
```

**Why Keytar is secure:**
- Uses OS-native credential storage (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- Credentials are encrypted at rest
- Not accessible to other processes without user interaction
- No plaintext passwords in config files

### ❌ Forbidden: Plaintext Storage

```typescript
// WRONG: Never do this
localStorage.setItem('password', password);  // ❌
config.set('credentials', { username, password });  // ❌
console.log(`Connecting as ${username}:${password}`);  // ❌
```

### Configuration Storage (Non-Sensitive)

Use `conf` package for non-sensitive config only:
```typescript
// OK: Server URLs, preferences, defaults
config.set('defaultServer', 'https://fms.example.com');
config.set('outputFormat', 'json');

// WRONG: Credentials
config.set('password', password);  // ❌ NEVER
```

---

## HTTPS Enforcement

### Required Checks

- [ ] All API calls use HTTPS
- [ ] HTTP URLs are rejected or upgraded
- [ ] Self-signed certificate warnings are shown but not bypassed silently
- [ ] Certificate validation is enabled (never disable)

```typescript
// CORRECT: HTTPS enforcement
function validateUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed. Refusing insecure connection.');
  }
}

// WRONG: Disabling certificate validation
const client = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false })  // ❌ NEVER
});
```

---

## Input Validation

### CLI Argument Sanitization

All user inputs must be validated:

```typescript
// CORRECT: Validate table names
function validateTableName(name: string): string {
  // Only alphanumeric and underscore allowed
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error('Invalid table name. Only letters, numbers, and underscores allowed.');
  }
  return name;
}

// CORRECT: Escape OData queries (prevent injection)
function buildFilter(filter: string): string {
  // OData injection prevention
  const escaped = filter.replace(/'/g, "''");
  return `$filter=${escaped}`;
}
```

---

## Logging Security

### Never Log Secrets

```typescript
// CORRECT: Mask sensitive data
logger.info('Connecting to server', { 
  server: serverUrl, 
  username: username,
  password: '[REDACTED]'  // ✅
});

// WRONG: Exposing credentials
logger.debug(`Using credentials: ${username}:${password}`);  // ❌
```

### Log Security Events

- [ ] Failed authentication attempts
- [ ] Certificate validation failures
- [ ] Invalid input attempts
- [ ] API permission errors

---

## Dependency Security

### Regular Audits

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Production dependency check
npm audit --production
```

### Approved Dependencies

| Package | Version | Security Notes |
|---------|---------|----------------|
| keytar | ^7.9.0 | ✅ OS keychain integration |
| conf | ^12.0.0 | ✅ Config storage (non-sensitive) |
| axios | ^1.6.0 | ✅ HTTP client, validates certs by default |
| commander | ^12.0.0 | ✅ CLI framework, no security concerns |

---

## Hardcoded Secrets Check

### Files to Audit

- [ ] `src/config/credentials.ts` - No hardcoded passwords
- [ ] `src/api/auth.ts` - No hardcoded tokens
- [ ] `tests/**/*.ts` - No real credentials in test files
- [ ] `.env` files - Excluded from git (check `.gitignore`)
- [ ] `package.json` - No secrets in scripts

### Detection Commands

```bash
# Search for potential secrets
grep -r "password\s*=" src/
grep -r "api[_-]?key\s*=" src/
grep -r "secret\s*=" src/
grep -r "token\s*=" src/

# Check for .env files
find . -name ".env*" -not -path "./node_modules/*"
```

---

## Error Handling

### Fail Securely

```typescript
// CORRECT: Generic error for sensitive operations
catch (error) {
  if (error instanceof AuthenticationError) {
    // Don't reveal if user exists
    throw new Error('Authentication failed. Check your credentials.');
  }
  throw error;
}

// WRONG: Too detailed error
throw new Error(`User ${username} not found in database ${database}`);  // ❌
```

---

## Pre-Commit Security Check

Run before every commit:

```bash
# 1. Lint (catches common issues)
npm run lint

# 2. Tests
npm test

# 3. Build
npm run build

# 4. Dependency audit
npm audit

# 5. Secret scan
grep -r "password\s*=" src/ --include="*.ts"
```

---

## Security Audit Sign-Off

| Date | Auditor | Status | Notes |
|------|---------|--------|-------|
| 2026-03-07 | Security Agent | 🔄 In Progress | Framework created |
| | | ⬜ | Awaiting credential/auth code |
| | | ⬜ | Final review pending |

---

## References

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Keytar Security](https://github.com/atom/node-keytar)
- [Axios Security](https://axios-http.com/docs/req_config)
- [Claris OData Authentication](https://help.claris.com/en/odata-guide/content/creating-authenticated-connection.html)