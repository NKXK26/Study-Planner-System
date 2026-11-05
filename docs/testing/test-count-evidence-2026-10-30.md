# Automated testing evidence and limits

Executed on 30 October 2026 against application baseline `e0ce548` (v1.0.13) plus the recorded testing changes. Counts were measured during execution, not estimated by counting source lines.

| Layer | Suites passed | Assertion calls executed | Failed assertions | Evidence |
| --- | --- | --- | --- | --- |
| Offline unit and regression checks | 26 of 26 | 771 | 0 | [Summary and logs](runs/2026-10-30T05-06-05-750Z-regression/summary.md) |
| Built HTTP API integration with disposable DB and mock model | 1 of 1 | 373 | 0 | [Summary and logs](runs/2026-10-30T05-08-13-423Z-integration/summary.md) |
| Total across these two runs | 27 of 27 | 1144 | 0 | Individual `results.json`, `results.csv`, suite logs and assertion ledgers in the linked folders |

## What the numbers mean

A suite is a script grouping related scenarios. An assertion checks an expected value, error, state or response. One scenario can have several assertions, and loops can repeat assertions for different records or prompts. Therefore **1144 assertion executions are not 1144 independent test cases**. These totals do not count functions covered or establish a coverage percentage. Setup and validation assertions are included. The counter measures direct `node:assert/strict` calls made by each suite, including awaited asynchronous assertions; dependency-internal checks are excluded. The counter was checked with controlled synchronous, expected-error and asynchronous examples.

`npm.cmd test` now displays per-suite assertion counts. `npm.cmd run test:integration` does the same for the HTTP suite. The runner retains exit status, timing, Node/platform details, source commit, working-tree state and separate logs. Assertion ledgers record method counts and pending/failed executions. Do not submit only a screenshot without these reproducible scripts and logs.

## Is this sufficient for every function

This is a useful regression baseline, not evidence of exhaustive testing. Comparing a project's suite count with another project's reported 2600 tests is unreliable unless both count the same thing and test similar scope. More repeated assertions do not necessarily cover new risks.

Priority gaps to complete before final acceptance:

1. Test the actual restored Unit Suggestions page against independently approved examples. Its separate client helpers are not fully covered by tests of shared scheduling libraries.
2. Complete browser upload, drag/drop, edit/save/reopen, model-selection, download, stale-response and error-recovery journeys. API persistence checks do not test drag/drop itself.
3. Ask a lecturer to validate expected academic allocations and prerequisites for representative planners. Test a missing core unit even when total completed units/credits are high.
4. Evaluate the actual local model with varied student wording and unsupported questions. Mock-model integration tests do not establish natural-language accuracy.
5. Test real role permissions with DEV overrides disabled, accessibility, actual installer journeys and measured performance on named computers.
6. Add function/branch coverage instrumentation and review untested critical branches before claiming a coverage target. No percentage is available from these runs.

Use `manual-test-execution.csv` to record remaining acceptance results. Those rows must stay NOT RUN until observed. Do not add duplicate cases simply to reach an arbitrary test total.

## Failed attempts retained

- [Initial integration attempt](runs/2026-10-30T05-06-30-338Z-integration/summary.md) failed while Prisma generated its client in the sandbox temporary directory (`EPERM` rename). A configurable disposable workspace was added under ignored `tmp/test-temp`.
- [Second integration attempt](runs/2026-10-30T05-07-27-819Z-integration/summary.md) stopped because sandbox policy blocked localhost (`EACCES`). Its preliminary assertions passed, but the suite failed; it is not included as successful evidence.
- The successful retest used approved localhost access, the disposable database and the mock model. No product-code fix or source database migration was needed.

## Screenshot and report wording

The terminal screenshot is a real capture of the VS Code terminal displaying these saved execution records. It is a results summary, not a photograph of a manually verified UI workflow. The original image is saved under `artifacts/testing` for attaching to the FYP report.

[Open the terminal screenshot](../../artifacts/testing/test-results-full-20261030.jpg). Generated images in `artifacts` are intentionally ignored by Git; attach the screenshot separately if submitting or sharing the report.

Suggested caption: “Automated regression and API integration results recorded on 30 October 2026: 27 suites passed, comprising 1144 executed assertion checks with no assertion failures. Assertions include repeated checks and are not independent test-case or code-coverage counts.”

Retain the screenshot together with this report, the scripts and the raw execution folders. State the mock-model and browser-testing limitations when presenting the results.
