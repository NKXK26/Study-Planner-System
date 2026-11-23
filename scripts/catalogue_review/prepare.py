"""Build an offline review directory. No database writes, server or publication client."""
import argparse
import json
import shutil
import subprocess
from uuid import uuid4
from collections import Counter
from pathlib import Path
from audit import V1, reports
from decisions import DECISIONS

from extract import parse_pdf
from normalize import PILOT, normalize, registry_for, requirements
from sources import CACHE, INDEX, MAJORS, MONTHS, ROOT, digest, discover

REVIEW = ROOT / "output/catalogue-review"
DEFAULT = REVIEW / "ba-cs-2024-2026-v2"
PILOT_JSON = REVIEW / PILOT / (PILOT+".json")
PILOT_HASH = "bc055ac450e99a302fdb7fd051926ad18b9bf8c89b981b290f0aa81969cbde3a"
PILOT_PDF = "8f0dc910bd51406bd5528cace7e0821e9e3b4f514825a841f25eab0cbe4b824d"
POLICY = ("WIL is 25 CP. ICT20026 and ICT20016 satisfy one placement. Count 12 distinct passed, "
          "credit-bearing Core, Major or Elective units. N and SN fail. Current, Scheduled, Future and "
          "In Progress attempts do not count. Use an available Year Three Winter or Summer before the final "
          "teaching semester. Before September 2024 a passed placement substitutes for two of eight electives. "
          "From September 2024 require two prescribed and four recommended academic electives plus WIL.")


def output_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")


def output_md(path, lines):
    path.write_text("\n".join(lines)+"\n", encoding="utf-8")


def central_check(snapshot):
    subprocess.run(["node", "scripts/catalogue_review/validate.mjs"], cwd=ROOT, check=True,
                   input=json.dumps(snapshot), text=True)


def select_source(sources):
    if not sources:
        return ["Missing from official index"]
    if len(sources)!=1:
        return ["Multiple index entries for this intake and major. Resolve the source revision."]
    return list(sources[0]["errors"])


def candidate_for(source, year, months, code):
    # An incomplete index label blocks every slot it might represent.
    yy, mon, suffix = source["name"].split("-")
    return yy==str(year%100) and (mon in months or mon=="None") and (suffix==code or suffix=="None")


def bundle_of(records, drafts):
    bundle, seen = [], set()
    for record in records:
        if record["status"]!="valid" or record["alreadyPresent"] is True or record["name"]==PILOT:
            continue
        s = drafts[record["name"]]
        if any(d["allowDraft"] is False and d["courseCode"] == s["courseCode"] and
               d["planner"] in (record["name"], s["name"]) for d in DECISIONS):
            raise ValueError("Academic decision locks series: "+s["name"])
        key = (s["courseCode"], s["major"].lower(), s["intakeYear"], s["intakeMonth"])
        if key in seen or key == ("BA-CS","cybersecurity",2025,3):
            raise ValueError("Duplicate or protected series: "+s["name"])
        seen.add(key)
        bundle.append(s)
    return bundle


def pilot_diff(s, pilot):
    a = {u["UnitCode"]:u for u in s["units"]}
    b = {u["UnitCode"]:u for u in pilot["units"]}
    diff = []
    for code in sorted(a.keys() | b.keys()):
        if code not in a or code not in b:
            diff.append(code+" appears in only one definition")
            continue
        for field in ["ID","Name","CreditPoints","unitTypeId","plannedYear","plannedSemester","offeredTerms","requisites"]:
            if a[code].get(field)!=b[code].get(field):
                diff.append(f"{code} {field}: PDF extraction {a[code].get(field)} | pilot {b[code].get(field)}")
    return diff


