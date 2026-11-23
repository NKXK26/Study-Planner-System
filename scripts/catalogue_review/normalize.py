"""Convert verified source cells into central snapshots; retain every ambiguity for review."""
import hashlib
import re
import sqlite3
from collections import Counter

from extract import CODE
from sources import MAJORS, MONTHS, ROOT

PILOT = "25-Mar-CSCS"
TYPES = {"Core": 2, "Major": 3, "Elective": 1, "WIL Placement": 17}
WIL = "ICT20016"
ALIASES = [WIL, "ICT20026"]
LEGACY = "Official planner legend uses the legacy elective/WIL totals; canonical requirements follow the confirmed September 2024+ institutional policy."
PASSED_ONLY = "The PDF includes the current semester. Institutional policy requires 12 distinct completed and passed qualifying units."
MARCH_AI_ALIAS = "COS10022 uses the unit catalogue title Data Science Principles and the prescribed marker from the scheduled row."


def category(name):
    return {"ID": TYPES[name], "Name": name}


def registry_for(codes, pilot):
    # Immutable read of public unit identifiers only. No connections to PostgreSQL.
    with sqlite3.connect((ROOT/"prisma/app.db").as_uri()+"?mode=ro&immutable=1", uri=True) as db:
        local = dict(db.execute("SELECT upper(trim(UnitCode)), min(ID) FROM Unit GROUP BY upper(trim(UnitCode))"))
    mapping = {}
    for u in pilot["units"]:
        refs = [r["unit"] for r in u["requisites"] if r["unit"]]
        for ref in [u, *refs]:
            code, uid = ref["UnitCode"], ref["ID"]
            if code in mapping and mapping[code] != uid:
                raise ValueError("Inconsistent pilot ID for "+code)
            mapping[code] = uid
    for code in sorted(codes - mapping.keys()):
        mapping[code] = local.get(code) or (1_000_000 + int(hashlib.sha256(code.encode()).hexdigest()[:7], 16))
    if len(set(mapping.values())) != len(mapping):
        raise ValueError("Unit ID collision requires manual resolution")
    return dict(sorted(mapping.items()))


def requirements(year, month):
    mandatory = (year, month) >= (2024, 9)
    return {"Core": 8, "Major": 8, "Elective": 6 if mandatory else 8, "WIL Placement": int(mandatory)}


def requisites(raw, owner, refs):
    if raw.lower() == "nil":
        return []
    anti = re.fullmatch(r"Nil \(Anti-req:\s*([A-Z]{3}\d{5})\)", raw, re.I)
    co = re.fullmatch(r"Co-req\s*:\s*([A-Z]{3}\d{5})", raw, re.I)
    expr = (anti or co)[1] if anti or co else raw
    if "/" in expr and "&" in expr:
        raise ValueError("Mixed prerequisite grouping requires review: "+raw)
    result = []
    for part in re.split(r"\s*[&/]\s*", expr):
        credits = re.fullmatch(r"(\d+)cp", part, re.I)
        rel = "min" if credits else "anti" if anti else "co" if co else "pre"
        if not credits and (part not in refs or part == owner):
            raise ValueError("Missing, invalid or self-referential requisite: "+repr(raw))
        result.append(dict(relationship=rel, logicalOperator="or" if "/" in expr else "and",
                           minCredits=int(credits[1]) if credits else None, unit=None if credits else refs[part]))
    return result


def offerings(label):
    terms = []
    if re.search(r"Feb|Mar", label, re.I):
        terms.append("Semester 1")
    if re.search(r"Aug|Sep", label, re.I):
        terms.append("Semester 2")
    if not terms:
        raise ValueError("Unrecognized offering: "+label)
    return terms


def isolated_year_typo(rows, year, month):
    """Only repair one printed year when all six semester labels corroborate the sequence."""
    periods = {(r["year"], r["term"]) for r in rows if r.get("year") and r["code"] not in ALIASES}
    if len(periods) != 6:
        return {}
    changes = {}
    positions = set()
    for level, label in periods:
        match = re.fullmatch(r"Semester ([12])\s*\|\s*(Feb/Mar|Aug/Sept) (20\d{2})", label or "")
        if not match or level not in (1,2,3):
            return {}
        position = 2*(level-1) + int(match[1])-1
        offset = position + (month==9)
        if match[2] != ("Feb/Mar", "Aug/Sept")[offset%2]:
            return {}
        positions.add(position)
        if int(match[3]) != year+offset//2:
            changes[(level,label)] = f"{match[2]} {year+offset//2}"
    return changes if len(positions)==6 and len(changes)==1 else {}


