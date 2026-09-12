const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
(async () => {
  const { parseTranscript, checkDoubleMajor } = await import('../src/app/libs/doubleMajorChecker.mjs');
  const header = ['Course', 'Status', 'Earned', 'Grade'];
  const transcript = parseTranscript([header, ['AAA100', 'Future', 0, ''], ['AAA100', 'Complete', 0, 'N'], ['AAA100', 'Complete', 12.5, 'HD'], ['AAA100', 'Complete', 12.5, 'HD'], ['BBB100', 'Complete', 12.5, 'EXM']]);
  assert.equal(transcript.completed.length, 2);
  assert.equal(transcript.duplicates, 1);
  assert.equal(transcript.excluded.length, 2);
  assert.throws(() => parseTranscript([['Unknown']]));
  const unit = code => ({UnitCode:code, Name:code, CreditPoints:12.5,unitType:{Name:'Major'}});
  const planners = [{id:1,name:'A',units:[unit('AAA100'),unit('BBB100'),unit('AAA100')]},{id:2,name:'B',units:[unit('AAA100'),unit('CCC100')]}];
  const result = checkDoubleMajor(transcript, planners);
  assert.equal(result.shared.length, 1);
  assert.equal(result.uniqueCompletedCredits, 25);
  assert.equal(result.covered, false);
  assert.equal(result.majors[1].remaining, 1);
  const full = { ...transcript, completed: [...transcript.completed, {code:'CCC100',earned:12.5}] };
  assert.equal(checkDoubleMajor(full, planners).covered, false, 'Missing templates must remain provisional');
  const configured = planners.map(p=>({...p,plannerTemplate:{requirements:[{unitType:{Name:'Major'},requiredCount:2}]}}));
  assert.equal(checkDoubleMajor(full, configured).covered, true);
  assert.equal(checkDoubleMajor({...full,completed:full.completed.map(u=>u.code==='CCC100'?{...u,earned:6.25}:u)},configured).covered,false);
  assert.throws(() => checkDoubleMajor(transcript, [planners[0], {...planners[0],id:3}]));
  console.log('Logic regression checks passed.');
  if (process.argv[2]) {
    const p = new PrismaClient();
    try {
      const records = await p.studyPlanner.findMany({include:{studyPlannerUnits:{include:{unit:true,unitType:true}},plannerTemplate:{include:{requirements:{include:{unitType:true}}}}}});
      const candidates = records.filter(p=>/23.*CS/.test(p.name) && p.studyPlannerUnits.some(j=>j.unitType?.Name==='Major')).map(p=>({...p,units:p.studyPlannerUnits.map(j=>({...j.unit,unitType:j.unitType}))}));
      for (const file of fs.readdirSync(process.argv[2]).filter(f=>/^Graduated_BCS.*\.xlsx$/.test(f))) {
        const w = XLSX.readFile(path.join(process.argv[2],file));
        const t = parseTranscript(XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{header:1}));
        assert(t.completed.length > 0);
        console.log(file, 'earned:',t.completed.length, 'excluded:',t.excluded.length);
        for(const candidate of candidates) {
          const other = candidates.find(v=>v.id!==candidate.id);
          try { const r=checkDoubleMajor(t,[candidate,other]); console.log(candidate.name, r.majors[0].matched+'/'+r.majors[0].required); } catch(e) { if(!e.message.includes('identical')) throw e; }
        }
      }
    } finally { await p.$disconnect(); }
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
