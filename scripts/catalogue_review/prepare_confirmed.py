"""Generate the isolated November 2026 academic-decision review, without a database."""
import json
from collections import defaultdict
from pathlib import Path

from decisions import confirmed_evidence, DECISIONS, REGISTER
from normalize import PILOT, isolated_year_typo, offerings
from prepare import DEFAULT, REVIEW, bundle_of, central_check, normalize, parse_pdf, promote
from sources import CACHE, digest

PRIOR = REVIEW/"ba-cs-blocked-resolution-v1"
OUTPUT = REVIEW/"ba-cs-blocked-resolution-v2"
READY = {"24-Sep-CSCS", "25-Sep-CSAI", "26-Mar-CSAI", "26-Sep-CSAI"}
LOCKED = "26-Sep-CSDS"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return json.loads(path.read_bytes())


def write(path, data):
    text = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=2)
    path.write_bytes((text.rstrip()+"\n").encode("utf-8"))


def verify_fields(snapshot, original, evidence, record, marked):
    # Normalize the unmodified extraction independently and allow only the confirmed delta.
    # On the blank prerequisite, the original diagnostic snapshot has an empty list
    # plus a blocking error. Only the decision makes that list a verified Nil.
    if marked:
        for unit in original["units"]:
            refs = [unit] + [r["unit"] for r in unit["requisites"] if r["unit"]]
            for ref in refs:
                if ref["UnitCode"] == "COS10022":
                    ref["Name"] += "*"
    require(original == snapshot, "Unexpected change outside the confirmed field")
    require(all(snapshot[k] == record[k] for k in ("name","courseCode","major","intakeMonth","intakeYear")),
            "Planner identity mismatch")
    by_code = {u["UnitCode"]:u for u in snapshot["units"]}
    corrections = isolated_year_typo(evidence["rows"], record["intakeYear"],record["intakeMonth"])
    terms = defaultdict(set)
    for row in evidence["rows"]:
        code, cells = row["code"], row["cells"]
        u = by_code[code]
        require(row["category"] == u["unitType"]["Name"], "Category mismatch: "+code)
        if code == "ICT20016":
            continue
        if row["year"]:
            sem, date = row["term"].split(" | ")
            require((u["plannedYear"],u["plannedSemester"],u["plannedDates"]) ==
                    (row["year"],sem,corrections.get((row["year"],row["term"]),date)), "Period mismatch: "+code)
            terms[code].update(offerings(date))
        else:
            terms[code].update(offerings(cells[3]))
    require(all(set(by_code[c]["offeredTerms"]) == ts for c,ts in terms.items()), "Offering mismatch")
    central_check(snapshot)


