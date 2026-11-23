"""Prepare an offline review from the official 2023 index and ten cached PDFs.

Cache index.html and its PDF links under tmp/ba-cs-2023-sources before running.
"""
import argparse
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

import pdfplumber

from extract import parse_page
from normalize import PILOT, normalize, offerings
from prepare import DEFAULT, REVIEW, bundle_of, central_check, promote
from sources import INDEX, MAJORS, MONTHS, ROOT, digest, discover
from resolve_2023 import WINTER, resolve

CACHE = ROOT / "tmp/ba-cs-2023-sources"
OUTPUT = REVIEW / "ba-cs-2023-v1"
RESOLVED = REVIEW / "ba-cs-2023-resolved-v1"
EXPECTED = sorted(f"23-{month}-{major}" for month in ("Feb", "Sep") for major in MAJORS)
POLICY = ("8 Core, 8 Major and 8 Elective slots at 12.5 CP per slot (300 CP). "
          "A passed ICT20016 or ICT20026 satisfies two elective slots once. WIL is optional. "
          "MPU is excluded from academic credit.")


def write(path, value):
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False, indent=2)
    path.write_bytes((value.rstrip()+"\n").encode("utf-8"))


def sources_for(document):
    rows = discover(document, years=(2023,))
    counts = Counter(r["name"] for r in rows)
    missing = sorted(set(EXPECTED)-counts.keys())
    duplicates = sorted(n for n in counts if counts[n]>1)
    unexpected = sorted(counts.keys()-set(EXPECTED))
    invalid = [(r["name"],r["errors"]) for r in rows if r["errors"]]
    if missing or duplicates or unexpected or invalid:
        raise ValueError(f"Missing {missing}; duplicate {duplicates}; unexpected {unexpected}; invalid {invalid}")
    return sorted(rows,key=lambda r:r["name"])


def location(r):
    return f"p. 1, y={r['y']}, " + (f"Y{r['year']} {r['term']}" if r["year"] else r["section"])


def review_questions(evidence):
    questions = []
    occurrences = defaultdict(list)
    for row in evidence["rows"]:
        occurrences[row["code"]].append(location(row))
        if row["code"] == "ICT20016" and row["year"] == 2 and "Year Three" in row["cells"][-1]:
            questions.append(f"{location(row)}, ICT20016: Is the printed Year Two break available in addition "
                             "to Year Three? The canonical placement window is Year Three.")
    for code, locations in occurrences.items():
        if len(locations)>1:
            questions.append(f"{code} appears at {' and '.join(locations)}. Should this be one unit "
                             "across both entries, and which prescribed status and offerings apply?")
    return questions


def verify_units(snapshot, evidence, merged=None):
    """Cross-check canonical academic cells against printed rows before emitting a file."""
    by_code = {u["UnitCode"]:u for u in snapshot["units"] if u["unitTypeId"] != 17}
    academic = [r for r in evidence["rows"] if r["category"] != "WIL Placement"]
    if len(by_code) != len(academic):
        raise ValueError("Academic row count differs from canonical unit count")
    for row in academic:
        code, title, raw, *pool = row["cells"]
        unit = by_code[code]
        if (unit["Name"],unit["unitType"]["Name"]) != (title,row["category"]):
            raise ValueError(f"{code}: historical title or category changed")
        if pool:
            terms = offerings(pool[0])
        else:
            semester, date = row["term"].split(" | ")
            if (unit["plannedYear"],unit["plannedSemester"],unit["plannedDates"]) != (row["year"],semester,date):
                raise ValueError(f"{code}: printed calendar changed")
            terms = offerings(date)
        if unit["offeredTerms"] != (merged or {}).get(code, terms):
            raise ValueError(f"{code}: offered terms changed")
        rules = unit["requisites"]
        tokens = re.findall(r"[A-Z]{3}\d{5}|\d+cp", raw, re.I)
        actual = [r["unit"]["UnitCode"] if r["unit"] else f"{r['minCredits']}cp" for r in rules]
        if [s.upper() for s in tokens] != [s.upper() for s in actual]:
            raise ValueError(f"{code}: prerequisite operands changed")
        for rule in rules:
            relation = ("min" if rule["minCredits"] is not None else "anti" if "anti-req" in raw.lower()
                        else "co" if "co-req" in raw.lower() else "pre")
            if (rule["relationship"],rule["logicalOperator"]) != (relation,"or" if "/" in raw else "and"):
                raise ValueError(f"{code}: prerequisite relationship changed")
    central_check(snapshot)


