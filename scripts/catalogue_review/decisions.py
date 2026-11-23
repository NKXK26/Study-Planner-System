"""Manual decisions for the offline BA-CS review, bound to a planner and PDF revision."""
import json
from copy import deepcopy
from pathlib import Path

REGISTER = Path(__file__).with_name("confirmed-academic-decisions.json")
DECISIONS = json.loads(REGISTER.read_bytes())


def confirmed_evidence(course, name, source_hash, evidence):
    decision = next((d for d in DECISIONS if (d["courseCode"], d["planner"]) == (course, name)), None)
    if decision is None:
        return evidence
    if decision["allowDraft"] is not True or decision["sourceSha256"] != source_hash:
        raise ValueError(f"{name}: locked planner or different source revision")
    result = deepcopy(evidence)
    rows = [r for r in result["rows"] if r["code"] == decision["unitCode"]]
    if len(rows) != 1:
        raise ValueError(f"{name}: expected exactly one row for {decision['unitCode']}")
    row = rows[0]
    cells = row["cells"]
    if len(cells) != 3 or cells[0] != row["code"]:
        raise ValueError(f"{name}: source row layout changed")
    if decision["decisionType"] == "prerequisite" and decision["confirmedValue"] == "Nil":
        if cells[2] != "" or row["category"] != "Core":
            raise ValueError(f"{name}: expected blank prerequisite on Core row")
        cells[2] = "Nil"
    elif decision["decisionType"] == "prescribedElective" and decision["confirmedValue"] is True:
        if row["category"] != "Elective" or not cells[1] or cells[1].endswith("*"):
            raise ValueError(f"{name}: expected an unmarked Elective")
        cells[1] += "*"
    else:
        raise ValueError(f"{name}: unsupported decision")
    return result
