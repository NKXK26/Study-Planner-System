# Study Planner Assistant

Dashboard **Ask AI** opens the main chat at /view/ai-assistant. The chat contains searchable interactive task forms, DPA review and explanations, and provisional semester planning. Messages and unsaved drafts are held in React memory; reloading or leaving the page resets them.

## Tool calling

The assistant supplies a fixed read-tool schema to Ollama's /api/chat. The backend validates returned function names and arguments and runs only the allowlisted local handlers. Common planning requests also use deterministic routing, so those tasks remain usable when the model is offline or does not support tool calling. Uploaded text is evidence, never executable instructions.

The tool layer reuses the existing comparison, planner, template, replacement-candidate and double-major functions. It returns verified structured results directly to the chat. It does not give the model arbitrary HTTP, filesystem or database-query access. Model-selected tools cannot save or delete records.

## Available tasks

| Task | Actions in chat |
| --- | --- |
| Differentiate planners | Search/select two exact records, or type names/IDs; show shared, exclusive and category-changed units |
| Templates | Select an existing template, inspect/edit its category counts, or create a template |
| Upload planner | Extract unit codes from a searchable PDF or one-sheet XLSX, match existing units, review categories and save a new unit pool |
| Unit suggestions | Request provisional semester planning through the DPA review card, or find title-based replacement candidates |
| Planner maker | Copy an existing pool or choose units and categories manually, link a template, save a reviewed draft |
| Planner management | Load an exact planner, inspect its units, edit category assignments and its linked template |
| Double major | Upload and confirm DPA evidence, resolve tied primary matches if needed, and view ranked second-major coverage options |

Planner file import extracts a unit pool. It does not reproduce semester placement or PDF colour/category rules. Unmatched or ambiguous unit codes are reported for manual review; unknown units are not invented. Deletion and renaming existing planners are not chat tools.

## Authentication and safe saves

The tool endpoint requires a verified signed session and an active database role with the matching planner/course/study-plan permission. The existing server DEV override is retained. UI capability flags disable save actions for read-only accounts, and the server rechecks each action.

Saving requires a deliberate reviewed-form click. A request ID makes retries return the same saved result for ten minutes within the running server process. The same ID cannot be reused with a different payload. These receipts are in memory, not a durable cross-server transaction log. Drafts and selections survive request failures.

Template updates check the version inside their transaction. Planner updates check the current template and category snapshot, verify each row belongs to that planner, and commit all changes together. Stale or invalid changes are rejected.

## Academic evidence

DPA uploads use PDF text extraction or a recognised XLSX transcript table. N and Failed attempts do not count as completed; EXM requires recorded earned credit. Corrections require reasons and confirmation. Follow-up planning recomputes from raw evidence and stored unit properties, not a client-generated result.

Semester drafts account for category counts, credit requirements, prerequisites, co-requisites, recorded recurring offerings and workload limits. Missing or ambiguous rules are held for review. Double-major results measure major-unit coverage and do not establish programme compatibility or graduation approval. Title similarity does not establish an approved replacement.

Official sources and advisor-review export remain deferred as requested. The configured Ollama model defaults to llama3.2:1b. Tool support depends on the installed model; the deterministic task forms do not depend on it. A custom OLLAMA_URL sends generation evidence to that configured host.

## Verification

Run node scripts/test-planner-tools.cjs after npm run build. It starts the standalone app with a disposable database copy and a controlled model server, exercising real handlers and tool responses without modifying the source database. Existing chat, DPA, double-major and academic-planning regression scripts remain applicable.

DPA upload lives inside Explain My DPA, Unit Suggestions and Double Major Checker. Prompts can open these tasks. The composer has no upload or quick-suggestion strip.

## Practical workflow fixes

Task drafts, messages, attached evidence and review settings resume from account-scoped browser session storage. Clear chat discards them. This is session recovery, not a cross-device history service. Switching tasks preserves separate drafts. Uploading a DPA retains messages and resets its review; evidence is revalidated on each server action.

DPA-only tasks show review controls; programme/workload forms appear only for semester suggestions. Primary major selection always requires student confirmation and permits correction beyond the highest-overlap matches. Commands such as ?use three units, maximum 37.5 CP in semester 2 2027? update the planning form for review. Imports support worksheet selection, explicit category text recognition and bulk assignment to unassigned rows. Semester placement and PDF colour-only categories still require the dedicated planner workflow; chat imports save unit pools.

Recovery failures now show an alert. Save request IDs are stored synchronously before submission and completed saves are tracked across refreshes within the account browser session. Saves are held if a retry ID cannot be retained safely. Server receipts still expire after ten minutes and do not survive a server restart; record-name and version validation remain additional protections.

Negated/hypothetical planning instructions do not mutate settings, and a planner ID is not interpreted as a year. Double-major options are returned without a five-record cap and can be searched and expanded in the chat. Reading earlier messages disables forced scrolling, with a Jump to latest control. Explain My DPA does not load the planner tool catalogue.

## DPA-only next-semester suggestions

A suggestion prompt opens upload, and attaching a DPA automatically runs the suggest_next_semester tool without programme/intake/year/workload fields or a mandatory confirmation checkbox. Reviewed corrections are used when confirmed; unconfirmed corrections require review before recalculation. Planner selection uses earned-unit overlap through the existing ranking function, with ties explicitly labelled as provisional and an optional planner override.

The automatic mode reuses semesterPlan, recorded unit relationships/offerings, and shared four-unit/50 CP constants from the existing unit-suggestion helpers. Failed N attempts remain unfinished and earned EXM exemptions count as complete. Project B cannot be selected without earned Project A, including the stored SWE/COS project sequences. It returns fewer than four units if recorded constraints prevent filling the workload.

