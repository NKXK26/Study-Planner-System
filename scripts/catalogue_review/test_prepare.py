"""Offline tests. Run with python -B scripts/catalogue_review/test_prepare.py."""
import subprocess
import sys
import tempfile
import unittest
import os
from pathlib import Path
from unittest.mock import patch

from extract import parse_pdf
from decisions import DECISIONS, confirmed_evidence
from audit import classify
from normalize import ALIASES, LEGACY, PASSED_ONLY, normalize, requirements, isolated_year_typo
from prepare import bundle_of, central_check, select_source, promote
from sources import MAJORS, ROOT, digest, discover


def fixture(later):
    counts = requirements(2024, 9 if later else 2)
    rows = []
    for cat in ("Core","Major","Elective"):
        for i in range(counts[cat]):
            code = f"{cat[:3].upper()}{i:05}"
            name = f"Example unit {code}"+("*" if later and cat=="Elective" and i<2 else "")
            rows.append(dict(code=code,cells=[code,name,"Nil"],category=cat,year=1,
                             term="Semester 1 | "+("Aug/Sept" if later else "Feb/Mar")+" 2024",
                             section="Recommended sequence", y=i))
    if later:
        rows.append(dict(code="ICT20016",cells=["ICT20016","Work-Integrated Learning Internship; 12 units; Year Three"],
                         category="WIL Placement",year=2,section="Recommended sequence",y=100))
    evidence=dict(errors=[],legend={k:[n,n*(25 if k=="WIL Placement" else 12.5)]
                                    for k,n in counts.items() if n},sidebar="Winter/Summer",rows=rows,slots=[])
    ids={r["code"]:i+1 for i,r in enumerate(rows)}
    ids["ICT20016"]=1000
    return evidence, ids