def normalize(name, evidence, ids, pilot):
    yy, mon, suffix = name.split("-")
    year, month, major = 2000+int(yy), MONTHS[mon], MAJORS[suffix]
    required = requirements(year, month)
    errors, warnings = list(evidence["errors"]), []
    legend = evidence["legend"]
    for c, n in required.items():
        expected = [n, n*(25 if c=="WIL Placement" else 12.5)]
        actual = legend.get(c, [0, 0])
        if actual != expected:
            if required["WIL Placement"] and legend.get("Elective")==[8,100] and (
                    (c=="Elective" and actual==[8,100]) or (c=="WIL Placement" and actual==[0,0])):
                warnings.append(LEGACY)
            else:
                errors.append(f"Printed {c} legend {actual} conflicts with expected {expected} (units, CP)")
    if re.search(r"including current semester", " ".join(evidence["sidebar"].split()), re.I):
        warnings.append(PASSED_ONLY)
    rows = evidence["rows"]
    corrected_dates = {} if year == 2023 else isolated_year_typo(rows, year, month)
    slot_labels = [s[2] for s in evidence["slots"]]
    if len(set(slot_labels)) != len(slot_labels):
        warnings.append("The sequence repeats an elective position label. Each printed position is reported separately.")
    units = {}
    refs = {r["unit"]["UnitCode"]: r["unit"] for u in pilot["units"] for r in u["requisites"]
            if r["relationship"]=="anti" and r["unit"]}
    for r in rows:
        if len(r["cells"])>1:
            refs[r["code"]] = dict(ID=ids[r["code"]], UnitCode=r["code"], Name=r["cells"][1].rstrip("*").strip())
    for r in rows:
        code, cells, cat = r["code"], r["cells"], r["category"]
        if code in ALIASES:
            if r["year"] and r["year"] < 3:
                warnings.append("WIL instructions appear under Year Two and specify placement during Year Three.")
            if code in units:
                errors.append("Duplicate WIL row "+code)
            placement_title = "Work-Integrated Learning (Internship)" if year == 2023 else "Work-Integrated Learning Internship"
            if (len(cells)!=2 or placement_title not in cells[1]
                    or "12 units" not in cells[1] or "Year Three" not in cells[1]):
                errors.append("Unrecognized WIL instructions")
            if not re.search(r"Winter\s*/\s*Summer", evidence["sidebar"], re.I):
                errors.append("Break offerings missing from placement instructions")
            units[code] = None
            continue
        try:
            if not CODE.fullmatch(code) or cat not in TYPES or len(cells) not in (3,4) or cells[0]!=code:
                raise ValueError("Unrecognized unit cell layout/category")
            title = cells[1]
            if not title or re.search(r"\b(Notes|Year Three|Unit Code|Elective \d|students must|semester)\b", title, re.I):
                raise ValueError("Missing unit name or explanatory text in name")
            try:
                rules = requisites(cells[2],code,refs)
            except ValueError as exc:
                errors.append(f"{code} (page 1, y={r['y']}): {exc}")
                rules = []  # Count the printed unit for triage. The error prevents export.
            u = dict(ID=ids[code], UnitCode=code, Name=title, CreditPoints=12.5, unitType=category(cat),
                     unitTypeId=TYPES[cat], sortOrder=len(units), requisites=rules)
            if len(cells)==4:
                if cat!="Elective" or r["year"] is not None:
                    raise ValueError("Unclear elective pool row")
                u["offeredTerms"] = offerings(cells[3])
            else:
                sem = re.fullmatch(r"(Semester [12])\s*\|\s*(.+?)\s*(20\d{2})", r["term"] or "")
                if not sem or r["year"] not in (1,2,3):
                    raise ValueError("Missing or invalid planned period")
                u.update(plannedYear=r["year"], plannedSemester=sem[1], plannedDates=sem[2].strip()+" "+sem[3],
                         offeredTerms=offerings(sem[2]))
                offset=(r["year"]-1)*2+int(sem[1][-1])-1+(month==9)
                if (r["year"],r["term"]) in corrected_dates:
                    u["plannedDates"]=corrected_dates[(r["year"],r["term"])]
                    warnings.append(f"Year {r['year']} printed {r['term']}. Normalized date {u['plannedDates']} follows the intake and the other five teaching periods.")
                elif int(sem[3])!=year+offset//2 or u["offeredTerms"]!=["Semester "+str(1+offset%2)]:
                    errors.append(f"Year {r['year']} calendar mismatch: {r['term']}")
            if code in units:
                prior = units[code]
                # The March AI sequence and Big Data Analytics minor use two official
                # titles for COS10022 (swinburne.edu.au/course/unit/c/cos10022/).
                # The scheduled row determines prescribed status.
                title_alias = (name == "25-Mar-CSAI" and code == "COS10022" and
                               prior["Name"] == "Introduction to Data Science*" and
                               prior.get("plannedYear") == 1 and prior.get("plannedSemester") == "Semester 2" and
                               r["section"] == "Minor | Big Data Analytics" and
                               cat == "Elective" and title == "Data Science Principles")
                if (r["year"] or (not title_alias and prior["Name"].rstrip("*")!=title.rstrip("*")) or
                    prior["unitTypeId"]!=u["unitTypeId"] or prior["requisites"]!=u["requisites"]):
                    raise ValueError("Conflicting repeated code, title, category, semester or requisites")
                if title_alias:
                    prior["Name"] = title + "*"
                    warnings.append(MARCH_AI_ALIAS)
                prior["offeredTerms"] = sorted(set(prior["offeredTerms"]+u["offeredTerms"]))
                warnings.append(code+" also appears in "+r["section"]+"; counted once")
            else:
                units[code] = u
        except ValueError as exc:
            errors.append(f"{code} (page 1, y={r['y']}): {exc}")
    wil_rows = [code for code in ALIASES if code in units]
    if required["WIL Placement"] and wil_rows!=[WIL]:
        errors.append("Mandatory canonical WIL row missing or ambiguous")
    if not wil_rows:
        warnings.append("Optional placement is supplied by the pre-September-2024 rule; the PDF has no placement row.")
    elif wil_rows != [WIL]:
        errors.append("Unexpected WIL identity "+str(wil_rows))
    units[WIL] = dict(ID=ids[WIL], UnitCode=WIL, Name="Completing Work-Integrated Learning Internship",
                      CreditPoints=25, unitTypeId=17, unitType=category("WIL Placement"), offeredTerms=["Winter","Summer"],
                      plannedYear=3, plannedDates="Winter or Summer before the final semester", requisites=[])
    items = list(filter(None,units.values()))
    for i,u in enumerate(items):
        u["sortOrder"]=i
    counts = Counter(u["unitType"]["Name"] for u in items)
    prescribed = [u["UnitCode"] for u in items if u["unitTypeId"]==1 and u["Name"].endswith("*")]
    for c in ("Core","Major"):
        if counts[c]!=8:
            errors.append(f"Found {counts[c]} unique {c} units; expected 8")
    if counts["Elective"]<required["Elective"]:
        errors.append("Too few distinct eligible elective choices")
    if required["WIL Placement"] and len(prescribed)!=2:
        errors.append(f"Expected two prescribed electives; found {prescribed}")
    if not required["WIL Placement"] and prescribed:
        warnings.append("PDF marks prescribed electives "+", ".join(prescribed)+". The legacy completion rule counts elective totals.")
    if not evidence["slots"] and not any(len(r["cells"])==4 for r in rows):
        warnings.append("Elective options come from the coloured recommended sequence. No separate choice table is printed.")
    for u in items:
        for req in u["requisites"]:
            ref = req["unit"]
            if not ref:
                continue
            if ref["UnitCode"] in units:
                target = units[ref["UnitCode"]]
                req["unit"] = {k: target[k] for k in ("ID", "UnitCode", "Name")}
            elif ref["UnitCode"] == "COS10011" and req["relationship"] == "anti":
                warnings.append("COS10011 is an external anti-requisite resolved through the validated pilot.")
            else:
                errors.append(f"{u['UnitCode']} references absent unit {ref['UnitCode']}")
    snapshot = dict(name=name, courseCode="BA-CS", major=major, intakeYear=year, intakeMonth=month,
                    wilCode=WIL, wilEquivalents=ALIASES, units=items,
                    plannerTemplate=dict(name=f"BA-CS {major} | {mon} {year}", requirements=[
                        dict(unitTypeId=TYPES[c],unitType=category(c),requiredCount=n) for c,n in required.items()]))
    return snapshot, list(dict.fromkeys(errors)), list(dict.fromkeys(warnings))