def build(directory):
    pilot = json.loads(PILOT_JSON.read_bytes())
    if digest(PILOT_JSON.read_bytes())!=PILOT_HASH:
        raise ValueError("Protected pilot changed since academic validation")
    central_check(pilot)
    inventory_file = CACHE/"published.json"
    inventory = json.loads(inventory_file.read_bytes())["data"] if inventory_file.exists() else []
    if not isinstance(inventory, list) or any(p["status"]!="Published" for p in inventory):
        raise ValueError("Invalid public catalogue inventory")
    sources = json.loads((CACHE/"sources.json").read_bytes())
    index_bytes = (CACHE/"index.html").read_bytes()
    index = discover(index_bytes)
    if [(r["name"],r["url"],r["filename"]) for r in index]!=[(r["name"],r["url"],r["filename"]) for r in sources]:
        raise ValueError("Source register does not match the official index. Collect sources again.")
    evidence, records, drafts = {}, [], {}
    expected = [(year, season, code) for year in range(2024,2027) for season in ("early","September") for code in MAJORS]
    matched = set()
    for year, season, code in expected:
        choices = ["Sep"] if season=="September" else ["Feb","Mar"]
        candidates = [r for r in sources if candidate_for(r,year,choices,code)]
        matched.update(r["url"] for r in candidates)
        exact = [r for r in candidates if "None" not in r["name"]]
        name = exact[0]["name"] if exact else f"{year%100}-{'Feb-Mar' if season=='early' else 'Sep'}-{code}"
        errors = select_source(candidates)
        row = dict(name=name, courseCode="BA-CS", major=MAJORS[code], intakeYear=year,
                   intakeMonth=MONTHS[name.split("-")[1]] if exact else (9 if season=="September" else None),
                   batch=f"{year} "+("February-March" if season=="early" else season),
                   alreadyPresent=True if name==PILOT else None, sources=candidates, errors=errors, warnings=[])
        published = [p for p in inventory if (p["courseCode"], p["major"].lower(), p["intakeYear"], p["intakeMonth"])
                     == ("BA-CS", row["major"].lower(), year, row["intakeMonth"])]
        row["publishedRevisions"] = [{k:p[k] for k in ("id","version","publishedAt","name")} for p in published]
        if published:
            row["alreadyPresent"] = True
        if len(published)>1:
            errors.append("Multiple published revisions match this series")
        if name==PILOT and inventory_file.exists():
            if len(published)!=1:
                errors.append("Public catalogue does not confirm exactly one protected pilot")
            else:
                published_snapshot = {k:published[0].get(k) for k in pilot}
                published_snapshot["units"] = [{k:v for k,v in u.items() if k!="isOfficialWil"} for u in published_snapshot["units"]]
                if published_snapshot!=pilot:
                    errors.append("Published snapshot differs from protected pilot JSON")
        if not errors:
            try:
                evidence[name] = parse_pdf(candidates[0])
            except (OSError, ValueError, KeyError, TypeError, RuntimeError) as exc:
                errors.append("Source extraction failed: "+str(exc))
        records.append(row)
    if set(r["url"] for r in sources)-matched:
        raise ValueError("Unassigned BA-CS index rows require identification before assembly")
    ids = registry_for({r["code"] for e in evidence.values() for r in e["rows"]}, pilot)
    output_json(directory/"unit-id-registry.json",ids)
    pilot_lines = ["# Published pilot comparison","",f"Protected snapshot SHA-256: {PILOT_HASH}",
                   f"Validated PDF SHA-256: {PILOT_PDF}", "",
                   "The March 2025 Cybersecurity series is already present according to the supplied staging inventory. "
                   "The batch excludes this series independently of its filename and validation status."]
    for row in records:
        name = row["name"]
        e = evidence.get(name)
        s = None
        if e:
            s, errors, warnings = normalize(name, e, ids, pilot)
            if name==PILOT:
                pilot_lines.extend(["",f"Read-only published inventory: {row['publishedRevisions']}.",
                    "Published academic snapshot matches the protected JSON." if row["publishedRevisions"] and not row["errors"] else
                    "Review inventory status in the manifest."])
                pilot_lines.extend(["", "Official download SHA-256: "+row["sources"][0]["sha256"],"",
                    "The pilot retains supplementary offering terms and resolves the PDF's third asterisk on COS30047. "
                    "Its original review records the repeated Elective 2 placeholder and the WIL note below Year Two. "
                    "The scheduling limitation in that historical report was addressed separately.","",
                    "Field differences between the independent source extraction and the protected snapshot","",
                    *["- "+d for d in pilot_diff(s,pilot)]])
                if row["sources"][0]["sha256"]==PILOT_PDF:
                    pilot_exception = "Expected two prescribed electives; found ['COS10003', 'COS30019', 'COS30047']"
                    warnings.extend(m for m in errors if m==pilot_exception)
                    errors = [m for m in errors if m!=pilot_exception]
                    warnings.append("Retained previously validated pilot. Its published definition marks COS30047 optional.")
                    s = pilot
                else:
                    errors.append("Official PDF differs from validated pilot checksum")
            if errors:
                row["errors"].extend(errors)
            row["warnings"].extend(warnings)
            row["printedLegend"]=e["legend"]
            row["prescribed"]=[u["UnitCode"] for u in s["units"] if u["unitTypeId"]==1 and u["Name"].endswith("*")]
            row["recommended"]=[u["UnitCode"] for u in s["units"] if u["unitTypeId"]==1 and not u["Name"].endswith("*")]
        row["status"]="missing" if not row["sources"] else "blocked" if row["errors"] else "valid"
        row["schemaValidation"]="not submitted"
        folder = directory / row["batch"] / name
        folder.mkdir(parents=True)
        if row["status"]=="valid":
            try:
                central_check(s)
            except subprocess.CalledProcessError:
                row["errors"].append("Central schema or BCS completion validation failed")
                row["status"]="blocked"
                row["schemaValidation"]="failed"
        if row["status"]=="valid":
            row["schemaValidation"]="passed"
            target = folder/(name+".json")
            if name==PILOT:
                shutil.copyfile(PILOT_JSON,target)
            else:
                output_json(target,s)
            row["canonicalFile"]=target.relative_to(directory).as_posix()
            row["canonicalSha256"]=digest(target.read_bytes())
            drafts[name]=s
        details = [f"# {name}", "",f"{row['batch']} · {row['major']} · {row['status']}", "",
                   "## Sources", "", *[f"- {r['filename']} · {r['url']} · SHA-256 {r.get('sha256','unavailable')}" for r in row["sources"]],
                   "",f"Central schema check: {row['schemaValidation']}.", "", "## Academic review","",POLICY,"",
                   *["- "+x for x in row["errors"]+row["warnings"]]]
        if e:
            details.extend(["",f"Printed category counts and CP: {e['legend']}",f"Open elective positions: {e['slots']}",
                            f"Prescribed: {', '.join(row['prescribed'])}",f"Recommended: {', '.join(row['recommended'])}",
                            "", "### Source rows on page 1", "",
                            "| Top (pt) | PDF category | Year / printed semester or pool | Source cells |",
                            "| ---: | --- | --- | --- |"])
            for r in e["rows"]:
                period = (f"Y{r['year']} {r['term']}" if r["year"] else r["section"]).replace("|","/")
                details.append(f"| {r['y']} | {r['category']} | {period} | {' · '.join(r['cells'])} |")
        output_md(folder/(name+"-validation.md"),details)
    bundle = bundle_of(records,drafts)
    blocked = [r for r in records if r["status"]!="valid"]
    summary = dict(expected=len(records), discovered=sum(bool(r["sources"]) for r in records),
                   valid=len(drafts), blocked=len(blocked), missing=sum(not r["sources"] for r in records), bundled=len(bundle))
    output_json(directory/"ba-cs-2024-2026-drafts.json",bundle)
    output_json(directory/"manifest.json",dict(index=INDEX,indexSha256=digest(index_bytes),summary=summary,
                                               publicCatalogueSha256=digest(inventory_file.read_bytes()) if inventory_file.exists() else None,
                                               centralPresence="True means present. Null means unconfirmed; public inventory omits unpublished revisions.",
                                               academicPolicy=POLICY,planners=records))
    output_json(directory/"blocked-planners.json",blocked)
    output_md(directory/"pilot-comparison.md",pilot_lines)
    for filename, subset in [("manifest.md",records),("blocked-planners.md",blocked)]:
        lines=["# BA-CS catalogue review", "", str(summary), "", "Source index: "+INDEX, "",
               "Published series are excluded. The public inventory omits drafts and archived revisions. Reconcile these before import. "
               "Source revision suffixes and index update dates appear in the manifest. The service assigns database versions.",
               "",POLICY,"","Grid offerings cover the printed calendar period. Additional offerings require independent confirmation."]
        for r in subset:
            lines.extend(["",f"### {r['batch']} · {r['major']} · {r['name']}","",
                          f"{r['status']}. Central presence: "+("published, excluded" if r['alreadyPresent'] else "absent from public inventory; private revisions unknown" if inventory_file.exists() else "unverified")+".",
                          *[f"- {src['url']} · SHA-256 {src.get('sha256','unavailable')}" for src in r["sources"]],
                          *["- "+m for m in r["errors"]+r["warnings"]]])
        output_md(directory/filename,lines)
    reports(directory, records, summary, evidence)
    return summary


def promote(target, generate):
    target = target.resolve()
    if target.exists() or V1 in target.parents:
        raise FileExistsError(f"Choose a fresh output directory outside V1: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    # Windows inherits ACLs when an object is created. Create the staging
    # directory directly under the destination parent with ordinary mkdir.
    stage = target.with_name(".catalogue-preparing-"+uuid4().hex)
    stage.mkdir()
    try:
        result = generate(stage)
        if target.exists():
            raise FileExistsError(target)
        stage.rename(target)
    except BaseException:
        shutil.rmtree(stage)
        raise
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT, help="Fresh review directory")
    target=parser.parse_args().output.resolve()
    print(promote(target, build))


if __name__=="__main__":
    main()
