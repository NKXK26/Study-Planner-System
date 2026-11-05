# New modules — automated execution report

Execution date: 20 October 2026 (Malaysia).

Update on 30 October 2026: a fresh measured run passed 26 regression suites (771 assertion calls) and one API integration suite (373 assertion calls). See [current count evidence and remaining gaps](test-count-evidence-2026-10-30.md). Assertion executions are not independent test cases or a code-coverage percentage; the original dated results below are retained.

## Tested configuration

- Application baseline: `e0ce548` (v1.0.13), plus the testing-only working changes recorded in each run's `results.json`.
- Environment and exact timestamps: see run JSON records. The scripts capture Node version, platform, architecture and working-tree state.
- Offline suite: synthetic fixtures and controlled dependencies. External optional `CHAT_TEST_URL` checks disabled.
- Integration: existing standalone production build of application baseline, copied SQLite database with schema aligned only in the temporary copy, mock local model. No fresh web build was needed for these testing-only edits; rebuild before rerunning against changed application source or packaging after the integration client override.

## Results

| Execution | Result | Evidence |
| --- | --- | --- |
| Initial offline run | 25 PASS / 1 FAIL | [Initial summary](runs/2026-10-20T12-56-50-505Z-regression/summary.md) |
| Offline retest | **26 PASS / 0 FAIL** | [Retest summary](runs/2026-10-20T12-58-20-237Z-regression/summary.md) |
| Initial HTTP integration | 0 PASS / 1 FAIL | [Initial integration summary](runs/2026-10-20T12-58-04-488Z-integration/summary.md) |
| HTTP integration retest | **1 PASS / 0 FAIL** | [Integration retest summary](runs/2026-10-20T12-59-48-634Z-integration/summary.md) |

These counts represent suites. Each suite contains multiple assertions; no individual test-case total or percentage coverage is claimed.

## Issues identified and changes made

1. The legacy chatbot route test failed with HTTP 400 because its manually constructed harness omitted newer `readPlannerDocument` and `resolvePlannerModel` dependencies. Added explicit controlled stubs; the unchanged application route then passed. Signed uploaded-planner behaviour remains covered separately by `test-uploaded-planner` and the HTTP suite. This was a test-maintenance issue, not evidence of an application bug.
2. A newly added Planner Maker persistence case initially expected HTTP 200 for creation, while the actual contract returns 201. Corrected the assertion and retained the failure log. The retest passed: planned year, semester, dates and display order survived save/reopen; duplicate names and empty planners were rejected.

No product source changes were required by this execution. The runner and package scripts make future evidence reproducible, with failures preserved rather than overwritten.

## What the passing results establish

- Recorded academic-rule checks pass their synthetic fixtures: missing categories, incorrect unit combinations, N/EXM, WIL and approved-elective allocations, requisite expressions, workload limits and FYP sequence.
- Chat routing/context, refusal boundaries, offline handling, session recovery, PDF contents and uploaded-planner validation pass their existing regression assertions.
- Built HTTP tests pass against a disposable database: relevant API validation, authentication checks, tool reuse, planner persistence, duplicate/retry handling, stale edits, legacy reads and mock-model interactions.

## Limits and next actions

This does **not** establish correctness for every stored planner, every function, or every real student record. It does not measure code coverage. The restored suggestion page has separate client logic; shared scheduling tests alone do not establish its rendered output. Browser drag/drop, graduation-summary layout, accessibility, performance and installer behaviour were not executed in this run. Mock models cannot establish real-model understanding. API checks using DEV overrides do not replace testing actual role-based authorisation with overrides disabled.

Complete the [manual execution sheet](manual-test-execution.csv), obtain lecturer-approved reference results, record real-model/student usability findings, and retest fixes. The [FYP guide](fyp-testing-guide.md) lists responsibilities, navigation to existing acceptance material, evidence expectations and exit criteria. All manual rows remain **NOT RUN** until observed by a tester.
