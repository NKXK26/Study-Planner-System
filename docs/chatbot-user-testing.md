# Chatbot capability and human testing

Current assessment: a scoped study-planning assistant suitable for supervised prototype testing. Automated checks establish rule and API behavior; they do not establish a general natural-language success rate or official enrolment eligibility.

Supported tasks: DPA explanation, provisional next-semester drafts, selected-planner comparisons, second-major unit coverage. Follow-up buttons guide users through the prerequisites for these tasks. Missing offerings, incomplete academic rules, intake ties and course compatibility remain limitations. Unit-name references and ambiguous follow-ups need human testing too.

## Human test cases

Planner matches are earned-unit overlap, not proof of the student's intake. Equal match/credit scores retain the newest-first order returned by `/api/study-planner`, matching the Unit Suggestions page's tie order; they no longer sort planner names alphabetically. Confirm the actual planner in the suggestion controls. Later prompts and refresh actions keep that choice; a destination-major change or new DPA does not silently reuse a stale primary planner. Verify this with two tied CSDS intake records and an explicit selection of the other record.

Run these with representative anonymised DPA files and recorded planners. Judge both the answer and whether the chatbot requested the right missing information.

| Prompt or action | Expected behavior |
| --- | --- |
| ?idk what subjects to pick next term? without a DPA | Ask for the DPA; do not invent personal units. |
| Upload a DPA containing N and positive-credit EXM | N stays unfinished; EXM is counted with its earned credit. |
| ?what should I take next?? | Use the relevant planner, at most four units / 50 CP, and recorded checks. |
| ?why those?? after a draft | Explain current rule checks rather than repeat the list. |
| ?can I take [blocked unit code]?? | Explain the recorded block or uncertainty. |
| ?can I take project B before A?? | Ask for the relevant unit code if needed; do not approve an unmet project sequence. |
| ?switch from AI to data science? | Select DS destination records; do not use the origin major. |
| ?not AI, data science instead? | Latest correction takes priority. |
| ?AI or data science?? | Ask which destination to calculate rather than pick arbitrarily. |
| Select two planners, then ?compare these? | Use those two records. |
| Type different explicit planner IDs | Typed references override workspace choices. |
| ?what is a double major?? | Explain the concept; do not start personal assessment. |
| ?check my second major options? | Require confirmed DPA and actual primary selection. |
| Change the attachment and ask a follow-up | Use the new DPA, never older completion statements. |
| Deliberately edit DPA rows without confirming | Ask for confirmation before personal calculation. |
| Stop the model service and use follow-up buttons | Read tools still work; free-text limitations remain visible. |
| Attach an unreadable/scanned PDF | Do not infer completion; ask for a usable XLSX or readable export. |
| Ask for an unsupported approval, policy or timetable guarantee | State the limit and the missing evidence. |

## Record outcomes

For each attempt record: exact prompt, task selected, missing-information request, factual correctness, whether the user completed their task, response time and any repeated/unhelpful answer. Include typos, short messages and corrections from actual users. Convert failures into regression cases before changing routing. Test repeated paraphrases, not just one prompt per task.

Passing guided button tests is not the same as passing open-ended language tests. Maintain both. Do not describe the chatbot as university-ready until task-completion and factual-error rates have been measured on representative user sessions.

## Conversational response implementation

Read-tool results now pass through a final Ollama response step. The model writes a short contextual introduction; the server retains the calculated unit list, credits, requisite results and completion facts. Invalid model output, additional tool proposals, timeouts and outages fall back to the verified answer. Saves retain their original receipt and confirmation behavior.

Students can refer to recorded units by code, full name, partial name or a minor spelling error. Ambiguous names produce clickable unit choices. “Is it offered?” can refer to the last resolved unit. A new draft or DPA clears stale unit focus while keeping the requested destination major. Missing names and duplicate unit versions require clarification.

Semester answers show a concise provisional notice and expose the full check notes under “Details of checks and assumptions”. Essential uncertainty about missing rule/category records remains visible. The workspace shows controls and structured details; the narrative answer appears in chat.

Additional human cases: “can I take cloud computing instead?”, “what about security?” when several units match, “is it offered?” after a lookup, “tell me about FYP B”, and replacing the DPA before asking about a previously discussed unit. Confirm that the current planner, DPA and semester are used each time.

## Compare local models

