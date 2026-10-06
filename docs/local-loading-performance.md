# Local loading measurements

The running server was `npm run dev` / Next.js development mode. Localhost removes internet latency for local requests; it does not remove compilation, database work, JavaScript parsing or client permission loading.

Measured during this investigation (one small local sample, not browser task-completion times):

| Measurement | Development | Production |
| --- | --- | --- |
| Warm dashboard HTML response | 274 ms | 9 ms |
| Warm assistant HTML response | 222 ms | 6 ms |
| Warm double-major HTML response | 208 ms | 7 ms |
| Dashboard script sizes, decoded/uncompressed total | 21.0 MB | 1.48 MB |

The first development planner API request took 2,076 ms; the next took 222 ms. On-demand compilation and process warm-up contribute to first-request delays. Production also has cold startup overhead: its first dashboard request took 1,614 ms. HTML timings exclude downloading scripts, hydration, client data requests and rendering. Script totals include all script tags found in HTML; browser caching and compression affect actual transfer sizes.

Changes made:

- Removed the parser-blocking SweetAlert CDN script from the root layout. Existing `window.Swal` users receive the installed local package through ClientLayout, preserving popup behavior without an internet-hosted script on every page.
- Reused the initial role list when resolving the initial role ID. Permission initialization now needs two sequential API requests rather than three. Role changes still fetch current role data; permission checks and server authorization remain in place.
- Local/dev account display can appear without waiting for MSAL initialization. Authenticated pages still retain their existing session validation and server checks.

For lecturer testing, stop the development server, then run:

```powershell
npm.cmd run build
npm.cmd start
```

The latest build already passed during this investigation. Rebuild after subsequent source changes. Use `npm.cmd run dev` when editing code and automatic rebuilding is wanted. Development and production use separate output folders; do not run both on the same port.

Repeat read-only page/script measurements with `node scripts/measure-local-loading.cjs http://127.0.0.1:3000`. These checks do not send a DPA or mutate database records. LLM response time is a separate issue: local inference can take seconds depending on the model and hardware, even when page navigation is fast. No live model-latency measurement was made in this investigation.
