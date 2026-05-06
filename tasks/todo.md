# Todo: claris-odata-cli OData Compliance & Hardening

Companion to [`plan.md`](plan.md). Single-page checklist for tracking progress.

## Phase 1: Bug fixes
- [ ] **T1** Fix protocol detection across `list` / `health` / `overview` (S)
- [ ] **T2** Throw typed error subclasses from `client.handleApiError` (S)
- [ ] **Checkpoint A** — tests + lint green, no regressions

## Phase 2: Foundations
- [ ] **T3** Adopt `EndpointBuilder` as single URL source; commands move off inline `axios` (L)
- [ ] **T4** Add `PreferHeaderBuilder` + always-on `fmodata.include-specialcolumns` + `IEEE754Compatible=true` (M)
- [ ] **T5** Change `getRecords` return to `QueryResult<T>` (`{records, count, nextLink}`); update all callers (M)
- [ ] **Checkpoint B** — `Prefer`/`Accept` headers verified on wire, `--count` works on real instance

## Phase 3: Spec-conformant data plane
- [ ] **T6** Surface `--expand` and `--prefer-*` flags on `fmo get` (S)
- [ ] **T7** Add `--replace` (PUT) flag to `fmo update` (S)

## Phase 4: New OData capabilities
- [ ] **T8** `fmo script <name>` command (M)
- [ ] **T9** `fmo upload <table> <id> <field> <file>` command (M)
- [ ] **T10** `fmo batch --file <batch.json>` command (L — split if needed)
- [ ] **Checkpoint C** — manual smoke against real FileMaker Cloud, coverage ≥80%

## Phase 5: Cleanup + verification
- [ ] **T11** Centralize `formatError`; kill `as HttpErrorShape`; simplify `browse.ts` filter; route auth through `AuthManager` (M)
- [ ] **T12** Quality gates + smoke checklist; tick every box in `SPEC.md` § Success Criteria (S)
- [ ] **Checkpoint D** — PR opened, linked to `SPEC.md`
