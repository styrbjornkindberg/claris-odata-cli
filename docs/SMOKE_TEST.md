# Smoke Test Checklist

Manual verification against a real FileMaker Cloud instance.

**Prerequisites:** Node 18+, `npm run build` clean, access to a FileMaker Cloud server with OData enabled.

Replace `<SERVER_ID>`, `<DB>`, `<TABLE>`, `<SCRIPT>`, `<RECORD_ID>`, `<CONTAINER_FIELD>` with real values throughout.

---

## 0. Setup

```bash
npm run build
node dist/index.js --version
```

- [ ] Version prints, no error.

```bash
node dist/index.js server add --name smoke-test --host <hostname>
# Note the generated server ID printed to stdout
node dist/index.js server credentials add \
  --server-id <SERVER_ID> \
  --database <DB> \
  --username <username>
# Enter password when prompted
```

- [ ] Server added, credentials stored without error.

---

## 1. Health

```bash
node dist/index.js health
node dist/index.js health --format json
```

- [ ] `smoke-test` server shown as reachable.
- [ ] JSON output has `status: "ok"` and a numeric `latency`.
- [ ] No credentials leak in output.

---

## 2. list databases

```bash
node dist/index.js list databases --server <SERVER_ID>
```

- [ ] At least one database listed.
- [ ] `<DB>` appears in the list.

---

## 3. list tables

```bash
node dist/index.js list tables --server <SERVER_ID> --database <DB>
```

- [ ] Tables listed without error.
- [ ] `<TABLE>` appears in the list.

---

## 4. get (basic)

```bash
node dist/index.js get <TABLE> --server <SERVER_ID> --database <DB>
```

- [ ] Records returned (or empty table message, not an error).
- [ ] Output is a table by default.

---

## 5. get --count

```bash
node dist/index.js get <TABLE> \
  --server <SERVER_ID> \
  --database <DB> \
  --count \
  --format json
```

- [ ] JSON output contains `"count"` key with a non-negative integer.
- [ ] `"records"` array present.

---

## 6. get with query options

```bash
node dist/index.js get <TABLE> \
  --server <SERVER_ID> \
  --database <DB> \
  --top 3 \
  --orderby recordId \
  --format json
```

- [ ] At most 3 records returned.
- [ ] No `nextLink` error if record count ≤ 3.

```bash
node dist/index.js get <TABLE> \
  --server <SERVER_ID> \
  --database <DB> \
  --select "fieldName1,fieldName2" \
  --format json
```

- [ ] Response records contain only the requested fields (plus OData metadata fields).

---

## 7. script (no table context)

```bash
node dist/index.js script <SCRIPT> \
  --server <SERVER_ID> \
  --database <DB>
```

- [ ] Exit 0, response printed.
- [ ] No stack trace in stdout/stderr.

---

## 8. script with table context

```bash
node dist/index.js script <SCRIPT> \
  --server <SERVER_ID> \
  --database <DB> \
  --table <TABLE>
```

- [ ] Exit 0, response printed.

```bash
node dist/index.js script <SCRIPT> \
  --server <SERVER_ID> \
  --database <DB> \
  --table <TABLE> \
  --id <RECORD_ID>
```

- [ ] Exit 0, response printed.

---

## 9. script with params

```bash
node dist/index.js script <SCRIPT> \
  --server <SERVER_ID> \
  --database <DB> \
  --params '{"action":"ping"}'
```

- [ ] Exit 0.
- [ ] FileMaker received `scriptParameterValue` — verify in script result or FM log.

**Invalid JSON guard:**

```bash
node dist/index.js script <SCRIPT> \
  --server <SERVER_ID> \
  --database <DB> \
  --params 'not json'
```

- [ ] Exit non-zero.
- [ ] Error message mentions `--params` / invalid JSON.
- [ ] No stack trace visible.

---

## 10. upload

Prepare a small test file:

```bash
echo "smoke test" > /tmp/smoke.txt
```

```bash
node dist/index.js upload <TABLE> <RECORD_ID> <CONTAINER_FIELD> /tmp/smoke.txt \
  --server <SERVER_ID> \
  --database <DB>
```

- [ ] Exit 0, success message printed.
- [ ] Open record in FileMaker Pro / Web Direct — container field shows uploaded file.

Upload a JPEG (if a container field accepts images):

```bash
node dist/index.js upload <TABLE> <RECORD_ID> <CONTAINER_FIELD> /path/to/test.jpg \
  --server <SERVER_ID> \
  --database <DB>
```

- [ ] Exit 0.
- [ ] MIME type detected as `image/jpeg` (check `--verbose` output).

---

## 11. Error path: missing credentials

```bash
node dist/index.js server add --name no-creds --host <hostname>
# Do NOT add credentials for this server

node dist/index.js get <TABLE> --server <no-creds-SERVER_ID> --database <DB>
```

- [ ] Exit non-zero.
- [ ] Message indicates missing credentials, not a crash.

---

## 12. Error path: wrong password

Store deliberately bad credentials, then:

```bash
node dist/index.js get <TABLE> --server <SERVER_ID> --database <DB>
```

_(after storing wrong password for the database)_

- [ ] Exit non-zero.
- [ ] `AuthenticationError` or `401` message — no password in output.

---

## 13. Cleanup

```bash
node dist/index.js server credentials remove \
  --server-id <SERVER_ID> \
  --database <DB> \
  --username <username>

node dist/index.js server remove --server-id <SERVER_ID>
```

- [ ] Both commands exit 0.
- [ ] `fmo health` no longer shows `smoke-test`.

---

## Pass Criteria

All boxes checked with a real FileMaker Cloud instance. Any failure → open a GitHub issue with the exact command and output.