Unlike strict manual planning, automatic suggestions explicitly assume no extra prerequisites where none are recorded and use the unfinished category pool if template counts are unavailable. These assumptions appear in the answer. Incomplete requisite relationships, missing offerings/credits and unpublished units remain held or blocked. The next regular semester is a labelled calendar assumption using Malaysia time; an optional semester override is available. These are provisional suggestions, not verified enrolment approval.

## Destination-major follow-ups and chat layout

Suggestion requests preserve explicit destination-major intent. ?Shift to AI? filters to CSAI/Artificial Intelligence records before ranking earned-unit overlap; later suggestion questions retain that destination until cleared or explicitly overridden. Unknown destinations produce a clarification instead of repeating the old major. Selection remains provisional across intake ties.

Task controls, attachments and optional review live in a right sidebar beside the conversation on desktop, with independent scrolling. On smaller screens they use a collapsible, height-limited panel; successful suggestion responses collapse that mobile panel. Auto-upload generation uses a content identity instead of object reference identity, and consecutive duplicate automatic tool replies are suppressed.

## Context-aware intent interpretation

Free-text requests now reach a bounded Ollama intent step before keyword fallbacks. It proposes an allowed read tool, a conversational answer, or one clarification, using the last six turns, workflow and current suggestion destination. DPA content is not sent to this routing step. Proposed calls are schema-validated and record references must occur in user messages. Invalid JSON, unavailable models and timeouts fall back to deterministic routing. Definitions and negated tasks no longer automatically open workflows. Multiple destination alternatives ask for a choice.

The explain_next_semester tool rechecks the current DPA, selected planner and semester to explain selected/blocked unit reasons. It does not trust client-provided eligibility or a previous model answer. Chat retains planner/semester references for this follow-up. Tests exercise mock intent outputs and API wiring; these do not establish accuracy of the installed model on arbitrary language.

The router uses Ollama schema-constrained output via format, with a 12-second bound. Unknown argument keys and unspecified terms are discarded before tool validation; named records remain grounded. A live smoke check using the configured llama3.2:3b model correctly routed six synthetic prompts covering indirect suggestions, contextual comparison, explanations, major corrections, transfer direction and a definition. This is limited coverage, not a guarantee for arbitrary prompts.

## Connected side workspace

The assistant uses a two-column layout from 1024px: chat on the left, planning workspace on the right. Workspace and chat retain the same workflow, DPA, reviewed context and tool results without duplicating or remounting controls across layouts. Selecting tasks by prompt updates the workspace; running tools there posts the result in chat and follows the latest reply. The conversation header shows the current task and attachment, and an updating indicator appears during planning actions. Mobile controls collapse above the conversation, while desktop controls remain visible.

Workspace planner selections are passed as task-scoped context to intent routing. Commands such as compare these can reuse the current dropdown selections; explicit prompt arguments take priority and selections from a different task are ignored. IDs still pass tool validation, authentication and database resolution.

## Guided follow-ups

Every assistant reply displays up to three next steps based on the current task, DPA, reviewed corrections, selected planners and calculated draft. Only the latest reply is actionable, preventing earlier context from being reused. Supported read actions use explicit validated tool calls; upload/confirmation/selection buttons open the workspace with instructions. No model-generated actions or removed workspace tasks are offered. The explain_dpa tool reports parsed evidence directly, including excluded N attempts and earned EXM exemptions. Free-text questions remain available.

## Conversational tool replies and unit references

Both chat and workspace read requests now send the verified result back to Ollama as a tool message for a final conversational introduction. The calculated body remains server-generated. Narrative validation rejects quantities and academic approval claims; timeout, malformed output and model outage retain the verified body. Saves bypass this response step. Full planning warnings remain available in expandable check notes, with a short provisional notice and missing-record assumptions visible in the answer.

Unit references resolve explicit codes, exact titles, partial names and minor typos against current unit records. Exact titles take priority over fuzzy word overlap. Ambiguous names expose selectable unit choices; duplicate code versions require review. Named-unit eligibility rechecks the current DPA and planner, and a focused unit supports subsequent pronoun references. New drafts and attachments clear obsolete unit focus. Lookup and personal planning use the same requisite and offering properties as the Units API.

The configured model is unchanged. `OLLAMA_ROUTER_MODEL` and `OLLAMA_RESPONSE_MODEL` optionally separate routing from response writing. `scripts/evaluate-chat-models.cjs` compares installed models using identical synthetic conversations without configuration changes or downloads. The comparison attempted during this update was blocked by the offline local Ollama service; run it after starting that service. See `chatbot-user-testing.md` for human cases and evaluation instructions.

## Answerability boundary

`plannerAnswerability.mjs` gates the current question before routing. Unsupported topics and unverifiable official decisions return the standard inability message. An attachment or old conversation topic cannot justify an unrelated reply. Short follow-ups require task context. Missing DPA tables, unit references and selections request clarification. Unknown yearly availability cannot be inferred from recurring semester records.

The general chat route now uses relevant server records or curated explanations instead of unrestricted LLM-generated answers. Tool results retain their calculated body. The response writer selects an introduction from approved sentences; unexpected wording or additional tool proposals never enter the answer. Eligibility questions with incomplete rule evidence refuse to confirm eligibility, while recorded blocks can still be explained. Read-tool responses include `answerability` as `verified`, `clarification` or `refused`; these describe evidence handling, not a confidence percentage or official approval.

The model still interprets task intent, so varied human prompts remain necessary to test false refusals and routing mistakes. These controls reduce unsupported answers; they do not establish universal language accuracy. Semester drafts remain provisional and retain their assumptions.
