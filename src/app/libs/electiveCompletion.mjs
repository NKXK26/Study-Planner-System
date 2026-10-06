import {normalizeCode} from './doubleMajorChecker.mjs';

// Programme rules supplied by the project owner. Slot allocations never add CP
// to the transcript or satisfy specific core/major prerequisites.
export function electiveCategoryName(units) {
  const names=[...new Set(units.map(u=>u.unitType?.Name).filter(Boolean))];
  const exact=names.find(n=>n.trim().toLowerCase()==='elective');
  const options=names.filter(n=>/electives?$/i.test(n.trim()));
  return exact||(options.length===1?options[0]:null);
}
export function electiveCompletion(transcript,units,category) {
  if(category!==electiveCategoryName(units))return null;
  const earned=new Map(transcript.completed.map(u=>[normalizeCode(u.code),u]));
  const allocations=new Map();
  for(const u of units.filter(u=>u.unitType?.Name===category)) {
    const code=normalizeCode(u.UnitCode),entry=earned.get(code);
    if(Number.isFinite(u.CreditPoints)&&u.CreditPoints>0&&entry?.earned>=u.CreditPoints)allocations.set(code,{code,slots:1,reason:'Completed planner elective'});
  }
  for(const entry of earned.values()) {
    const code=normalizeCode(entry.code);
    if(/^AE\d+$/.test(code)&&entry.earned>=12.5)allocations.set(code,{code,slots:1,reason:'Approved elective'});
    if(code==='ICT20016'&&entry.earned>=25)allocations.set(code,{code,slots:2,reason:'Work Integrated Learning Placement - ICT (3 month)'});
  }
  return {completedCount:[...allocations.values()].reduce((n,a)=>n+a.slots,0),allocations:[...allocations.values()]};
}
