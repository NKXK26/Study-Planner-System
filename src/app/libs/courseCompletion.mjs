import {electiveCompletion} from './electiveCompletion.mjs';
import {normalizeCode} from './doubleMajorChecker.mjs';

export function isCourseCompletionRequest(question) {
  const q=String(question);
  if(/\b(?:official|approval|approve|guarantee|eligible|eligibility|qualify)\b|\b(?:can|may|am) i\b.*graduat|\b(?:don't|do not|never)\b/i.test(q))return false;
  return /\b(?:complete|finish|remaining|left|take|need|units?|subjects?)\b/i.test(q)&&/\b(?:studies|study|degree|course|programme|program|graduate|graduation)\b/i.test(q)
    || /\b(?:remaining|unfinished)\s+(?:units?|subjects?)\b|\b(?:units?|subjects?)\b.*\bleft\b/i.test(q);
}

// Category counts describe slots within a pool, not an obligation to take every option.
export function courseCompletionAudit({transcript,planner,plan}) {
  const earned=new Map(transcript.completed.map(u=>[normalizeCode(u.code),u.earned]));
  const units=[...new Map(planner.units.map(u=>[normalizeCode(u.UnitCode),u])).values()];
  const passed=u=>Number.isFinite(u.CreditPoints)&&u.CreditPoints>0&&(earned.get(normalizeCode(u.UnitCode))||0)>=u.CreditPoints;
  const names=[...new Set([...units.map(u=>u.unitType?.Name||'Uncategorised'),...(planner.plannerTemplate?.requirements||[]).map(r=>r.unitType?.Name).filter(Boolean)])];
  const priority=name=>/elective/i.test(name)?2:/core/i.test(name)?0:/major/i.test(name)?1:3;
  names.sort((a,b)=>priority(a)-priority(b)||a.localeCompare(b));
  const warnings=[];
  const categories=names.map(name=>{
    const pool=units.filter(u=>(u.unitType?.Name||'Uncategorised')===name);
    const requirements=(planner.plannerTemplate?.requirements||[]).filter(r=>r.unitType?.Name===name);
    const completed=pool.filter(passed);
    const elective=electiveCompletion(transcript,units,name);
    const completedCount=elective?.completedCount??completed.length;
    const required=requirements.length===1&&Number.isInteger(requirements[0].requiredCount)&&requirements[0].requiredCount>=0&&requirements[0].requiredCount<=pool.length?requirements[0].requiredCount:null;
    if(required===null)warnings.push(name+': the required category count is missing or inconsistent. Unfinished pool units are options, not verified graduation requirements.');
    const remainingCount=required===null?null:Math.max(0,required-completedCount);
    const options=remainingCount===0?[]:pool.filter(u=>!passed(u)).map(u=>{
      const candidate=plan.candidates.find(c=>c.code===normalizeCode(u.UnitCode));
      return {code:normalizeCode(u.UnitCode),name:u.Name,credits:u.CreditPoints,status:candidate?.status||'review',reasons:[...(candidate?.reasons||[]),...(candidate?.unknown||[])]};
    });
    return {name,requiredCount:required,completedCount,remainingCount,options,allocations:elective?.allocations||[]};
  });
  const known=new Set(units.map(u=>normalizeCode(u.UnitCode)));
  const allocated=new Set(categories.flatMap(c=>c.allocations.map(a=>a.code)));
  const unmatched=transcript.completed.filter(u=>!known.has(normalizeCode(u.code))&&!allocated.has(normalizeCode(u.code)));
  if(unmatched.length)warnings.push('Earned entries outside this planner ('+unmatched.map(u=>u.code).join(', ')+') have not automatically been allocated to core, major or elective requirements. Generic exemptions need an approved mapping.');
  return {categories,unmatched,countsVerified:categories.every(c=>c.requiredCount!==null),warnings};
}

export function formatCompletionAudit(audit) {
  const lines=['Remaining requirements against this planner:'];
  for(const category of audit.categories){
    lines.push('\n'+category.name+': '+(category.requiredCount===null?category.completedCount+(category.allocations?.length?' elective slots satisfied':' matched completed')+'; required count not configured.':category.completedCount+(category.allocations?.length?' elective slots satisfied / ':' matched completed / ')+category.requiredCount+' required; '+category.remainingCount+' more needed.'));
    if(category.allocations?.some(a=>a.reason!=='Completed planner elective'))lines.push('Elective slot allocations: '+category.allocations.filter(a=>a.reason!=='Completed planner elective').map(a=>a.code+' counts as '+a.slots+' elective slot'+(a.slots===1?'':'s')).join('; ')+'. Earned CP is counted once.');
    if(category.options.length){
      if(category.remainingCount!==null)lines.push('Choose '+category.remainingCount+' from this unfinished pool; you do not need every option:');
      for(const u of category.options)lines.push('- '+u.code+' '+u.name+' ('+(Number.isFinite(u.credits)?u.credits:'unknown')+' CP)'+(u.reasons.length?' — '+u.reasons.join('; '):''));
    }
  }
  if(audit.warnings.length)lines.push('\nCategory checks: '+audit.warnings.join(' '));
  lines.push('\nThis compares stored planner requirements, not official graduation eligibility. Units outside the next-semester draft may need later semesters.');
  return lines.join('\n');
}
