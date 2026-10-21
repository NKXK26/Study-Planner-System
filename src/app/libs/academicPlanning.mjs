import {checkUploadedRule} from './uploadedPlannerRules.mjs';
import {electiveCompletion} from './electiveCompletion.mjs';
import {projectPrerequisite,MAX_UNITS_PER_SEMESTER,MAX_CREDITS_PER_SEMESTER} from './semesterRules.mjs';
import { normalizeCode, parseTranscript } from './doubleMajorChecker.mjs';

export function reviewDpa(document, corrections = []) {
  const rows = document.rows || document.text.split(/\r?\n/).map(line => line.split(/\t|\s{2,}|\s*\|\s*/));
  const original = parseTranscript(rows);
  if (!Array.isArray(corrections) || corrections.length > 300) throw new Error('Too many DPA corrections.');
  const entries = [...original.completed, ...original.excluded].sort((a,b) => a.row-b.row);
  const edits = new Map();
  for (const edit of corrections) {
    if (!edit || !entries.some(u=>u.row===edit.row) || edits.has(edit.row) || !['Complete','Current','Future','Failed','Exempted'].includes(edit.status) || typeof edit.grade !== 'string' || edit.grade.length > 12 || typeof edit.earned !== 'number' || !Number.isFinite(edit.earned) || edit.earned < 0 || edit.earned > 100 || typeof edit.reason !== 'string' || !edit.reason.trim() || edit.reason.length > 300) throw new Error('Each correction needs a valid row, status, grade, earned credits and a reason.');
    edits.set(edit.row, edit);
  }
  const reviewedRows = [['Course','Course Title','Status','Grade','Earned']];
  for (const unit of entries) {
    const edit = edits.get(unit.row);
    reviewedRows.push([unit.code, unit.name, edit?.status || unit.status, edit?.grade ?? unit.grade, edit?.earned ?? (Number.isFinite(unit.earned) ? unit.earned : 0)]);
  }
  return { original, transcript: parseTranscript(reviewedRows), corrections };
}

