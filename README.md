# Student Study Planner System

A study planning and unit matching application for students and academic staff.

## Official study planners

See the [catalogue setup and publishing guide](central/README.md) for PostgreSQL setup, migration, HOD review, release and student offline use.

## Windows desktop app

The Windows desktop app packages the Next.js standalone server inside Electron and uses a per-user SQLite database. Releases are published on the [GitHub Releases page](https://github.com/NKXK26/Study-Planner-System/releases).

### End users: install a release

1. Open the [latest release](https://github.com/NKXK26/Study-Planner-System/releases/latest).
2. Download `Student-Study-Planner-Setup-<version>-x64.exe` and, optionally, `SHA256SUMS.txt`.
3. If verifying the download, compare the installer SHA-256 value with the matching line in `SHA256SUMS.txt`.
4. Run the installer. It installs for the current Windows user and creates Start Menu and desktop shortcuts. An administrator account is not normally required.
5. Start **Student Study Planner** from either shortcut. Published updates are checked automatically when the app starts; installing an update does not remove the local database.

The database and application state live in Electron's per-user application data folder. Schema upgrades back up the existing database before applying the supported in-place migration; they do not replace it with the bundled starter database. Uninstalling the app leaves this data in place. Back up important local data before uninstalling Windows user data manually.

### Developers: run locally

Requirements: Windows, Node.js 20, and npm. Desktop development and installer builds also require Python 3.12 with the standard SQLite module available as `python`.

```powershell
git clone https://github.com/NKXK26/Study-Planner-System.git
cd Study-Planner-System
npm ci
npx prisma generate
npm run dev
```

Open the local URL printed by Next.js. For the Electron desktop shell during development, build and run:

```powershell
npm run electron:dev
```

This uses the project's local development environment. Do not use development-mode overrides or development credentials for public releases.

### Developers: build an installer locally

On Windows x64, run:

```powershell
npm ci
npx prisma generate
npm run electron:build
```

The build forces production mode for the packaged app, builds Next.js standalone output, and creates the NSIS installer under `dist/`. The folder also contains `latest.yml` and the installer blockmap used by the updater. Local builds do not publish a GitHub Release. `npm run electron:release` is retained as a local build alias; releases should be published through the tagged GitHub Actions workflow below.

### Publish a new version

#### Verify the desktop starter database

Run `npm run db:seed:desktop` to create `build-resources/seed/planner-seed.db` from the checked-in SQLite Prisma schema and `build-resources/desktop-reference.json`. Review changes to that manifest as release inputs. Its rows contain academic reference fields and the Viewer role, group and permissions. The generator builds an empty database from the schema and inserts only the listed columns. Every other application table must be empty.

Run `npm run db:validate:desktop` to check table counts, foreign keys, integrity and byte equality with an independent clean build. Run `npm run test:desktop-seed` for the first-launch and upgrade regressions. The desktop production build generates and validates the seed, and the packager repeats validation before packaging. The working database, SQL exports, accounts and demo seed scripts are outside this workflow.

On first launch the app creates a per-user database and session secret. A desktop installation requires no local administrator bootstrap. The production sign-in flow provisions ordinary users with Viewer access. Configure the read URL and provision named publishers on the catalogue host using the [official catalogue guide](central/README.md). Fresh installations need the published catalogue for official planners. The seed includes no local planner drafts or templates because the local tables carry no publication approval.

#### Tag and publish

1. Update the `version` in `package.json` and `package-lock.json` (for example, run `npm version patch`, then review the generated commit and tag).
2. Commit and push the version change to the repository.
3. Push the matching semantic version tag, for example `git push origin v1.2.0`.
4. The `Windows desktop release` workflow runs only for tags matching `v*.*.*`. It verifies that the tag matches `package.json`, installs dependencies, builds the x64 installer, generates SHA-256 checksums, and publishes the installer, `.blockmap` file, and `latest.yml` to the matching GitHub Release.
5. Check the workflow and release page. Confirm the installer, `latest.yml`, blockmap, and checksum file are attached before announcing the release.

The workflow uses GitHub's built-in `GITHUB_TOKEN`; no personal access token is stored in the repository. In repository settings, allow Actions to create releases by granting workflow contents write permission (or enabling read/write workflow permissions). Do not print or echo tokens in workflow steps.

Before the first release, add these **Actions repository Variables** under the repository settings. They are public client configuration compiled into the app, not private credentials: `NEXT_PUBLIC_CLIENT_ID`, `NEXT_PUBLIC_AUTHORITY`, `NEXT_PUBLIC_REDIRECTURI`, `NEXT_PUBLIC_POSTLOGOUTREDIRECTURI`, `NEXT_PUBLIC_DB_URL`, and `NEXT_PUBLIC_ANON_KEY`. The workflow checks that they are present without printing their values. Register the localhost redirect URI used by the desktop app with the Microsoft identity application. Local installer builds read the equivalent values from the developer's ignored `.env` file.

For automatic updates, releases must remain public and include `latest.yml`, the installer, and its blockmap. `electron-updater` checks the configured `NKXK26/Study-Planner-System` GitHub Releases feed. Draft releases are not served as updates.

### Release security and signing

Packaged desktop builds force `NEXT_PUBLIC_MODE=PROD`; the DEV login/authorization bypass is not enabled. Each installation generates a random session signing secret in the user's app data directory and reuses it across launches and updates. That secret is not committed or embedded as a fixed production value. Development environment files are excluded from the packaged files. Never put private credentials in `NEXT_PUBLIC_*` variables or the renderer bundle. Server-only integration credentials (for example, email provider passwords) are deliberately not embedded in the desktop installer; features that require them need a protected server-side service.

The installer is not code-signed by this project yet. Windows may display SmartScreen or an unknown-publisher warning. A publisher can reduce these warnings by obtaining a trusted code-signing certificate and configuring it as protected GitHub Actions secrets (commonly `CSC_LINK` and `CSC_KEY_PASSWORD`) before release. This project does not generate or provide a certificate. Protect signing material and rotate it if exposed.

MSIX, Microsoft Store, and Winget distribution are possible future options; they are not part of the current release process.

## Features

- Upload study planners and student transcripts for unit matching.
- Compare planner versions and inspect outstanding requirements.
- Manage units, planners, roles, and related academic data.
- Export planner and comparison results.
