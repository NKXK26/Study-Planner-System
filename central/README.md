# Official planner catalogue

```mermaid
flowchart LR
    HOD[Admin or HOD browser] -->|HTTPS and named account| API[Publishing service]
    API -->|Prisma| PG[(PostgreSQL revisions and audit events)]
    PC[Student desktop Next.js server] -->|GET /catalogue| API
    PC --> Cache[(Published catalogue cache)]
    DPA[DPA on student device] --> Match[Local recommendation]
    PC --> Match
    Match --> Local[Local receipt and optional export]
```

## Configuration

| Where | Variable | Value or purpose |
|---|---|---|
| Publishing host only | `CATALOGUE_DATABASE_URL` | `postgresql://<user>:<encoded-password>@<host>:<port>/<catalogue-db>` plus the TLS options required by your host |
| Publishing host only | `CATALOGUE_PUBLISHERS` | JSON such as `{"<publisher-login>":{"role":"HOD","hash":"<scrypt-hash>"}}`. Roles accepted for writes are Admin and HOD. Assign a separate login to each person. |
| Publishing host | `HOST` | Defaults to `127.0.0.1` locally. The staging service binds to `0.0.0.0`. |
| Publishing host | `PORT`, `CATALOGUE_PORT` | The first configured port wins in this order. The local default is 4100. Render supplies `PORT`. |
| Desktop or Next.js server | `PLANNER_CATALOGUE_URL` | `https://<catalogue-host>/catalogue`. HTTP is accepted on localhost for development. |
| Next.js server | `PLANNER_CACHE_DIR` | Optional writable cache directory. Electron sets a directory under userData. |
| Test process only | `CATALOGUE_TEST_URL` | Connection to a migrated disposable PostgreSQL database. Integration tests insert historical test revisions. |
| Existing app | `DATABASE_URL` | Existing local SQLite connection. Electron supplies it at launch. |

The central Prisma schema uses the PostgreSQL connector. Select the PostgreSQL-compatible hosting provider through the connection URL. SQLite has its own schema and generated client. The central service runs as a separate process and takes configuration from its environment. Keep publisher hashes and database credentials on that host.

## Local development

1. Use the staging Node version (24.14.1), which runs the generated ESM TypeScript client directly. From the repository root, install the isolated dependencies with `npm --prefix central ci --ignore-scripts`. Use an empty PostgreSQL database owned by a dedicated development user. With PostgreSQL installed locally, an administrator can run `createuser --pwprompt planner_dev` followed by `createdb --owner=planner_dev planner_catalogue`.
2. Set `CATALOGUE_DATABASE_URL` in the publishing terminal. The central CLI reads it from the process environment through `central/prisma.config.mjs`. Back up any database that already contains data. Run `npm --prefix central run generate`, then `npm --prefix central run migrate:staging`. These commands use Prisma 7 and the existing central migration history. The root package's Prisma 6 CLI and generated client serve SQLite, including the temporary SQLite contexts used by the publication test.
3. Generate a hash using the project's scrypt implementation. In PowerShell the following reads a password with a masked prompt. The command prints only the salted hash. Put it in the publisher JSON in your local process environment or secret manager.

   ```powershell
   $publisherCredential = Get-Credential -UserName '<publisher-login>' -Message 'Choose a unique catalogue password'
   $publisherCredential.GetNetworkCredential().Password | node --input-type=module -e "import {hashPassword} from './central/passwordHash.mjs'; let s=''; process.stdin.setEncoding('utf8'); for await(const c of process.stdin)s+=c; console.log(await hashPassword(s.replace(/\r?\n$/,'')));"
   Remove-Variable publisherCredential
   ```

4. Run `npm run catalogue:start`. Open `http://localhost:4100/manage` and sign in with the named publisher account. The read endpoint is `http://localhost:4100/catalogue`.
5. In the desktop development terminal set `$env:PLANNER_CATALOGUE_URL='http://localhost:4100/catalogue'` and launch the app. Each desktop needs only the read URL. For installed Windows apps, set the user environment variable and relaunch the app from an environment that has picked up the change.

## Render staging

**Use this configuration only for temporary staging. It must not hold the production official planner catalogue.** The Blueprint uses the `free` plan for both the Node web service and PostgreSQL 16 in Singapore. Automatic deployment is disabled (`autoDeployTrigger: "off"`).