def build(directory):
    baseline = read(DEFAULT/"manifest.json")
    previous = read(PRIOR/"manifest.json")
    old = {r["name"]:r for r in baseline["planners"]}
    prior = {r["name"]:r for r in previous["planners"]}
    ids = read(DEFAULT/"unit-id-registry.json")
    pilot = read(DEFAULT/old[PILOT]["canonicalFile"])
    require({d["planner"] for d in DECISIONS} == READY | {LOCKED} and len(DECISIONS)==5, "Register scope changed")
    records, drafts = [], {}
    for d in DECISIONS:
        name, code = d["planner"], d["unitCode"]
        record = old[name].copy()
        source, = record["sources"]
        require(prior[name]["status"]=="blocked" and source["sha256"]==d["sourceSha256"]
                and d["courseCode"]==record["courseCode"], "Review basis changed: "+name)
        evidence = parse_pdf(source)
        require(not evidence["errors"], "Unresolved PDF extraction error: "+name)
        affected = [r for r in evidence["rows"] if r["code"]==code]
        folder = directory/name
        (folder/"evidence").mkdir(parents=True)
        (folder/"validation").mkdir()
        write(folder/"evidence"/"source-rows.json", {
            "source":source, "page":1, "manualDecision":d, "affectedPrintedRows":affected,
            "priorEvidenceSha256":digest((CACHE/(name+".evidence.json")).read_bytes()),
            "printedEvidence":evidence})
        record.update(decision=d, allowDraft=d["allowDraft"], warnings=prior[name]["warnings"])
        if name == LOCKED:
            periods = [f"Y{r['year']} {r['term']}" for r in affected]
            value = d["confirmedValue"]
            require(d["allowDraft"] is False and value["countOnce"] is True and periods==value["allowedPeriods"]
                    and value["fourthRecommendedElective"] is None, "Locked decision mismatch")
            options = sorted({r["code"] for r in evidence["rows"]
                              if r["category"]=="Elective" and not r["cells"][1].endswith("*")})
            require(options==["COS30015","MGT10010","STA10003"], "Review the changed elective pool")
            note = ("STA10003 counts once in either Feb/Mar 2027 or Aug/Sept 2027. Only three distinct "
                    "recommended electives are known (COS30015, MGT10010, STA10003). Which fourth unit is approved?")
            record.update(status="blocked", errors=[note], schemaValidation="not submitted", recommended=options)
        else:
            approved = confirmed_evidence(record["courseCode"],name,source["sha256"],evidence)
            original, before_errors, before_warnings = normalize(name,evidence,ids,pilot)
            require(before_errors==prior[name]["errors"], "Baseline errors changed: "+name)
            snap, errors, warnings = normalize(name,approved,ids,pilot)
            require(not errors and warnings==before_warnings==prior[name]["warnings"], "Validation drift: "+name+str(errors))
            marked = d["decisionType"]=="prescribedElective"
            verify_fields(snap,original,evidence,record,marked)
            electives = [u for u in snap["units"] if u["unitType"]["Name"]=="Elective"]
            prescribed = [u["UnitCode"] for u in electives if u["Name"].endswith("*")]
            recommended = [u["UnitCode"] for u in electives if not u["Name"].endswith("*")]
            require(set(prescribed)=={"COS10003","COS10022" if marked else "COS30019"} and len(recommended)>=4,
                    "Elective requirements disagree: "+name)
            path = folder/(name+".json")
            write(path,snap)
            record.update(status="valid",errors=[],schemaValidation="passed",prescribed=prescribed,recommended=recommended,
                          canonicalFile=path.relative_to(directory).as_posix(),canonicalSha256=digest(path.read_bytes()))
            drafts[name]=snap
            note = (f"Central schema and BCS completion checks passed. BA-CS {record['major']}, "
                    f"{record['intakeYear']}-{record['intakeMonth']:02}. Required credits: 8 Core (100), "
                    f"8 Major (100), 6 Elective (75), one WIL (25), total 300. Prescribed: {', '.join(prescribed)}. "
                    f"Choose four from {', '.join(recommended)}. ICT20016/ICT20026 satisfy one placement. "
                    "Distinct identities, requisites, semester dates, offerings and the Year Three Winter/Summer placement passed validation. "
                    "All fields outside the confirmed decision match the original normalization.")
        write(folder/"validation"/"report.md",f"# {name}\n\n{note}\n\nSource PDF: [{source['filename']}]({source['url']})\n\n"
              + "PDF SHA-256: "+source["sha256"]+"\n\n" + "\n".join("- "+w for w in record["warnings"]))
        records.append(record)
    bundle = bundle_of(records,drafts)
    require(len(bundle)==4 and {s["name"] for s in bundle}==READY,"Unexpected bundle membership")
    blocked = [r for r in records if r["status"]=="blocked"]
    bundle_path=directory/"resolved-drafts.json"
    write(bundle_path,bundle)
    manifest={k:baseline[k] for k in ("index","indexSha256","academicPolicy","publicCatalogueSha256")}
    manifest.update(summary=dict(expected=5,discovered=5,valid=4,blocked=1,missing=0,bundled=4),planners=records,
                    registerSha256=digest(REGISTER.read_bytes()),bundleSha256=digest(bundle_path.read_bytes()),
                    priorManifestSha256=digest((PRIOR/"manifest.json").read_bytes()))
    write(directory/"manifest.json",manifest)
    write(directory/"manifest.md","# Confirmed BA-CS decisions\n\nFour drafts for review. The published 25-Mar-CSAI is outside this batch.\n\n"
          +"\n".join(f"- [{r['name']}]({r['name']}/validation/report.md) — {r['status']}" for r in records)
          +"\n\nBundle SHA-256: "+manifest["bundleSha256"])
    write(directory/"blocked-planners.json",blocked)
    write(directory/"blocked-planners.md","# Locked planner · "+LOCKED+"\n\n"+blocked[0]["errors"][0])
    write(directory/"decision-register.md","# Academic confirmation register\n\n"+chr(10).join(
        f"- {d['planner']} · {d['unitCode']} · {d['decisionType']} = {json.dumps(d['confirmedValue'])} · "
        f"allowDraft={json.dumps(d['allowDraft'])} · {d['confirmationDate']} · {d['provenance']} · PDF SHA-256 {d['sourceSha256']}" for d in DECISIONS))
    write(directory/"verification.md","# Package verification\n\nThe generator checked pinned source PDF hashes, baseline errors and "
          "warnings, per-field changes, identity, calendar and offerings, and ran validate.mjs on each of four drafts. "
          "The locked series retains both printed rows in evidence. The exact four-member bundle passed the membership check.\n\n"
          "The manifest records SHA-256 hashes of each canonical file, the bundle, the decision register and the prior review manifest.")
    return manifest["summary"]


if __name__ == "__main__":
    print(promote(OUTPUT,build))
