"""Confirmed 2023 rules; always retain the raw PDF rows in the review package."""
from collections import defaultdict
from copy import deepcopy

from normalize import offerings

WINTER = "Winter Term | Jun/Jul 2025"
TITLES = {"Introduction to Data Science", "Data Science Principles"}


def merge_pair(code, first, second):
    a, b = first["cells"], second["cells"]
    if (first["category"] != "Elective" or second["category"] != "Elective"
            or second["year"] is not None or second["section"] != "Minor | Big Data Analytics"
            or len(b) != 4 or not a or a[0] != code or b[0] != code):
        raise ValueError("Unconfirmed duplicate row layout")
    if code == "COS20083":
        if (first["section"] != "Recommended Elective Units" or first["year"] is not None or a != b):
            raise ValueError("The two pool rows differ")
        return offerings(a[3])
    if (code != "COS10022" or len(a) != 3 or first["year"] != 1
            or not first["term"].startswith("Semester 2 | ") or not a[1].endswith("*")
            or a[1][:-1] not in TITLES or b[1] not in TITLES or a[2].casefold() != b[2].casefold()
            or b[3] != "Feb/Mar & Aug/Sept"):
        raise ValueError("Unconfirmed title, prerequisite, semester, marker or offering")
    if a[1][:-1] != b[1]:
        a[1] = "Data Science Principles*"
    return offerings(b[3])


def resolve(name, evidence):
    result = deepcopy(evidence)
    rows = result["rows"]
    grouped = defaultdict(list)
    audit, errors, merged = [], [], {}
    for row in rows:
        grouped[row["code"]].append(row)
    for code, matches in grouped.items():
        if len(matches) == 1:
            continue
        original = deepcopy(matches)
        try:
            if len(matches) != 2:
                raise ValueError("Expected two occurrences")
            merged[code] = merge_pair(code,*matches)
        except ValueError as exc:
            errors.append(f"Page 1 {code} rows {[r['y'] for r in matches]}: {exc}")
            continue
        rows.remove(matches[1])
        audit.append(dict(reason="One elective unit across both printed rows",page=1,
                          printed=original,canonical=deepcopy(matches[0]),offeredTerms=merged[code]))
    if "-Sep-" in name:
        wil = grouped["ICT20016"]
        if (len(wil)!=1 or wil[0]["term"]!=WINTER or wil[0]["year"]!=2
                or "Optional" not in wil[0]["cells"][0] or "12 units" not in wil[0]["cells"][-1]
                or "Year Three" not in wil[0]["cells"][-1]):
            errors.append("Page 1: Confirm the optional ICT20016 transition row and its threshold.")
        else:
            audit.append(dict(reason="Optional transition break immediately before Year Three; 12 qualifying passes required",
                              page=1,printed=deepcopy(wil),canonical=dict(plannedYear=3,plannedDates=WINTER,offeredTerms=["Winter"])))
    # Apply the correction to both named units and empty elective positions.
    for row in rows:
        year, term = row["year"], row["term"]
        if name=="23-Sep-CSCS" and (year,term)==(3,"Semester 2 | Feb/Mar 2025"):
            row["term"]="Semester 2 | Feb/Mar 2026"
            reason="Final semester follows Aug/Sept 2025"
        elif name=="23-Sep-CSIOT" and year==2 and term in ("Semester 1 | Aug/Sept 2025","Semester 2 | Feb/Mar 2026"):
            row["year"]=3
            reason="Year Three heading is printed below both tables, before Recommended Elective Units"
        else:
            continue
        audit.append(dict(page=1,y=row["y"],code=row["code"],reason=reason,printed=[year,term],
                          canonical=[row["year"],row["term"]]))
    for slot in result["slots"]:
        year,term,label=slot
        if name=="23-Sep-CSCS" and (year,term)==(3,"Semester 2 | Feb/Mar 2025"):
            slot[1]="Semester 2 | Feb/Mar 2026"
        elif name=="23-Sep-CSIOT" and year==2 and term in ("Semester 1 | Aug/Sept 2025","Semester 2 | Feb/Mar 2026"):
            slot[0]=3
        else:
            continue
        audit.append(dict(page=1,position=label,printed=[year,term],canonical=slot[:2],reason="Same corrected teaching table"))
    return result,merged,audit,errors
