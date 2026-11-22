"""Offline tests. Run with python -B scripts/catalogue_review/test_prepare.py."""
import subprocess
import sys
import tempfile
import unittest
import os
from pathlib import Path
from unittest.mock import patch

from extract import parse_pdf
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


if __name__=="__main__":
    unittest.main()
