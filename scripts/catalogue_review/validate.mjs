import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkedSnapshot } from '../../central/model.mjs';
import { buildBcsPlan } from '../../src/app/libs/bcsPlannerRules.mjs';

export function validateDraft(p) {
  checkedSnapshot(p);
  const majors = {CSCS:'Cybersecurity', CSDS:'Data Science', CSAI:'Artificial Intelligence',
    CSIOT:'Internet of Things', CSSD:'Software Development'};
  const month = {2:'Feb', 3:'Mar', 9:'Sep'}[p.intakeMonth];
  const suffix = Object.keys(majors).find(key => majors[key] === p.major);
  assert.ok(suffix && month && [2023,2024,2025,2026].includes(p.intakeYear));
  if (p.intakeYear === 2023) assert.ok([2,9].includes(p.intakeMonth));
  assert.equal(p.name, [p.intakeYear % 100,month,suffix].join('-'));
  assert.equal(p.courseCode, 'BA-CS');
  const mandatory = p.intakeYear > 2024 || (p.intakeYear === 2024 && p.intakeMonth >= 9);
  const required = {Core:8, Major:8, Elective:mandatory ? 6 : 8, 'WIL Placement':Number(mandatory)};
  assert.equal(p.plannerTemplate.requirements.length,4);
  assert.deepEqual(Object.fromEntries(p.plannerTemplate.requirements.map(r=>[r.unitType.Name,r.requiredCount])),required);
  assert.equal(p.wilCode,'ICT20016');
  assert.deepEqual([...p.wilEquivalents].sort(),['ICT20016','ICT20026']);
  const ids = new Set(), codes = new Set();
  const typeIds = {Core:2, Major:3, Elective:1, 'WIL Placement':17};
  for (const u of p.units) {
    assert.match(u.UnitCode,/^(?!MPU)[A-Z]{3}\d{5}$/);
    assert.ok(!ids.has(u.ID) && !codes.has(u.UnitCode), 'Duplicate identity '+u.UnitCode);
    ids.add(u.ID);
    codes.add(u.UnitCode);
    assert.ok(u.Name.trim() && !/\b(?:Elective \d+|Notes|Unit Code|students must)\b/i.test(u.Name));
    assert.equal(u.unitTypeId,typeIds[u.unitType.Name]);
    assert.equal(u.unitType.ID,u.unitTypeId);
    const wil = u.unitTypeId === 17;
    assert.equal(u.CreditPoints,wil ? 25 : 12.5);
    if (wil) {
      assert.equal(u.UnitCode,p.wilCode);
      assert.equal(u.plannedYear,3);
      assert.ok(!u.plannedSemester);
      if (p.intakeYear === 2023 && p.intakeMonth === 9 && u.plannedDates === 'Winter Term | Jun/Jul 2025') {
        assert.deepEqual(u.offeredTerms,['Winter']);
      } else assert.deepEqual([...u.offeredTerms].sort(), ['Summer','Winter']);
    } else {
      assert.ok(u.offeredTerms.length && u.offeredTerms.every(t=>['Semester 1','Semester 2'].includes(t)));
      if (u.plannedYear || u.plannedSemester) {
        assert.ok([1,2,3].includes(u.plannedYear) && ['Semester 1','Semester 2'].includes(u.plannedSemester));
      } else assert.equal(u.unitTypeId,1);
    }
  }
  const ofType = id => p.units.filter(u => u.unitTypeId === id);
  const byCode = new Map(p.units.map(u=>[u.UnitCode,u]));
  for (const u of p.units) {
    for (const req of u.requisites) {
      if (req.relationship === 'min') {
        assert.ok(req.minCredits > 0 && req.unit === null);
        continue;
      }
      assert.ok(['pre','co','anti'].includes(req.relationship) && req.unit.UnitCode !== u.UnitCode);
      const target = byCode.get(req.unit.UnitCode);
      if (target) assert.equal(req.unit.ID,target.ID);
      else assert.ok(req.relationship==='anti' && req.unit.UnitCode==='COS10011' && req.unit.ID===6);
    }
  }
  assert.equal(ofType(2).length,8);
  assert.equal(ofType(3).length,8);
  assert.equal(ofType(17).length,1);
  const electives = ofType(1);
  const marked = electives.filter(u=>u.Name.endsWith('*'));
  if (mandatory) assert.equal(marked.length,2);
  assert.ok(electives.length >= required.Elective);
  const six = mandatory ? [...marked,...electives.filter(u=>!marked.includes(u)).slice(0,4)] : electives.slice(0,6);
  const academic = [...ofType(2),...ofType(3),...six].map(u=>u.UnitCode);
  const eligible = codes => buildBcsPlan(p,codes.map(code=>({code})),{order:mandatory ? 2024092 : 2024021}).eligible;
  for (const wil of p.wilEquivalents) {
    assert.ok(eligible([...academic,wil]));
    assert.ok(!eligible([...academic.slice(1),wil]));
  }
  assert.ok(!eligible(academic));
  if (p.intakeYear === 2023) {
    assert.ok(eligible([...academic,...electives.slice(6,8).map(u=>u.UnitCode)]));
    assert.ok(!eligible([...academic,electives[6].UnitCode]));
    assert.ok(!eligible([...academic.slice(0,-1),...p.wilEquivalents]));
    assert.ok(!eligible([...academic,electives[6].UnitCode,'MPU3193']));
  }
  assert.equal(eligible([...academic,...electives.map(u=>u.UnitCode)]),!mandatory);
  return p;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateDraft(JSON.parse(readFileSync(0,'utf8')));
}
