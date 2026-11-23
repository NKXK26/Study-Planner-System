"""Build V2 decisions from the immutable V1 manifest and the verified PDF evidence."""
import json
from collections import defaultdict

from normalize import LEGACY, PASSED_ONLY, MARCH_AI_ALIAS
from sources import ROOT, digest

V1 = ROOT/"output/catalogue-review/ba-cs-2024-2026"
BASELINE_HASH = "0af7a5665ad91ed4923ea546190461e1b900fe6dc7e87f4798cecc52f4705847"


def baseline():
    # The reproduction is byte-identical and may remain readable when V1's ACL denies access.
    for directory in (V1, ROOT/"tmp/ba-cs-reproduction"):
        try:
            data = (directory/"manifest.json").read_bytes()
        except (PermissionError, FileNotFoundError):
            continue
        if digest(data)!=BASELINE_HASH:
            raise ValueError("V1 manifest checksum mismatch")
        return json.loads(data)
    raise ValueError("Provide the read-only V1 manifest or its verified reproduction under tmp/ba-cs-reproduction")


def classify(issue, row, evidence):
    warnings = row["warnings"]
    if issue.startswith("Printed ") and LEGACY in warnings:
        return "confirmed policy conflict", LEGACY, "Confirmed institutional curriculum policy", False
    if issue.startswith("WIL eligibility text") and PASSED_ONLY in warnings:
        return "confirmed policy conflict", PASSED_ONLY, "Confirmed institutional WIL policy", False
    if "calendar mismatch" in issue:
        warning = next((w for w in warnings if w.startswith(issue.split(" calendar")[0]+" printed ")), None)
        return ("official-source calendar discrepancy", warning or "Confirm the intended date before normalizing.",
                "Intake and six printed teaching periods", not bool(warning))
    if issue.startswith("Found 7 unique Core") or "references absent unit TNE10006" in issue:
        if row["name"]=="24-Sep-CSCS" and issue not in row["errors"]:
            return ("extraction defect", "Count the printed TNE10006 Core row and retain its ID in incoming references. Its own prerequisite remains unknown.",
                    "PDF row and V1 validator audit", False)
    if "requisite" in issue and "repeated" not in issue:
        return ("missing prerequisite or unit", "Confirm the blank prerequisite cell for TNE10006. A blank does not establish Nil.",
                "Printed course grid, page 1", True)
    if "two prescribed" in issue:
        return ("prescribed-elective ambiguity", "Identify the second prescribed elective. Visual inspection of the six green rows and their footnote confirms only COS10003 is starred.",
                "Rendered PDF and extracted unit cells, page 1", True)
    if "repeated code" in issue:
        code = issue.split(" ")[0]
        if code=="COS10022" and MARCH_AI_ALIAS in warnings and issue not in row["errors"]:
            return ("normalization defect", MARCH_AI_ALIAS, "March 2025 AI PDF and official COS10022 unit listing", False)
        definitions = [f"{r['cells'][1]} ({r['term'] or r['section']})" for r in evidence["rows"] if r["code"]==code]
        return ("duplicate/pool interpretation", "Confirm the intended title or replacement unit for "+code+": "+" / ".join(definitions),
                "Two printed rows on page 1", True)
    if "Too few" in issue:
        return ("insufficient recommended choices", "Identify the fourth distinct recommended elective after counting STA10003 once.",
                "Printed elective rows and confirmed six-elective rule", True)
    return "unresolved HOD decision", issue, "Academic review required", True


def reports(directory, current, summary, evidence):
    old = baseline()
    earlier = {r["name"]:r for r in old["planners"]}
    decisions, triage = [], []
    for row in current:
        name = row["name"]
        prev = earlier[name]
        if row["sources"]!=prev["sources"]:
            raise ValueError("Source register differs from reviewed V1 evidence: "+name)
        def add(category, original, resolution, authority, pending):
            decisions.append(dict(planner=name, category=category, originalEvidence=original,
                                  resolution=resolution, authority=authority, mode="HOD approval required" if pending else "automatic",
                                  resultingStatus=row["status"], remainingWarning=resolution,
                                  sourceSha256=row["sources"][0]["sha256"]))
        start = len(decisions)
        for issue in prev["errors"]:
            category, resolution, authority, pending = classify(issue,row,evidence.get(name,{}))
            add(category,issue,resolution,authority,pending)
            doc = evidence[name]
            if category=="official-source calendar discrepancy":
                support = list(dict.fromkeys(f"Y{r['year']} {r['term']}" for r in doc["rows"]
                                             if r["year"] and r["category"]!="WIL Placement"))
            elif category=="prescribed-elective ambiguity":
                support = [f"{r['code']} {r['cells'][1]} (page 1, y={r['y']})" for r in doc["rows"]
                           if r["category"]=="Elective"]
            elif issue.startswith("WIL eligibility text"):
                support = ["including current semester"]
            else:
                support = []
            if support:
                decisions[-1]["originalEvidence"] += " — "+" / ".join(support)
        if prev["errors"]:
            triage.append(dict(planner=name,v1Status=prev["status"],v2Status=row["status"],
                               issues=decisions[start:].copy(), remainingErrors=row["errors"]))
        groups = defaultdict(list)
        for r in evidence.get(name,{}).get("rows",[]):
            groups[r["code"]].append(r)
        for code,rows in groups.items():
            if len(rows)<2 or not any(w.startswith(code+" also appears") for w in row["warnings"]):
                continue
            entries = [f"{r['section']} · {r['term'] or 'pool'} · {' / '.join(r['cells'])}" for r in rows]
            add("duplicate/pool interpretation", " | ".join(entries),
                f"Count {code} once and retain the union of documented offerings.", "PDF sequence and elective/minor tables", False)
    for stem, items in (("decision-register",decisions),("blocker-triage",triage)):
        (directory/(stem+".json")).write_text(json.dumps(items,ensure_ascii=False,indent=2)+"\n", encoding="utf8")
        lines=["# "+stem.replace("-"," ").title(),""]
        for item in items:
            lines.extend(["## "+item["planner"],""])
            for d in item.get("issues",[item]):
                lines.extend([f"- {d['category']} · {d['mode']} · {d['resultingStatus']}.",
                              "  Evidence — "+d["originalEvidence"],"  Decision — "+d["resolution"],
                              "  Authority — "+d["authority"],""])
        (directory/(stem+".md")).write_text("\n".join(lines),encoding="utf8")
    lines=["# Comparison with V1","", "| Measure | V1 | V2 |","| --- | ---: | ---: |"]
    lines += [f"| {k} | {old['summary'][k]} | {v} |" for k,v in summary.items()]
    lines += ["","| Planner | V1 | V2 | Reasons for disposition |","| --- | --- | --- | --- |"]
    for t in triage:
        reasons=" ".join(dict.fromkeys(d["resolution"] for d in t["issues"])).replace("|","/")
        lines.append(f"| {t['planner']} | blocked | {t['v2Status']} | {reasons} |")
    (directory/"comparison-with-v1.md").write_text("\n".join(lines)+"\n",encoding="utf8")
