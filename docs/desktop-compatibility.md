# Desktop and localhost compatibility

The desktop application runs the Next.js standalone server using its bundled Node executable. It must not depend on a developer's source directory, system Python installation, remote PDF worker, or an unrelated server on port 3000.

## Corrections

| Failure | Cause | Correction |
| --- | --- | --- |
| Upload Study Planner could not extract PDF colours | `/api/pdf-debug` spawned `python` and loaded `scripts/extract_colors.py` relative to the current directory. Neither dependency ships in the installer. | Render and inspect searchable PDF pages using the bundled `pdf-parse` and native canvas dependencies. No subprocess or temporary PDF is needed. Return coloured text blocks on all supported pages. |
| PDF text extraction depended on internet access | The browser loaded the PDF.js worker from cdnjs. | Copy the installed worker, CMaps and standard fonts into versioned public assets before development/build, and load them from the app's origin. |
| Some PDF routes could miss rendering resources after tracing | Worker and canvas ICU files were explicitly included only for the chat document endpoint. | Include the same resources for `/api/pdf-debug`. Declare canvas as a direct application dependency. |
| Electron development could miss styles, JavaScript and public files | Next standalone does not automatically contain `.next/static` or `public`. | A post-build script copies both asset trees into the standalone application. |
| Electron opened the wrong application or failed when localhost:3000 was occupied | Startup tested only whether a TCP port accepted a connection, then opened a fixed URL. | Choose an available loopback port, verify a per-start token through the owned server's health endpoint, and open that URL. |
| Browser APIs could still target the build machine's localhost URL | `NEXT_PUBLIC_SERVER_URL` is compiled into frontend code; setting it only when launching Electron does not rewrite those bundles. | Build application API/navigation URLs relative to the current origin. |
| Electron development could spawn another Electron process instead of Node | `process.execPath` points to Electron in desktop development. | Set `ELECTRON_RUN_AS_NODE` for the server child. |
| Startup errors were difficult to diagnose outside a terminal | Main-process console messages were not consistently written to a file. | Forward startup and server messages through electron-log. |
| Uploaded units silently missed database enrichment | The upload page requested the nonexistent `/api/units` route and caught the resulting 404. | Request the implemented `/api/unit` endpoint. |

Colour extraction samples the rendered background around searchable text. RGB values can differ slightly from authored fills because PDF colour management applies during rendering. The colour picker maps the returned colours. Scanned documents without readable text still require a searchable export. Supported planner uploads are at most 5 MB, 10 pages and 60,000 text characters.

## Repeatable checks

Run from the repository root:

```powershell
node scripts/test-pdf-colours.cjs
node scripts/test-desktop-runtime.cjs
node scripts/test-new-modules.cjs
npm run build
node scripts/test-new-modules.cjs --integration
node node_modules/electron-builder/cli.js --dir --win --config.npmRebuild=false --config.directories.output=tmp/desktop-package
node scripts/smoke-desktop-package.cjs tmp/desktop-package/win-unpacked/resources
```

The desktop runtime check opens local sockets. Run it with local network access allowed. Sandboxed socket restrictions can prevent the test server from accepting connections.

The packaged smoke check uses the packaged Node executable, packaged application files, an empty PATH, and a disposable copy of the bundled database. It checks page and JavaScript delivery, local PDF assets, database APIs, AI fallback, authentication and uploaded PDF extraction. The source database and installed user database are not changed.

The regression and integration runners save original logs, assertion ledgers and summaries under `docs/testing/runs/`. Assertion executions may repeat and do not measure complete code coverage. HTTP checks do not establish full browser usability, Microsoft sign-in, email delivery or the quality of an external Ollama model.

### Recorded verification on 25 November 2026

| Check | Result | Evidence |
| --- | --- | --- |
| Offline regression | 29 suites passed, 828 assertion executions | `docs/testing/runs/2026-11-25T11-07-48-720Z-regression/` |
| Built HTTP API integration | 1 suite passed, 391 assertion executions | `docs/testing/runs/2026-11-25T11-10-48-718Z-integration/` |
| PDF colour extractor on bundled Node 20.18.0 | Passed | `scripts/test-pdf-colours.cjs` |
| Packaged resources with empty PATH and disposable database | Passed | `tmp/desktop-package-smoke-final.log` |
| Browser upload with external HTTP requests blocked | Passed: both colours mapped, both pages extracted, local worker loaded, no traffic to a development server on localhost:3000, no uncaught page errors | `tmp/packaged-smoke-FD0MIm/offline-pdf-upload.png` |
| Production build and unpacked Windows packaging | Passed | `tmp/desktop-build-final.log`, `tmp/desktop-package-build.log` |

The first packaged smoke run also exposed the incorrect `/api/units` reference. The first browser harness looked for unit codes as plain text, whereas the review page uses editable inputs. The harness was corrected to inspect those input values. The final run used the corrected frontend and passed.

For the optional browser check, install Playwright in a testing environment or set `DESKTOP_PLAYWRIGHT_MODULE` to an available Playwright module. Set `DESKTOP_BROWSER_TEST=1` before running the packaged smoke script. This is testing tooling, not an application dependency. The browser check covers the upload workflow specifically, not every screen interaction.

## Running the corrected application

For desktop development use `npm run electron:dev`. For a new Windows installer use `npm run electron:build`. An existing installed executable does not acquire these fixes until rebuilt and reinstalled. No release is published by these commands.

A local corrected Windows installer was built at `artifacts/desktop-fixed/Student Study Planner Setup 1.1.0.exe` from the checked package. The installer header and SHA-512 against its generated update metadata were verified. It was not published to GitHub. Installing it on the user's profile was not automated.

The app prefers port 3000 but uses another loopback port if it is occupied. Open the URL returned by the desktop startup code rather than assuming a fixed address. The server health endpoint requires its startup token and returns no readiness information to other callers.