Run `node --env-file=.env scripts/evaluate-chat-models.cjs --models=llama3.2:3b,qwen2.5-coder:7b` with Ollama running and those models installed. It uses the same synthetic routing and response cases for each model, records latency and fallback use, and writes reports under `docs/evaluations/`. It does not download models or change configuration. Optional `OLLAMA_ROUTER_MODEL` and `OLLAMA_RESPONSE_MODEL` allow separate models after evaluation; both otherwise use `OLLAMA_MODEL`.

The attempted comparison in this implementation session could not run because the local Ollama service refused connections. No model-performance claim or default-model change was made. Automated route success is not a naturalness score: review the saved replies and run the human cases above before choosing a model.

## Evidence checks and refusals

The chatbot now distinguishes verified answers, requests for missing information and refusals. It does not use a model-generated confidence percentage. Unsupported questions receive “I am unable to answer this question reliably with the information available.” Official approvals, graduation decisions, fees, scholarships, teaching staff and year-specific availability require information the current system does not verify.

The general-answer route no longer generates unrestricted LLM prose. It returns relevant current records or curated definitions and feature instructions. An unrelated DPA attachment, earlier conversation keyword or loosely matching guide cannot authorise an answer. Unknown and duplicate unit references request clarification. Unreadable tables require a usable XLSX rather than inferred completion.

Tool introductions use an enum of approved sentences. Any unexpected generated wording falls back to the verified body. Personal eligibility replies decline to confirm eligibility when prerequisite or other rule evidence is incomplete. Provisional semester drafts remain available with their assumptions; they are not official enrolment decisions. Verified recorded blocks remain explainable.

| Additional test | Expected result |
| --- | --- |
| Ask about weather while a DPA and suggestion history are present | Refusal; no unrelated DPA summary or model/tool call |
| “Will the university approve my double major?” | Refusal; no approval inference from unit coverage |
| “Is COS20019 offered in 2028?” | Refusal; recurring offerings do not verify the year |
| “Who teaches COS20019?” | Refusal; no invented lecturer |
| Unknown unit code or duplicate versions | Clarification about the exact code/version |
| “Can I take [unit]?” with missing prerequisite records | Refusal to confirm eligibility; explain the evidence gap |
| A stored prerequisite demonstrably blocks the requested unit | Explain the recorded block, without issuing enrolment approval |
| Model returns an unsupported narrative or extra claims | Reject that prose; retain the verified result |
| “What is a double major?” | Curated conceptual explanation; no personal assessment |

Run `node scripts/test-answerability.cjs` and the existing chat regression checks. After building, `scripts/test-planner-tools.cjs` checks refusals through the real API, including proof that unsupported questions never reach the mock model. These checks establish the listed cases, not perfect intent recognition for every possible prompt. More conservative refusals can reduce coverage; record both false refusals and unsupported answers during human testing.
## AI availability panel

The chatbot header checks the app server's configured Ollama service. It checks both the routing and response models, including overrides. An installed model is labelled “response not tested”; **Check again** runs a small synthetic JSON response check before displaying **AI ready**. This sends no DPA or chat history. Successful inference is an availability check, not proof of academic accuracy. Checks have time limits and no model is downloaded automatically.

Test missing service, missing model, installed but failing inference, and successful inference. Open **Setup guide** and verify the download commands match the configured models. Users visiting a shared website should ask its host to perform setup; browser localhost is not checked. Model inference verification requires sign-in (or the existing development override).

Choose **Continue in planner mode** and ask for next-semester suggestions or run a workspace task. The app must bypass model calls while retaining its DPA processing, database tools, rule checks and evidence-based refusals. Chat messages and selections remain when switching modes. Choose **Use AI assistance** after availability is restored. A failed service check automatically uses planner mode until a subsequent check succeeds.

Regression: `node scripts/test-ai-status.cjs`.

### Model selection and hot swapping

In **AI & setup**, **Model for new requests** lists installed models on the app server. **Server default** shows the configured routing and response models; choosing another model uses it for both functions in this tab. The server checks that the selection is still installed before inference. Missing models are not downloaded automatically. Refreshing the page returns to the server default.

Selecting a model tests a synthetic response and warms it up, retaining the DPA, chat and workspace selections. A cold model can take up to 90 seconds per model; planning tools remain available while checking. Switching is disabled while a chat or workspace request is running. Thinking is disabled for the short JSON routing and introduction requests. Existing academic evidence checks still apply.

Test switching between installed models, then run a prompt and a workspace task. Both must use the selected model. Select **Server default** to restore the host configuration. Delete a selected model externally and verify the app requests a fresh check/selection rather than silently downloading it. Other browser tabs and the server defaults must remain unchanged.


