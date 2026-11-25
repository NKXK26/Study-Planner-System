# Packaged desktop verification

Date: 25 November 2026

Result: PASS.

The final test used the electron-builder resource tree, its own Node 20.18.0 executable, an empty child-process PATH, and a disposable database. A headless Edge browser blocked external HTTP requests.

Verified:

- Ten application pages and their JavaScript loaded.
- The packaged PDF worker, standard font and CMap files loaded from the same application origin.
- Planner catalogue, unit, planner, template, unit-type and dashboard APIs returned successful responses.
- Unauthenticated planner-tool requests were rejected.
- AI status reported the unavailable model service without breaking recorded planning functionality.
- A synthetic two-page PDF returned both coloured rows and both unit codes.
- Invalid PDF input returned a controlled error.
- Chat DPA extraction and recorded planner questions returned results.
- Browser colour mapping, local-worker text extraction and review of both unit inputs completed without uncaught browser errors or API traffic to localhost:3000.

Original stdout: smoke.log. Packaged-server stdout/stderr: server.log. Browser screenshot: artifacts are retained outside Git at tmp/packaged-smoke-FD0MIm/offline-pdf-upload.png.

These are workflow smoke checks. No independent assertion count or code-coverage percentage is claimed. The separate regression and integration reports retain their own assertion ledgers. Microsoft sign-in, email delivery, live-model quality and all possible PDF layouts were not established by this run.