export function semesterPlan({ transcript, planner, relations, term, maxCredits, maxUnits, provisional=false, preferences={excluded:[],deferred:{}}, starting=true }) {
  if (typeof term !== 'string' || !term.trim() || !Number.isFinite(maxCredits) || maxCredits <= 0 || maxCredits > 100 || !Number.isInteger(maxUnits) || maxUnits < 1 || maxUnits > 8) throw new Error('Choose a semester, 1–8 units and a credit cap up to 100.');
  const earned = new Map(transcript.completed.map(u=>[normalizeCode(u.code),u.earned]));
  const totalEarned = [...earned.values()].reduce((a,b)=>a+b,0);
  const raw = planner.units;
  const units = [...new Map(raw.map(u=>[normalizeCode(u.UnitCode),u])).values()];
  const passed = u => Number.isFinite(u?.CreditPoints) && u.CreditPoints > 0 && (earned.get(normalizeCode(u.UnitCode)) || 0) >= u.CreditPoints;
  const requirements = planner.plannerTemplate?.requirements || [];
  const counts = new Map();
  for (const requirement of requirements) {
    const name = requirement.unitType?.Name;
    const pool = units.filter(u=>u.unitType?.Name===name);
    if (name && Number.isInteger(requirement.requiredCount) && requirement.requiredCount>=0 && requirement.requiredCount<=pool.length) counts.set(name, Math.max(0, requirement.requiredCount-(electiveCompletion(transcript,units,name)?.completedCount??pool.filter(passed).length)));
  }
  if(provisional){
    maxUnits=Math.min(maxUnits,MAX_UNITS_PER_SEMESTER);maxCredits=Math.min(maxCredits,MAX_CREDITS_PER_SEMESTER);
    for(const u of units)if(!counts.has(u.unitType?.Name))counts.set(u.unitType?.Name,units.filter(v=>v.unitType?.Name===u.unitType?.Name&&!passed(v)).length);
  }
  const candidates = units.filter(u=>!passed(u)).map(u=>{
    const reasons = [], unknown = [];
    const group = u.unitType?.Name;
    if(preferences.excluded?.includes(normalizeCode(u.UnitCode)))reasons.push('Excluded by your elective preference');
    if(starting&&preferences.deferred?.[normalizeCode(u.UnitCode)]&&preferences.deferred[normalizeCode(u.UnitCode)]!==term)reasons.push('Deferred by you until '+preferences.deferred[normalizeCode(u.UnitCode)]);
    if (raw.filter(v=>normalizeCode(v.UnitCode)===normalizeCode(u.UnitCode)).length>1) unknown.push('Duplicate unit records require version review');
    if (!Number.isFinite(u.CreditPoints) || u.CreditPoints<=0) unknown.push('Credit points missing');
    if (u.Availability?.toLowerCase()!=='published') reasons.push('Unit is not published');
    const terms = (u.UnitTermOffered || []).map(t=>t.TermType);
    if (!terms.length) unknown.push('No recorded semester offering');
    else if (!terms.includes(term)) reasons.push(`Not recorded for ${term}`);
    if (!counts.has(group)) unknown.push('Category requirement missing or inconsistent');
    else if (!counts.get(group)) reasons.push('Category requirement already covered');
    const rules = relations.filter(r=>r.UnitID===u.ID);
    const uploaded=u.uploadedRule?checkUploadedRule(u.uploadedRule,earned,totalEarned,units):null;
    if(uploaded){reasons.push(...uploaded.reasons);unknown.push(...uploaded.unknown);}
    // Uniform AND/OR records form a flat expression even when pre/co/min types differ.
    // Mixed or unsupported operators below still hold the unit for review.
    if (!rules.length && !provisional) unknown.push('No requisite records; unrestricted enrolment is not verified');
    const projectA=projectPrerequisite(u,units);
    if(projectA){
      const first=units.find(v=>normalizeCode(v.UnitCode)===normalizeCode(projectA));
      if(!first||!passed(first))reasons.push('Project A ('+projectA+') must be completed before Project B; they cannot be taken in the same semester');
    }
    const operators = new Set(rules.map(r=>(r.LogicalOperators||'and').toLowerCase()));
    if (operators.size>1 || [...operators].some(o=>!['and','or'].includes(o))) unknown.push('Mixed or unsupported rule logic needs advisor review');
    const evaluations = rules.map(r=>{
      const target=r.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit;
      const type=r.UnitRelationship?.toLowerCase();
      const label=`${type}: ${target?.UnitCode || ''}${r.MinCP != null ? ` minimum ${r.MinCP} CP` : ''} [requisite-${r.ID}]`;
      if (type==='min' && Number.isFinite(r.MinCP)) return {ok:totalEarned>=r.MinCP,label};
      if (['pre','co','anti'].includes(type) && target && Number.isFinite(target.CreditPoints) && target.CreditPoints>0) return {ok:type==='anti' ? !earned.has(normalizeCode(target.UnitCode)) : passed(target),label};
      unknown.push(`Incomplete or unsupported requisite record ${r.ID}`);
      return {ok:false,label};
    });
    // Negative constraints always apply; co-requisites not earned are kept for advisor review rather than guessed concurrent bundles.
    const positive = evaluations.filter((_,i)=>rules[i].UnitRelationship!=='anti');
    const negative = evaluations.filter((_,i)=>rules[i].UnitRelationship==='anti');
    const positiveOK = !positive.length || (operators.has('or') ? positive.some(r=>r.ok) : positive.every(r=>r.ok));
    if (!positiveOK || negative.some(r=>!r.ok)) reasons.push('Recorded requisite conditions are not met (co-requisites must already be earned for this draft)');
    return { code:normalizeCode(u.UnitCode), name:u.Name, credits:u.CreditPoints, category:group, reasons, unknown, rules:[...(uploaded?.rules||[]),...evaluations.map(e=>e.label),...(projectA?['Project sequence: '+projectA+' must already be completed']:[]),...(!rules.length&&!uploaded&&provisional?['No prerequisites recorded; verify eligibility before enrolment']:[])], status:reasons.length?'blocked':unknown.length?'review':'candidate', sourceId:`unit-${u.ID}`,planningPriority:u.PlanningPriority??0 };
  });
  const selected=[]; let credits=0;
  const slots = new Map(counts);
  for (const u of candidates.sort((a,b)=>a.planningPriority-b.planningPriority||a.code.localeCompare(b.code))) {
    if (u.status==='candidate' && selected.length<maxUnits && credits+u.credits<=maxCredits && slots.get(u.category)>0) {
      selected.push(u); credits+=u.credits; slots.set(u.category,slots.get(u.category)-1);
    }
  }
  return { selected, credits, candidates, totalEarned, warnings:[
    'Provisional semester draft, not enrolment approval.',
    'Offerings are recurring semester records, not confirmation for the selected year.',
    'Credit cap is your requested workload, not a verified university maximum.',
    'Concurrent co-requisite bundles, timetable clashes, course-level credit rules and exemption applicability require advisor review.',
    provisional?'Automatic suggestions use the unfinished pool where category counts are unavailable, and assume no additional prerequisites where none are recorded. Verify these assumptions before enrolment.':'Units without complete category or requisite evidence are held for review rather than scheduled.',
  ] };
}