## Remaining course requirements

After a DPA explanation, ask "what i need to take next to complete studies", "Which units remain to finish my degree?", or "What units do I need to graduate?". These planning requests use the semester tool even without a working model. Requests to confirm official graduation eligibility must still be refused.

The reply uses the confirmed planner, or a provisional highest-overlap match, and compares earned units against the stored category requirements. It reports completed and remaining slots, unfinished options and recorded blockers before discussing later semesters. An elective pool with its required count fulfilled must not require all remaining alternatives. Missing category counts must be labelled unknown; AE placeholders outside the planner must not be silently allocated. N is unfinished; EXM with sufficient earned credit can fulfil its matching unit. A failed earlier attempt must not undo a later earned pass.

The next-semester draft continues to enforce the existing four-unit/50 CP cap, recurring offerings, prerequisite checks and Project A before B. It is not a complete multi-semester graduation schedule or official course audit. Exemption applicability, unknown category counts and missing academic records still require confirmation.

Run `node scripts/test-course-completion.cjs` and, after building, `node scripts/test-planner-tools.cjs`.

### Shared DPA planner matching

The chatbot's default unit suggestions and the Unit Suggestions screens use `rankPlannerMatches` from `src/app/libs/plannerMatching.mjs`. It compares distinct completed codes against every saved planner, sorts by match count, and preserves the catalogue order for ties. It does not exclude planners whose categories are named Data Science Major or Artificial Intelligence Major. Earned-credit sufficiency remains a separate scheduling check.

Test: upload a DPA and ask "highest match planner for this dpa". The reply must show ranked planners through `match_dpa_planners`, not repeat the transcript summary. Earlier AI-major requests and confirmed planner selections must not filter this explicit all-planner ranking. Choose your actual planner in the workspace to use it for subsequent unit suggestions. A match cannot prove your intake. Generic AE exemptions are not silently mapped to specific codes.

Regression: `node scripts/test-planner-matching.cjs` and `node scripts/test-planner-tools.cjs`.

### Elective slot allocations supplied by the project owner

For the chatbot course-completion audit and semester suggestions, completed ICT20016 (Work Integrated Learning Placement - ICT, 3 month) with 25 earned CP fills two elective slots. Each completed approved-elective DPA entry AE1, AE2, etc. with at least 12.5 earned CP fills one elective slot. Placement can also satisfy its own recorded WIL category; total earned CP remains counted once. These allocations do not substitute for specific core or major units and do not change the code-overlap planner ranking. Unrecognised exemptions still require mapping. If multiple elective categories cannot be resolved, the rule does not choose one arbitrarily.

Test: placement + AE1 + AE2 + AE3 + one ordinary elective fills six elective slots. A six-slot elective category should show zero remaining and semester suggestions should omit additional electives. Failed N, zero earned credit and unfinished non-exempt attempts must not be allocated. Test placement in the elective pool itself to ensure its two slots do not become three.

Regression: `node scripts/test-elective-completion.cjs`.

### Download suggestions as a PDF

Each new chat or workspace suggestion reply with at least one selected unit has a Download suggested planner PDF button. The PDF contains the exact reply's planner, assumed semester/year, suggested units and credits, category progress, elective allocations and planning assumptions. It is a next-semester draft, not a full course schedule or enrolment approval. Downloads are generated locally in the browser and do not send the DPA to another service. Old downloads retain their original suggestion snapshot after a new planner is selected. Asking to download/export a PDF presents the latest suggestion's download button; after changing the DPA, this request generates a fresh suggestion instead of reusing the old attachment's draft. Zero-unit and refused results do not offer a PDF.

Checks: download from both a chat prompt and Update suggestions in the workspace. Compare PDF codes, credits and planner with that reply. Change planner and check the old reply's download stays unchanged. Test a new DPA, no DPA, an empty draft and a multi-page warning list. Regression: `node scripts/test-chat-planner-pdf.cjs`.

PDF button visibility: the latest available export has a persistent bar above the message list, and each suggestion places its download button above the answer text. Replies restored from older chat storage may lack structured PDF data; Prepare planner PDF rechecks their planner and semester via the tool and adds a new downloadable result. Repeated identical workspace answers merge their export metadata rather than silently retaining an old reply without a download. Refresh the browser after updating the app to load the new controls.

