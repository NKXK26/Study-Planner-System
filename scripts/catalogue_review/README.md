# BA-CS catalogue preparation

Run these commands from the repository root in standard PowerShell. Use native Windows CPython 3.12 x64, Node.js, and the installed root and central Node dependencies. Source collection also requires `curl.exe` on PATH. If `python` resolves to MSYS2 Python, use the full path to your native Windows `python.exe` on the first line.

### Set up and test

The virtual environment lives under the Git-ignored `tmp/` directory. Its Python installs and runs the review dependencies without activating the environment or changing global packages.

```powershell
python -m venv .\tmp\catalogue-review-venv
$reviewPython = '.\tmp\catalogue-review-venv\Scripts\python.exe'
& $reviewPython -m pip --isolated install --only-binary=:all: -r .\scripts\catalogue_review\requirements.txt
& $reviewPython -m pip check
& $reviewPython -B .\scripts\catalogue_review\test_prepare.py
node .\scripts\test-bcs-planner-rules.mjs
```

To recreate the environment, close processes using it, delete only `tmp/catalogue-review-venv` from the repository in File Explorer, then repeat the setup commands. Keep `tmp/ba-cs-sources` and `tmp/ba-cs-reproduction` for offline review.

### Collect sources and prepare a review

Reuse the same virtual environment in each PowerShell session.

```powershell
$reviewPython = '.\tmp\catalogue-review-venv\Scripts\python.exe'
& $reviewPython -B .\scripts\catalogue_review\sources.py
curl.exe --fail --silent --show-error --max-time 90 https://official-planner-catalogue-staging.onrender.com/catalogue -o tmp/ba-cs-sources/published.json
& $reviewPython -B .\scripts\catalogue_review\prepare.py
```

The source script registers BA-CS rows from the official university index, checks the filename against the intake and major labels, and saves the original PDFs and hashes under ignored `tmp/ba-cs-sources/`. The public catalogue lookup records the published-series inventory. If no public inventory is supplied, the known pilot is still excluded. The public endpoint lists published revisions.

The V2 audit uses the original cached index, PDFs, source register and public inventory. For an offline audit with those files in place, run `test_prepare.py` and `prepare.py` using the environment's Python. Preparation reads the V1 manifest by checksum, with its byte-identical reproduction in `tmp/ba-cs-reproduction` as a fallback for older restrictive ACLs.

The default destination is `output/catalogue-review/ba-cs-2024-2026-v2/`. Use `--output <fresh-directory>` to generate another copy. On Windows, run PowerShell as your ordinary user. The generator creates a normal sibling folder directly beneath the destination parent, validates the contents, then renames the complete folder. Both the directory and files inherit ordinary access rules. Existing destinations are refused.

Windows PowerShell 5 can read the UTF-8 reports with these commands.

```powershell
$review = 'output/catalogue-review/ba-cs-2024-2026-v2'
Get-Content -Encoding UTF8 -LiteralPath "$review/comparison-with-v1.md"
Get-Content -Encoding UTF8 -LiteralPath "$review/decision-register.md"
```

**Identity and academic decisions**

- The canonical series is BA-CS, year, intake month and major. A filename suffix such as r2 identifies a source revision. Catalogue revision numbers belong to the central service.
- The pilot pins IDs for its units and referenced units. For other codes the registry reuses the smallest matching numeric Unit ID from an immutable, read-only SQLite connection. A code missing locally receives 1,000,000 plus the first seven hexadecimal digits of its SHA-256. Assembly stops on an ID collision. Review registry differences if the local reference database changes.
- Page-one legend colours identify planner-specific categories. Source cells, semester labels and vertical positions appear in each report. Planned semesters follow the printed sequence. Offered terms use calendar semesters, including for September entrants. Grid units carry only the offering evidenced by their scheduled date. An explicit elective or minor table supplies any additional offerings.
- An asterisk on an elective carries the prescribed marker. Four unstarred, colour-coded electives in a recommended sequence can supply the four choices when there is no separate options table. This interpretation is flagged in the affected reports. Identical repeated pool entries count once. Conflicting identities require HOD review. A single incorrect printed year can be corrected when all six semester positions and intake seasons agree and the other five dates corroborate the sequence.
- The V2 decision register records the confirmed September 2024+ elective and mandatory WIL totals wherever a legacy legend conflicts, and the passed-only threshold wherever the PDF includes the current semester. The unit counts and markings are checked independently.
- Credits derive from the printed category counts and credit totals. The pre-September-2024 optional placement comes from the supplied cohort rule. Its template requirement is zero. Equivalence, the 12-pass threshold and pre-final break restrictions use the project's BCS rules. The central schema has no structured fields for those last two restrictions or the source evidence.
- The original pilot and PDF hashes are pinned. Only the documented COS30047 marker exception is accepted for the pilot. A valid pilot appears in the review directory and is excluded from the bundle. Any other already-published series is also excluded.
- Every accepted snapshot passes the central AJV schema and local checks for codes, IDs, credits, programme requirements, referenced units and completion with both WIL codes. The bundle contains plain snapshot objects. Publication approval, conflict checks against non-public revisions and assignment of revision metadata belong to a later phase.
