# FYP testing plan and execution guide

Date: 20 October 2026. Application baseline: v1.0.13. Scope: new planning modules and shared academic rules. This document distinguishes automated developer checks from lecturer acceptance. It does not claim exhaustive function or statement coverage.

## 1. Responsibilities

| Owner | Feature responsibility and testing follow-up |
| --- | --- |
| Nicolas | AI chatbot and double-major checker; coordinate test evidence and lecturer review |
| Hadif | Graduation eligibility and unit suggestions; verify outcomes with lecturer-approved examples |
| Bryan | Planner Maker/Management, dashboard and performance; verify browser interactions and timings |
| Lecturer | Independently approve expected academic results and record acceptance decisions |
| Student participants | Attempt realistic tasks without being given exact chatbot wording |

## 2. How to run the automated tests

From the repository root in PowerShell:

```powershell
npm.cmd test
# Build current application source before HTTP integration tests:
npm.cmd run build
npm.cmd run test:integration
```

The offline runner discovers `scripts/test-*.cjs` except itself and the HTTP integration suite. Each suite runs in a separate Node process. A nonzero exit or timeout is a failure. The aggregate exits nonzero if any suite fails. Evidence is written under `docs/testing/runs/` as a Markdown summary, CSV, JSON environment record and individual stdout/stderr logs. Counts are **suites**, not individual assertions. Optional `CHAT_TEST_URL` blocks are disabled during offline runs and are not claimed as executed.

The integration suite uses a production standalone build, a disposable copy of the database and a local mock model. It regenerates the Prisma client under `.next/standalone` for that copy and intentionally changes only the temporary schema. Rebuild before using that standalone folder for packaging. The suite uses localhost port 3118; keep it available. It does not migrate the source database. Do not run this against a production server. Test names and logs should contain synthetic records only.

## 3. Coverage and acceptance checks

| Area | Automated suites | What they assess | Additional checks required |
| --- | --- | --- | --- |
| Graduation eligibility | `test-graduation-eligibility`, `test-course-completion`, `test-elective-completion` | Missing core/category slots; 24 incorrect units rejected; N/EXM; duplicates; WIL/AE allocations; incomplete counts; planner confirmation | Lecturer independently verifies expected allocations; browser result summary and planner switching |
| Double major | `test-double-major`, `test-double-major-pathway`, `test-double-major-electives` | Distinct majors; completed elective-to-major matching; remaining choices; shared units; prerequisites; offerings; nonmutation of DPA | Lecturer checks permitted overlap and programme compatibility; student understands remaining units |
| Suggestions and scheduling | `test-academic-planning`, `test-auto-suggestions`, `test-planner-matching`, `test-mixed-requisite-expressions`, `test-study-plan-workflow`, `test-unit-replacement` | Matching/ties; workload caps; unavailable units; FYP A before B; requisite logic; preferences; blocked units | Restored Unit Suggestions page has its own client-side helpers: test actual page results independently against reference examples |
| Chatbot | `test-chat-assistant`, `test-answerability`, `test-planner-intent`, `test-natural-planner-requests`, `test-conversational-planner`, `test-planner-context-continuity`, `test-planner-record-questions`, `test-planner-knowledge`, `test-ai-status` | Parsing; document validation; route fallback; typos/paraphrases; context; refusal; unavailable models; safe record lookup | Actual configured LLM: uncoached prompts, repeat runs, irrelevant requests and uploaded-document instructions |
| Chat state and export | `test-chat-session`, `test-chat-follow-ups`, `test-chat-planner-hydration`, `test-chat-planner-pdf`, `test-uploaded-planner` | Recovery; safe missing data; grounded follow-ups; immutable PDFs; malformed/signed planner documents | Browser upload/download, inspect downloaded PDF visually; new attachment replaces old context |
| Maker/Management and APIs | `test-planner-tools` | Save/reopen study periods and order; empty/duplicate planner rejected; reviewed saves/retries; stale edits; foreign rows; authentication; legacy DB reads; actual tools and mock-model calls | Drag/drop, moving/removing units, management editing and persistence through actual UI |
| Dashboard/performance | Manual only | No automated browser or performance claim | Route links, role visibility, small screen/dark theme, warm/cold timings |

No numerical code-coverage percentage is claimed. A passed shared scheduling suite does not prove the restored page's separate scheduler or every interaction is correct. API tests with development overrides are functional checks, not a production authorisation audit. Mock-model success is not evidence of real-model accuracy.

## 4. FYP acceptance execution

Use the existing lecturer cases in `../graduation-module-test-plan.md` and keep unexecuted rows in `../graduation-module-test-execution.csv` marked as not run. Do not mark them passed from developer unit-test results. Use the following steps before final submission:

1. Freeze the tested Git commit and record database fixture version, OS, browser, Node/app version and AI model tag. Save the task-board/commit evidence showing related fixes.
2. Ask the lecturer to approve a reference sheet for complete, incomplete, wrong-unit and exemption DPAs. Calculate expected category counts independently of the application.
3. Execute the browser cases in `manual-test-execution.csv`. Record observed result, evidence file, defect ID and tester/date. Include both successful and invalid upload paths.
4. Invite a small practical group of students (for example 3–5, subject to course expectations). Give tasks such as finding remaining units, getting next-semester suggestions and inspecting a second major. Record completion, assistance needed, confusing steps and comments. Do not present this sample as statistically representative.
5. Test the real local model and model-offline mode. Record exact prompts, model tag and outputs. Repeat key questions with different wording; verify the planner/units, not only fluent text.
6. Measure cold and warm page/task timings on named machines. Agree acceptable targets before execution; report observed timings rather than inventing a performance improvement.
7. Log defects, fix critical academic errors, rerun failed cases and relevant regressions, then obtain lecturer acceptance with remaining limitations recorded.

Use synthetic or anonymised records, explain recording/data use to participants, and follow the university's consent and ethics process. Avoid student IDs or personal academic records in submitted screenshots.

## 5. Exit criteria and report evidence

- All planned automated suites executed; failures resolved or explicitly recorded with impact.
- Lecturer-approved examples show no unresolved false eligibility result or incorrect completed-unit allocation.
- Main browser workflows completed, including save/reopen and invalid input recovery.
- Real-model limitations and any unknown academic rules are reported.
- Critical/blocking defects closed and retested; remaining defects agreed with the supervisor.
- Submission includes a plan, traceability matrix (above), execution logs, selected screenshots, defect/retest record, participant findings and lecturer feedback.

The execution summary is maintained in `automated-test-report.md`. Raw evidence is retained even for failed runs so the report shows how issues were found and retested.