The free web service sleeps after 15 minutes without inbound traffic. The next request wakes it, which can take approximately one minute. Free PostgreSQL expires 30 days after creation and has no managed backups. [Render free-plan limits](https://render.com/docs/free)

1. Generate a unique publisher password hash locally using the PowerShell command above, from the repository root. In the Render dashboard, supply `CATALOGUE_PUBLISHERS` as a secret JSON object in the format shown in the configuration table. Give each named operator the role Admin or HOD. Keep the plaintext password in their password manager.
2. When authorised to deploy, review the intended revision and select `render.yaml` in the Blueprint setup. The Blueprint pins `NODE_VERSION=24.14.1`, sets `NODE_ENV=staging` and `HOST=0.0.0.0`, and obtains `CATALOGUE_DATABASE_URL` from the staging database's internal connection string. The empty PostgreSQL external IP allowlist (`ipAllowList: []`) blocks external connections. Keep local Docker credentials on the development machine.
3. Confirm the following commands run in `central/`. Prisma generates the ESM client in `generated/client/`. The service connects through `@prisma/adapter-pg`, which owns the PostgreSQL connection pool.

   | Phase | Command |
   |---|---|
   | Build | `npm ci --ignore-scripts && npm run generate` |
   | Start | `npm run migrate:staging && node server.mjs` |

   Free staging has no `preDeployCommand`. On each start, `npm run migrate:staging` validates the configuration and applies pending central Prisma migrations. The server starts only if that command succeeds. In a private operator session, run `npx --no-install prisma migrate status` from `central/` to check migration history. Keep connection details out of shared logs.
4. Verify the HTTPS endpoints using the staging hostname. An unauthenticated health check returns HTTP 200 and `{"status":"ok"}` after a database query, or HTTP 503 and `{"status":"unavailable"}` if PostgreSQL is unreachable. A fresh catalogue returns HTTP 200 and `{"data":[]}`. Anonymous management access should return HTTP 401.

   ```powershell
   curl.exe -i https://<staging-host>/health
   curl.exe -i https://<staging-host>/catalogue
   curl.exe -i https://<staging-host>/manage
   ```

5. Use a named staging publisher over HTTPS to create a synthetic draft. Verify it appears only in the authenticated console, then publish it and verify it appears at `/catalogue`. Browsers access the HTTP service. Only the service connects to PostgreSQL. Use synthetic planner definitions for staging. DPA, transcript and local SQLite files belong on the originating device.

**Backup and rollback.** Keep a reproducible copy of synthetic test data outside the free database. Before a schema change, take a manual export of any staging data you need to retain and verify that it restores into a separate private test database. Review migration compatibility with both the running and incoming service. If a deploy fails after a migration, rolling back the service revision leaves the database at the migrated schema. Roll back the service only when compatible. Otherwise pause publishing, apply a reviewed forward fix or restore into a separate database, then verify health, revision history and publications before switching the internal connection. A restore can lose writes since the backup.

**Paid production deployment.** The current minimum paid plan IDs are `0.5c-512mb` for the web service and `0.1c-256mb` for PostgreSQL. On a paid production web service, run migrations in `preDeployCommand` and use `node server.mjs` as the start command. [Render Blueprint reference](https://render.com/docs/blueprint-spec)

**Publisher authentication.** Basic authentication is for staging over HTTPS. Browsers cache credentials, and the service has per-process rate limiting with no MFA. Close the private browser session after use. Rotate the named publisher's hash in the dashboard and restart to revoke the old password. Production HOD access requires university SSO with MFA and a verified Admin/HOD role before enabling publishing.

## Import local planners

1. Close the source app and make a consistent SQLite backup with SQLite's backup command or an equivalent backup tool. Keep this private on the source device, including when the database contains student records.
2. With the local and central Prisma clients generated, run `npm run catalogue:import -- prepare <private-sqlite-backup> <new-review.json>` on the source device. This reads planner definitions and writes a new file containing planner data only.
3. Review the JSON array. Select the official records, set the verified course code (for example BA-CS), confirm intake year/month and major, and supply any missing template requirements, unit categories or credits. Preserve offered terms, requisite operators, prescribed elective title markers, WIL code and equivalent codes. An intake inferred from a planner name needs HOD confirmation. Transfer only the reviewed catalogue JSON to the publishing host.
4. On the publishing host, run `npm run catalogue:import -- apply <review.json> <new-backup.json>`. The importer verifies all snapshots first, saves both central tables to a new private backup file from the same database transaction, then creates drafts. A backup write failure aborts the import. Use a fresh backup filename on each run. A duplicate or conflicting course/intake/major series is reported and skipped. Review conflicts through the revision workflow.
5. Keep normal PostgreSQL backups for disaster recovery. The import backup is a JSON record of pre-import contents. Use PostgreSQL backup/restore tooling for a full database restore.

## Publish, revise, archive and restore

Open **Manage official publications** on the Study Planners page, or visit the publishing host's `/manage` URL directly. Local Maker edits are working copies. For a planner saved in Maker, select **Export for publication** beside the local working copy. In the console choose **Load exported planner**, select that JSON file, confirm the course, major and intake, then create the draft. The same editor accepts an individual definition from the reviewed bulk import.

- **Create new series** creates version 1 for a distinct course, major and intake. The definition editor accepts the same JSON object as a single reviewed import entry.
- Select a draft, review its metadata, unit list, requirements, credits, offerings and requisites, then **Save draft**. Click **Publish draft** and confirm to make the saved definition available. Save any outstanding edits before publishing.
- For a correction, select the prior revision and click **Create revision**. Edit and publish the new draft. Publication supersedes the previous active revision in one transaction.
- **Archive** withdraws a revision from new recommendations. To restore its content, select the archived revision, create a revision and publish the resulting draft. The console retains the content and event history of older revisions. Concurrent edits are rejected with a reload message.

## Student use and audit

The desktop fetches published planners on startup, on opening Unit Suggestions, on reconnect, and at DPA comparison. BA-CS matching uses structured intake and major metadata plus transcript and mapping evidence. An active comparison uses the catalogue selected at upload. Upload again to start a comparison against a later publication.

The catalogue service receives a read request and ordinary network metadata such as the caller's IP address. DPA files, transcript rows, student names, private mappings and generated schedules stay out of the catalogue service. Local recommendations record the revision ID, name, version and generation time in browser storage under `planner-recommendation:`. The XLSX graduation assessment includes its planner identity. The HOD can compare a student's shared export with the revision in the console.

A configured desktop can use its last successful catalogue for up to 24 hours when offline. A warning identifies the cached copy. Withdrawals reach an offline student at the next successful refresh. After cache expiry the app requires a connection. A desktop with no service URL displays local-only mode and continues using its existing local planners.

## Production setup for an authorised administrator

1. Provision a dedicated PostgreSQL-compatible database and enable encrypted connections and backups. Before applying migrations to an existing catalogue, take and verify a restorable PostgreSQL backup. Use a migration identity authorised to create the tables, trigger and indexes.
2. Install the reviewed project and dependencies on the service host. Generate the central Prisma client for that host and deploy the migration as above. Run the service with a dedicated runtime database role with SELECT/INSERT/UPDATE on revisions, SELECT/INSERT on events, and sequence access. Keep schema ownership and DDL privileges with the migration role.
3. Integrate university SSO and MFA for production publishers. Enforce the authorised publishing role on the server. Run the service under a supervised OS account behind HTTPS and disable request-body and Authorization-header logging.
4. Import and approve the first catalogue. Check the public read endpoint and a student comparison on a separate machine. Distribute the URL to desktop installations. Existing desktop builds need the catalogue-enabled software once. Subsequent planner publications use the service independently of Electron releases.
5. For verification on a disposable database, migrate it with the central schema, set `CATALOGUE_TEST_URL`, then run `npm run test:catalogue`. Never point the integration test at a production catalogue.


## Implementation files

Paths are relative to the project root.

| Files | Purpose |
|---|---|
| `central/schema.prisma`, `central/migrations/202611200001_catalogue/migration.sql`, `central/migrations/migration_lock.toml`, `central/.gitignore` | Separate PostgreSQL client, additive catalogue schema, revision protection and generated-client exclusion. |
| `central/model.mjs`, `central/server.mjs`, `central/manage.html` | Definition validation, transactional lifecycle, audit events, authenticated management UI and public read API. |
| `central/import.mjs`, `src/app/libs/publicationDraft.mjs` | Prepare planner-only exports and import reviewed drafts with backups and conflict reporting. |
| `central/test.mjs` | Integration coverage using a real service, PostgreSQL and independent SQLite files and caches. |
| `electron/server.js`, `src/app/ClientLayout.jsx`, `src/middleware.js` | Per-user cache location, startup and reconnect refresh, catalogue notices and student read access. |
| `src/app/api/official-planners/route.js`, `src/app/libs/officialCatalogue.mjs` | Fetch published revisions, isolate and expire the cache, provide offline status and adapt snapshot units to the existing planning code. |
| `src/app/api/study-planner/route.js`, `src/app/libs/readLocalCatalogue.mjs` | Reuse one local definition projection for legacy installations and imports. Route configured temporary student reads to publications. |
| `src/app/view/study-planner/page.js`, `src/app/view/compare_study_planner/page.jsx`, `src/app/view/unit_suggestion/UnitPoolToolbox.js` | Access the publisher, export local definitions, match and schedule against one catalogue, record the revision and show sync status. |
| `src/app/libs/bcsPlannerRules.mjs`, `src/app/libs/plannerIntake.mjs`, `src/app/libs/doubleMajorPathway.mjs` | Use declared cohort, major and WIL metadata and planner-scoped mapping evidence. |
| `src/app/api/study-planner/validate-schedule/route.js`, `src/app/api/compare-planners/route.js`, `src/app/api/graduation-eligibility/route.js`, `src/app/api/double-major-pathway/route.js` | Validate and compare official revisions and evaluate requirement coverage. |
| `src/app/api/unit-rag/route.js`, `src/app/api/unit-replacements/route.js` | Use published unit pools when searching for replacement candidates. |
| `src/app/api/planner-assistant/route.js`, `src/app/api/planner-assistant/planning/route.js`, `src/app/libs/plannerTools.server.js` | Supply the assistant with published planner and unit data and route official edits to the publishing console. |
| `package.json`, `package-lock.json`, `README.md`, `central/README.md` | Declare schema validation dependency, expose commands and document setup and operation. |