def build(directory, resolved=False):
    document = (CACHE/"index.html").read_bytes()
    sources = sources_for(document)
    if resolved:
        register = json.loads((OUTPUT/"source-index.json").read_bytes())
        checksums = {s["name"]:s["sha256"] for s in register}
    registry = json.loads((DEFAULT/"unit-id-registry.json").read_bytes())
    # Only numeric identities and the external anti-requisite reference are reused.
    previous = json.loads((DEFAULT/"manifest.json").read_bytes())
    pilot_file = next(r["canonicalFile"] for r in previous["planners"] if r["name"] == PILOT)
    pilot = json.loads((DEFAULT/pilot_file).read_bytes())
    (directory/"source-index.html").write_bytes(document)
    records, drafts = [], {}
    for src in sources:
        name = src["name"]
        _, month, major = name.split("-")
        path = CACHE/src["filename"]
        src.update(sha256=digest(path.read_bytes()),major=MAJORS[major],intakeMonth=MONTHS[month],intakeYear=2023)
        if resolved and src["sha256"] != checksums[name]:
            raise ValueError(f"{name}: PDF differs from the reviewed revision")
        folder = directory/name
        artifacts = folder/"evidence"
        artifacts.mkdir(parents=True)
        (folder/"validation").mkdir()
        with pdfplumber.open(path) as pdf:
            if len(pdf.pages) != 1:
                raise ValueError(f"{name}: source layout changed; inspect all {len(pdf.pages)} pages")
            page = pdf.pages[0]
            evidence = parse_page(page,src)
            page_text = page.extract_text(x_tolerance=1)
            footer = next((line for line in page_text.splitlines() if "Last updated" in line), None)
            src["printedFooter"] = footer
        subprocess.run(["pdftoppm","-scale-to","1800","-png",str(path),str(artifacts/"page")],check=True)
        write(artifacts/"source-rows.json", dict(source=src, page=1, **evidence))
        write(artifacts/"page-text.txt",page_text)
        for code in sorted({r["code"] for r in evidence["rows"]} - registry.keys()):
            identifier = 1_000_000 + int(digest(code.encode())[:7], 16)
            if identifier in registry.values():
                raise ValueError("Offline unit ID collision for "+code)
            registry[code] = identifier
        merged = {}
        if resolved:
            evidence, merged, audit, questions = resolve(name,evidence)
            write(artifacts/"normalizations.json",audit)
        else:
            questions = review_questions(evidence)
        snapshot, errors, warnings = normalize(name,evidence,registry,pilot)
        if resolved:
            for unit in snapshot["units"]:
                if unit["UnitCode"] in merged:
                    unit["offeredTerms"] = merged[unit["UnitCode"]]
                if month=="Sep" and unit["UnitCode"]=="ICT20016":
                    unit.update(plannedDates=WINTER,offeredTerms=["Winter"])
        for error in errors:
            rows = [r for r in evidence["rows"] if r["term"] and
                    error == f"Year {r['year']} calendar mismatch: {r['term']}"]
            where = location(rows[0]) if rows else "page 1"
            questions.append(f"{where}: {error}. Which printed value or academic period should apply?")
        if not re.search(r"24 units\s*\(300 credit points\)",page_text,re.I):
            questions.append("Page 1, Course Information: confirm the total academic credits and unit count.")
        if "* Pre-scribed Elective" not in page_text:
            questions.append("Page 1, Notes: confirm the meaning of the elective asterisk.")
        record = dict(name=name,courseCode="BA-CS",intakeYear=2023,intakeMonth=MONTHS[month],major=MAJORS[major],
                      alreadyPresent=None,publishedRevisions=[],sources=[src],errors=questions,warnings=warnings,
                      prescribed=[u["UnitCode"] for u in snapshot["units"] if u["unitTypeId"]==1 and u["Name"].endswith("*")],
                      recommended=[u["UnitCode"] for u in snapshot["units"] if u["unitTypeId"]==1 and not u["Name"].endswith("*")],
                      status="blocked" if questions else "valid",schemaValidation="not submitted")
        if not questions:
            verify_units(snapshot,evidence,merged)
            file = folder/(name+".json")
            write(file,snapshot)
            record.update(schemaValidation="passed",canonicalFile=file.relative_to(directory).as_posix(),
                          canonicalSha256=digest(file.read_bytes()))
            drafts[name]=snapshot
            if resolved and name=="23-Feb-CSDS" and file.read_bytes()!=(OUTPUT/name/file.name).read_bytes():
                raise ValueError("Previously validated February Data Science definition differs")
        report = [f"# {name}", POLICY, f"Status: {record['status']}. Central schema and BCS validation: {record['schemaValidation']}.",
                  "Prescribed as printed: "+", ".join(record["prescribed"]), "Unstarred elective options: "+", ".join(record["recommended"]),
                  f"[Source PDF]({src['url']}) · {src['sourceUpdate']} · SHA-256 {src['sha256']}",
                  "[Page 1](../evidence/page-1.png) · [Extracted cells](../evidence/source-rows.json)",
                  *questions,*warnings]
        if resolved:
            report.append("[Confirmed normalizations and original cells](../evidence/normalizations.json)")
        write(folder/"validation"/"report.md","\n\n".join(report))
        records.append(record)
    bundle = bundle_of(records,drafts)
    blocked = [r for r in records if r["status"]=="blocked"]
    manifest = dict(index=INDEX,indexSha256=digest(document),academicPolicy=POLICY,publicCatalogueSha256=None,
                    summary=dict(expected=10,discovered=len(records),valid=len(drafts),blocked=len(blocked),missing=0,bundled=len(bundle)),
                    planners=records)
    write(directory/"manifest.json",manifest)
    write(directory/"resolved-drafts.json",bundle)
    subprocess.run(["node","--input-type=module","-e", """
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewFiles } from './central/bulk-review.mjs';
const read = file => readFileSync(join(process.argv[1],file),'utf8');
const manifest = read('manifest.json');
const result = reviewFiles({manifest,bundle:read('resolved-drafts.json')});
assert.deepEqual(result.issues,[]);
const expected = JSON.parse(manifest).planners.map(r => [r.name,r.status === 'valid' ? 'ready' : 'excluded']);
assert.deepEqual(result.results.map(r => [r.name,r.operation]),expected);
""",str(directory)],cwd=ROOT,check=True)
    write(directory/"blocked-planners.json",blocked)
    write(directory/"source-index.json",sources)
    write(directory/"manifest.md","# BA-CS 2023 review\n\n"+POLICY+"\n\n"+"\n".join(
        f"- [{r['name']}]({r['name']}/validation/report.md) — {r['status']}" for r in records))
    write(directory/"blocked-planners.md","# HOD questions\n\n"+"\n\n".join(
        "## "+r["name"]+"\n\n"+"\n".join("- "+q for q in r["errors"]) for r in blocked))
    write(directory/"verification.md",f"# Local verification\n\nAll ten expected identities occur exactly once on the university index. "
          f"{len(drafts)} canonical drafts passed cell-level checks, central schema validation and BCS completion scenarios. "
          f"{len(blocked)} series require academic confirmation. Central bulk review accepted these exact inclusions and exclusions. "
          "Source URLs, update dates and PDF hashes appear in source-index.json. "
          "Each evidence folder contains the full page, extracted text, row coordinates and colour-derived categories. "
          "February PDFs omit WIL; the optional substitution comes from the historical cohort policy. "
          "Historical prescribed markers are retained. The existing legacy completion engine counts elective totals. "
          "The live publication inventory was outside this offline review.")
    if resolved:
        with (directory/"verification.md").open("ab") as report:
            report.write(b"\nReproduce from the repository root with the review virtual environment: "
                         b"`python -B scripts/catalogue_review/prepare_2023.py --resolved`. "
                         b"Use a fresh output directory. The generator refuses to replace an existing package. "
                         b"See each planner's evidence/normalizations.json for confirmed exceptions.\n")
    write(directory/"SHA256SUMS","\n".join(
        f"{digest(f.read_bytes())}  {f.relative_to(directory).as_posix()}" for f in sorted(directory.rglob("*")) if f.is_file()))
    return manifest["summary"]


if __name__=="__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resolved",action="store_true",help="Apply the confirmed historical decisions")
    parser.add_argument("--output",type=Path,help="Fresh directory for an independent regeneration")
    args = parser.parse_args()
    print(promote(args.output or (RESOLVED if args.resolved else OUTPUT), lambda folder: build(folder,args.resolved)))