DPA review simplification: the main chatbot no longer displays the Review completed DPA entries panel or asks students to confirm the extracted rows. It uses the attached table directly; N/failed exclusions, EXM completion and earned-credit checks remain automatic. Stale manual corrections from older chat sessions are cleared rather than silently applied. Double-major checks require an attachment and the actual primary planner selection, but no DPA-review checkbox.

### Practical planning workflow

- Ask "Plan until I finish" or use Plan until completion above the chat. `plan_remaining_studies` drafts up to 16 recurring semesters, assuming successful passes only in subsequent terms. Four units/50 CP remain the maximum; category counts and placement/AE allocations apply. Empty terms are retained; two consecutive empty terms stop the draft with unresolved requirements. Missing category counts never produce a verified completion claim.
- Ask "Only two units next semester", "I don't want this elective", "Move COS40005 to Semester 2" or "Reset planning preferences". Workload, elective exclusions and deferrals are stored in the current planning context and recalculated. Ambiguous unit choices ask for a code. Core/major units cannot be removed as elective choices. Change planner/semester opens the existing workspace controls.
- Ask "Why wasn't Project B suggested?" or "Why wasn't COS40006 selected?". The tool rechecks the same planner and preferences and explains completion, missing prerequisites, offerings, category space or workload limits. Explaining a full pathway should preserve pathway mode.
- Use Saved plans > Save current draft, or say "Save my plan". Drafts persist in this browser under the signed-in account's key, separately from Clear chat. The raw uploaded DPA is not stored in the draft library. They are not synced to another browser/computer. Recheck with current DPA compares the saved scheduled codes with fresh suggestions and lists now-earned, newly scheduled and no-longer-scheduled codes. Download an older snapshot without changing it; delete a draft locally when no longer needed. Storage failures must show an error.
- Current planning context above the conversation shows planner, provisional/confirmed status, semester/year and workload. A workload adjustment must not convert a provisional planner match into a confirmed enrolment selection. PDF export includes each semester for a pathway and keeps initial DPA progress separate from hypothetical passes.

Tests: `node scripts/test-study-plan-workflow.cjs`, `node scripts/test-chat-planner-pdf.cjs`, `node scripts/test-planner-tools.cjs`. Human journey: upload DPA, pick planner, draft pathway, reduce workload, defer Project A, explain Project B, save, upload a later DPA, recheck saved draft and download. Verify that a missing prerequisite, unknown rule grouping or category requirement produces a partial pathway rather than an invented completion date.

### Automatic double-major check shared with the checker page

`check_double_major` now calls the same `doubleMajorPathway` calculation as `/api/double-major-pathway`. It automatically chooses a primary planner using completed-code overlap and a different second major using earned units outside the primary core/major pool, including completed primary electives matching secondary-major codes. Named categories such as Artificial Intelligence Major and Data Science Major are recognised. Copies of the same major across intakes are grouped, even when their unit pools differ. Matching core pools does not select the second major.

The double-major draft schedules the two major pools only. Core/WIL/overall degree completion remains a separate study-plan task. The answer lists coverage, remaining major options, elective-to-major matches, future semesters and unresolved rules. There is no required primary confirmation step. Overrides remain optional. Exact earned-code matches can count in a major even if that unit was an elective in the primary planner; generic AE placeholders do not replace particular major codes. N remains failed. Unknown major requirement counts do not establish complete coverage.

Regression: `node scripts/test-double-major-electives.cjs`, `node scripts/test-double-major-pathway.cjs`, `node scripts/test-planner-tools.cjs`. Test a DPA with all AI units and several DS units counted as primary electives; DS should be selected over a planner sharing only core units. Chat and the checker must return the same pair, coverage and semesters for the same DPA and starting term/year. An already covered pair should report no additional major units needed, while retaining the distinction from official graduation approval.


### Completion questions without prescribed wording

Completion requests such as "what should I take to complete my study", "what do I need to finish my studies", and "what units do I need to graduate" now run the same full-pathway tool as "Plan all remaining semesters until I finish". No exact command is required, and these tested phrasings work when the intent model is unavailable. Explicit "next semester" requests still produce a single semester plus the remaining-requirements audit. With no DPA, the completion tool asks for an upload and describes the full pathway it will build. Official graduation approval remains outside the chatbot's scope.

Validation: `node scripts/test-study-plan-workflow.cjs` covers paraphrases, confirmed planner preservation, requested major, single-semester scope and refusal/negation boundaries. Keep adding real user-test phrasings to this regression suite when routing errors are found.