class Preparation(unittest.TestCase):
    def test_cohorts_and_completion(self):
        for later in (False,True):
            for major in MAJORS:
                with self.subTest(later=later,major=major):
                    e, ids=fixture(later)
                    s, errors, _=normalize("24-"+("Sep" if later else "Feb")+"-"+major,e,ids,{"units":[]})
                    self.assertEqual(errors,[])
                    self.assertEqual(s["wilEquivalents"],ALIASES)
                    self.assertEqual(s["plannerTemplate"]["requirements"][-1]["requiredCount"],int(later))
                    central_check(s)  # Includes both WIL codes, with/without WIL and missing core.
    def test_contradiction(self):
        e, ids=fixture(True)
        e["legend"]["Elective"]=[8,100]
        e["rows"][-2]["cells"][1]+="*"
        _, errors, warnings=normalize("24-Sep-CSAI",e,ids,{"units":[]})
        self.assertIn(LEGACY,warnings)
        self.assertTrue(any("prescribed" in m for m in errors))

    def test_policy_needs_source_units(self):
        e, ids=fixture(True)
        e["legend"]["Elective"]=[8,100]
        del e["legend"]["WIL Placement"]
        e["sidebar"]+=" including current semester"
        s, errors, warnings=normalize("24-Sep-CSAI",e,ids,{"units":[]})
        self.assertEqual(errors,[])
        self.assertIn(LEGACY,warnings)
        self.assertIn(PASSED_ONLY,warnings)
        central_check(s)
        e["rows"].pop(-2)
        self.assertIn("Too few distinct eligible elective choices",normalize("24-Sep-CSAI",e,ids,{"units":[]})[1])

    def test_complete_calendar_evidence(self):
        e, ids=fixture(True)
        for i,r in enumerate(e["rows"][:-1]):
            slot=i%6
            r["year"]=1+slot//2
            r["term"]=f"Semester {slot%2+1} | "+("Aug/Sept " if slot%2==0 else "Feb/Mar ")+str(2024+(slot+1)//2+(slot==4))
        s, errors, warnings=normalize("24-Sep-CSAI",e,ids,{"units":[]})
        self.assertEqual(errors,[])
        self.assertEqual(s["units"][4]["plannedDates"],"Aug/Sept 2026")
        self.assertTrue(any("Aug/Sept 2027" in w and "Aug/Sept 2026" in w for w in warnings))
        self.assertEqual(isolated_year_typo(e["rows"][:5],2024,9),{})

    def test_repeated_pool_entry(self):
        e,ids=fixture(True)
        original=e["rows"][-2]
        pool=dict(original,year=None,section="Minor",term=None,cells=original["cells"]+["Feb/Mar"])
        e["rows"].append(pool)
        s,err,warnings=normalize("24-Sep-CSAI",e,ids,{"units":[]})
        self.assertFalse(err)
        u=next(u for u in s["units"] if u["UnitCode"]==pool["code"])
        self.assertEqual(u["offeredTerms"],["Semester 1","Semester 2"])
        self.assertTrue(any("counted once" in w for w in warnings))
        pool["cells"][1]="Conflicting title"
        self.assertTrue(any("Conflicting repeated" in m for m in normalize("24-Sep-CSAI",e,ids,{"units":[]})[1]))

    def test_march_ai_prescribed_title_and_minor_alias(self):
        e, ids = fixture(True)
        scheduled = next(r for r in e["rows"] if r["category"]=="Elective")
        scheduled.update(code="COS10022", cells=["COS10022","Introduction to Data Science*","Nil"],
                         term="Semester 2 | Aug/Sept 2025")
        ids["COS10022"] = ids.pop("ELE00000")
        for row in e["rows"]:
            if row is not scheduled and row.get("term"):
                row["term"] = "Semester 1 | Feb/Mar 2025"
        pool = dict(scheduled, year=None, term=None, section="Minor | Big Data Analytics",
                    cells=["COS10022","Data Science Principles","NIL","Feb/Mar & Aug/Sept"])
        e["rows"].append(pool)
        s, errors, warnings = normalize("25-Mar-CSAI",e,ids,{"units":[]})
        self.assertEqual(errors,[])
        issue = "COS10022 (page 1): Conflicting repeated code, title, category, semester or requisites"
        self.assertFalse(classify(issue, {"warnings":warnings,"errors":errors}, e)[3])
        units = [u for u in s["units"] if u["UnitCode"]=="COS10022"]
        self.assertEqual(len(units),1)
        self.assertEqual(units[0]["Name"],"Data Science Principles*")
        self.assertEqual(units[0]["plannedSemester"],"Semester 2")
        self.assertEqual(units[0]["offeredTerms"],["Semester 1","Semester 2"])
        for key,value in [("category","Major"),("year",2),
                          ("cells",["COS10022","Data Science Principles","COR00000","Feb/Mar"]),
                          ("cells",["COS10022","Unconfirmed title","Nil","Feb/Mar"])]:
            with self.subTest(key=key), patch.dict(pool,{key:value}):
                self.assertTrue(normalize("25-Mar-CSAI",e,ids,{"units":[]})[1])

    def test_unresolved_academic_evidence_blocks_export(self):
        for case in ("blank prerequisite","one prescribed","duplicate semester"):
            with self.subTest(case=case):
                e, ids = fixture(True)
                if case=="blank prerequisite":
                    e["rows"][0]["cells"][2] = ""
                    expected = "Missing, invalid or self-referential requisite"
                elif case=="one prescribed":
                    e["rows"][-6]["cells"][1] = "Unstarred elective"
                    expected = "Expected two prescribed electives"
                else:
                    e["rows"][-2] = dict(e["rows"][-3])
                    expected = "Too few distinct eligible elective choices"
                errors = normalize("24-Sep-CSAI",e,ids,{"units":[]})[1]
                self.assertTrue(any(expected in error for error in errors),errors)

    def test_promotion(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent=Path(tmp)
            target=parent/"review"
            def fail(stage):
                (stage/"partial").touch()
                self.assertFalse(target.exists())
                raise ValueError("test failure")
            with self.assertRaises(ValueError):
                promote(target,fail)
            self.assertEqual(list(parent.iterdir()),[])
            promote(target,lambda stage:(stage/"manifest.json").write_text("complete"))
            with self.assertRaises(FileExistsError):
                promote(target,fail)
            self.assertEqual((target/"manifest.json").read_text(),"complete")
            if os.name=="nt":
                control=parent/"ordinary"
                control.mkdir()
                (control/"manifest.json").touch()
                def acl(file):
                    kind = "Directory" if file.is_dir() else "File"
                    command = f"[IO.{kind}]::GetAccessControl($env:ACL_TEST_PATH).GetSecurityDescriptorSddlForm('Access')"
                    return subprocess.check_output(["powershell","-NoProfile","-Command",command],
                        env={**os.environ,"ACL_TEST_PATH":str(file)}, text=True).strip()
                self.assertEqual(acl(target),acl(control))
                self.assertEqual(acl(target/"manifest.json"),acl(control/"manifest.json"))

    def test_sources(self):
        self.assertTrue(select_source([]))
        self.assertTrue(select_source([{},{}]))
        page=b"<h3>Study Planner 2025</h3><table><tr><td>BA-CS</td><td><em>Cybersecurity</em><em>March intake</em></td><td><a href='/other.pdf'>Download</a></td></tr></table>"
        self.assertTrue(discover(page)[0]["errors"])
        with tempfile.TemporaryDirectory() as work, patch("extract.CACHE",Path(work)):
            source=dict(filename="bad.pdf",sha256=digest(b"not PDF"))
            with self.assertRaises(FileNotFoundError):
                parse_pdf(source)
            Path(work,"bad.pdf").write_bytes(b"not PDF")
            with self.assertRaisesRegex(ValueError,"not a PDF"):
                parse_pdf(source)
            source["sha256"]="0"*64
            with self.assertRaisesRegex(ValueError,"checksum"):
                parse_pdf(source)

    def test_bundle_protection(self):
        snapshot=dict(name="24-Feb-CSAI",major=MAJORS["CSAI"],intakeMonth=2,intakeYear=2024,courseCode="BA-CS")
        valid=dict(name=snapshot["name"],status="valid",alreadyPresent=None)
        drafts={valid["name"]:snapshot}
        self.assertEqual(bundle_of([dict(valid,name="25-Mar-CSCS"),dict(valid,status="blocked"),
                                    dict(valid,alreadyPresent=True),valid],drafts),[snapshot])
        with self.assertRaisesRegex(ValueError,"Duplicate"):
            bundle_of([valid,valid],drafts)
        with self.assertRaisesRegex(ValueError,"protected"):
            bundle_of([valid],{valid["name"]:dict(snapshot,major="Cybersecurity",intakeYear=2025,intakeMonth=3)})

    def test_preparation_has_no_publication_mode(self):
        result=subprocess.run([sys.executable,"-B","scripts/catalogue_review/prepare.py","--publish"],
                              cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(result.returncode,2)
        self.assertIn("unrecognized arguments",result.stderr)


class ConfirmedDecisions(unittest.TestCase):
    def test_blank_exception_is_limited_to_one_unit(self):
        decision = next(d for d in DECISIONS if d["planner"] == "24-Sep-CSCS")
        name, checksum = decision["planner"], decision["sourceSha256"]
        evidence, ids = fixture(True)
        target, other = evidence["rows"][:2]
        ids["TNE10006"] = ids.pop(target["code"])
        target["code"] = target["cells"][0] = "TNE10006"
        target["cells"][2] = other["cells"][2] = ""
        approved = confirmed_evidence("BA-CS", name, checksum, evidence)
        self.assertEqual(target["cells"][2], "")
        self.assertEqual(approved["rows"][0]["cells"][2], "Nil")
        errors = normalize(name, approved, ids, {"units":[]})[1]
        self.assertEqual(len(errors), 1)
        self.assertIn(other["code"], errors[0])
        self.assertIn("requisite", errors[0])
        self.assertIs(confirmed_evidence("BA-CS", "25-Sep-CSCS", checksum, evidence), evidence)

    def test_prescribed_exception_is_scoped_and_preserves_printed_fields(self):
        names = {"25-Sep-CSAI", "26-Mar-CSAI", "26-Sep-CSAI"}
        for d in (entry for entry in DECISIONS if entry["planner"] in names):
            with self.subTest(planner=d["planner"]):
                row = dict(code="COS10022", category="Elective", year=2, term="Semester 1",
                           cells=["COS10022","Printed title","COS10003"])
                other = dict(code="COS30017", category="Elective", cells=["COS30017","Other","Nil"])
                evidence = {"rows":[row,other]}
                name, checksum = d["planner"], d["sourceSha256"]
                result = confirmed_evidence("BA-CS", name, checksum, evidence)
                self.assertEqual(result["rows"], [dict(row,cells=["COS10022","Printed title*","COS10003"]),other])
                self.assertEqual(row["cells"][1], "Printed title")
                for course, planner in [("BA-OTHER",name),("BA-CS","24-Sep-CSAI"),
                                        ("BA-CS","25-Mar-CSAI"),("BA-CS","26-Sep-CSSD")]:
                    self.assertIs(confirmed_evidence(course, planner, checksum, evidence), evidence)
                for rows in ([other], [row,row], [dict(row,category="Major")]):
                    with self.assertRaises(ValueError):
                        confirmed_evidence("BA-CS",name,checksum,{"rows":rows})
                with self.assertRaises(ValueError):
                    confirmed_evidence("BA-CS",name,"0"*64,evidence)

    def test_locked_decision_excludes_even_a_mislabelled_valid_record(self):
        name = "26-Sep-CSDS"
        d = next(entry for entry in DECISIONS if entry["planner"] == name)
        self.assertIs(d["allowDraft"], False)
        with self.assertRaisesRegex(ValueError,"locked"):
            confirmed_evidence("BA-CS",name,d["sourceSha256"],{"rows":[]})
        record = dict(name=name, status="blocked", alreadyPresent=False)
        self.assertEqual(bundle_of([record],{}), [])
        with self.assertRaisesRegex(ValueError,"locks"):
            bundle_of([dict(record,status="valid")],{name:dict(name=name,courseCode="BA-CS")})


if __name__=="__main__":
    unittest.main()
