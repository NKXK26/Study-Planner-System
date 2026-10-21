# In-chat planning

The dashboard widget and `/view/ai-assistant` use the same chat component.

- Attach one DPA PDF or XLSX (5 MB maximum), then send a question or use a quick prompt. Sending an attachment without a question requests an explanation and next steps.
- The attachment stays available for follow-up questions in that mounted chat. Replacing/removing it starts fresh to prevent mixing student records. Clear chat discards the attachment and history. It is not persisted across page changes.
- PDF extraction runs on the application server. Extracted text is sent to the configured Ollama service with the question. There is no application-level document storage.
- Searchable PDFs support up to 50 pages and 60,000 extracted characters. Scanned, encrypted and oversized files produce actionable errors; OCR is not implemented.
- XLSX requires one transcript worksheet with Course, Status and Earned columns. Grade and Course Title are optional. Multiple matching worksheets require a single-sheet export rather than silently choosing one.
- Exact comparisons require recognisable tabular status and earned-credit fields. Unclear PDF layouts remain available for AI explanation but do not become inferred completion records.
- Completed attempts are deduplicated, failures/future attempts excluded, and earned credit checked against planner units. Equally matching planners appear as choices in chat. Comparison is provisional and does not establish course/intake compatibility or academic approval.
- Unit-code questions can retrieve recorded requisite relationships and title-based replacement candidates. Replacement candidates are not approved equivalents.
- Model outages return computed DPA summaries and planner comparisons. Database outages preserve document explanation. Failed requests restore the question and retain the attachment for retry.

Configuration remains `OLLAMA_URL` and `OLLAMA_MODEL` (defaults: `http://127.0.0.1:11434`, `llama3.2:1b`). Existing authentication is required for chat and document uploads.

Verification:

```text
node scripts/test-chat-assistant.cjs
node scripts/test-planner-knowledge.cjs
node scripts/test-double-major.cjs
npm run build
```

The chat regression checks use controlled authentication/database/model failures and an actual in-memory PDF to test extraction without student data.


## Plan from an uploaded study planner PDF

The chat composer has separate **Attach DPA** and **Attach planner PDF** buttons. An uploaded planner is a session attachment, not a new database record. Ask "Plan 3 units per semester for me until finish" or "Plan 4 units per semester until I finish". Later workload changes reuse that uploaded source. Remove it to return to matching stored planners.

A DPA is optional: with one, verified completed/exempted entries are removed from the unfinished pool; without one, planning starts with no earned units. N/Failed entries remain unfinished. The same semester rules, category counts, elective slot allocation and PDF download work with this source.

The PDF reader uses table geometry and a category legend rather than treating every mentioned code as a curriculum unit. It recognizes colour-coded core/major/elective rows (including the supplied 22-S1-CSCS example) and explicit category columns. Recommended elective pools are choices: it fills only the stated number of elective slots. PDF prerequisite groups and explicit offerings are preserved; database unit properties supplement credits and recurring offerings. Recommended sequence terms are labelled assumptions where offerings are absent. Missing credits, unclear rules, unavailable units and source errors are held back. A self-prerequisite is flagged, never silently corrected. Partial pathways list unresolved requirements and omit trailing empty semesters.

Supported input: searchable PDF, up to 5 MB / 10 planner pages / 60,000 extracted characters, with readable unit tables and requirement counts. Scans, ambiguous categories and unsupported layouts request a better source rather than inventing requirements. Completely new codes can be planned when their PDF provides credits, requisites and semester information; a code alone is insufficient. Signatures protect extracted requirements from client tampering. Set a consistent server-only PLANNER_UPLOAD_SECRET for multiple server processes; without it, reattach after a server restart. Clear chat removes both attachments from session recovery.
