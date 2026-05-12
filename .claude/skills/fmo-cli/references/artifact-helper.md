# fmo in Live Artifacts

## fmoJSONL helper

Use this exact function — it matches how the MCP tool returns data.

```javascript
async function fmoJSONL(cmd) {
  let raw;
  try { raw = await window.cowork.callMcpTool('mcp__fmo__fmo_run', { command: cmd }); }
  catch (e) { throw new Error('callMcpTool: ' + e.message); }

  // Response lives at raw.content[0].text as a JSONL string
  let text = '';
  if (raw?.content?.[0]?.text) text = raw.content[0].text;
  else if (typeof raw === 'string') text = raw;

  const trimmed = text.trim();
  if (!trimmed) return [];

  // fmo prefixes command failures with "Command failed: node ..."
  if (trimmed.startsWith('Command failed')) {
    const m = trimmed.match(/\{\s*"code"[\s\S]*?\}/);
    if (m) {
      try {
        const eo = JSON.parse(m[0]);
        throw new Error(eo.message || trimmed.split('\n')[0]);
      } catch (pe) { if (!(pe instanceof SyntaxError)) throw pe; }
    }
    throw new Error(trimmed.split('\n')[0]);
  }

  const lines = trimmed.split('\n').filter(l => l.trim());
  if (!lines.length) return [];

  // Check whether the first line is a JSON error object
  try {
    const first = JSON.parse(lines[0]);
    if (first?.code || first?.error) throw new Error(first.message || first.error);
  } catch (pe) { if (!(pe instanceof SyntaxError)) throw pe; }

  return lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}
```

**Why this shape?** The MCP wraps output as `{ content: [{ type: 'text', text: '...' }] }`.
The text is raw fmo stdout — one JSON object per line in JSONL mode. fmo prefixes
errors with `"Command failed: node /path/to/index.js ..."` before the JSON error
body, so both forms need handling.

---

## Pagination pattern

The MCP protocol has a ~20 KB per-call response limit. Full FileMaker records can
be 1–3 KB each (many null/calculated/summary fields). Safe batch sizes:

| Fetch mode | `-t` limit |
|------------|-----------|
| Full records (no `--select`) | 20 |
| With `--select` (ASCII fields) | 100–150 |
| Wide tables (50+ fields) | 50 or fewer |

**Run all batches in parallel:**

```javascript
const BATCH = 20;
const MAX_RECORDS = 300; // adjust to expected dataset size
const SERVER = 'my-server';
const DB = 'MyDatabase';
const filter = "Status eq 'Active'";

const promises = [];
for (let skip = 0; skip < MAX_RECORDS; skip += BATCH) {
  promises.push(
    fmoJSONL(`get MyTable -s ${SERVER} -d ${DB} -f jsonl -t ${BATCH} --skip ${skip} --filter "${filter}"`)
      .catch(() => []) // empty batch = past end of data
  );
}

const seen = new Set();
const all = [];
for (const batch of await Promise.all(promises)) {
  for (const r of batch) {
    if (r['@odata.id'] && !seen.has(r['@odata.id'])) {
      seen.add(r['@odata.id']);
      all.push(r);
    }
  }
}
```

Deduplicate by `@odata.id` (always present, encodes the record ID) in case
batches overlap at data boundaries.
