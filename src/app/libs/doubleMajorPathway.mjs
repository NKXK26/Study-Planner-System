import {rankPlannerMatches} from './plannerMatching.mjs';
import {majorUnits,checkDoubleMajor,normalizeCode,isMajorCategory} from './doubleMajorChecker.mjs';
import {semesterPlan} from './academicPlanning.mjs';

const signature=p=>majorUnits(p).map(u=>normalizeCode(u.UnitCode)).sort().join(',');
const category=u=>u.unitType?.Name?.trim()||'Uncategorised';
const isMajor=u=>isMajorCategory(category(u));
const passed=(u,completed)=>Number.isFinite(u?.CreditPoints)&&u.CreditPoints>0&&completed.some(e=>normalizeCode(e.code)===normalizeCode(u.UnitCode)&&e.earned>=u.CreditPoints);

export function majorIdentity(planner){
  const name=planner.name||'';
  for(const [id,re] of [['AI',/CSAI|\bAI\b|artificial intelligence/i],['DS',/CSDS|data science|\bDS\b/i],['SD',/CSSD|software development/i],['IOT',/CSIOT|internet of things|\bIOT\b/i],['CS',/CSCS|cyber\s*security/i]])if(re.test(name))return id;
  const named=majorUnits(planner).map(u=>u.unitType?.Name).find(n=>n?.trim().toLowerCase()!=='major');
  return named?.trim().toLowerCase()||signature(planner);
}
export function closestDistinctMajors(transcript,planners) {
  const ranking=rankPlannerMatches(planners,transcript.completed).filter(r=>majorUnits(r.planner).length).map(r=>({...r,majorMatched:majorUnits(r.planner).filter(u=>passed(u,transcript.completed)).length,credits:0}));
  const seen=new Set();return ranking.filter(r=>{const key=majorIdentity(r.planner);if(seen.has(key))return false;seen.add(key);return true;});
}
export function rankedSecondMajors(transcript,planners,primary){
  const electiveCodes=new Set(primary.units.filter(u=>/elective/i.test(category(u))).map(u=>normalizeCode(u.UnitCode)));
  const primaryRequired=new Set(primary.units.filter(u=>isMajorCategory(category(u))||/core/i.test(category(u))).map(u=>normalizeCode(u.UnitCode)));
  const seen=new Set();
  return planners.filter(p=>majorUnits(p).length&&majorIdentity(p)!==majorIdentity(primary)&&signature(p)!==signature(primary)).map(planner=>{
    const completed=majorUnits(planner).filter(u=>passed(u,transcript.completed));
    return {planner,secondaryMatched:completed.filter(u=>!primaryRequired.has(normalizeCode(u.UnitCode))).length,electiveMatched:completed.filter(u=>electiveCodes.has(normalizeCode(u.UnitCode))).length};
  }).sort((a,b)=>b.secondaryMatched-a.secondaryMatched||b.electiveMatched-a.electiveMatched).filter(r=>{const key=majorIdentity(r.planner);if(seen.has(key))return false;seen.add(key);return true;});
}

// Simulated passes are kept separate from the uploaded evidence. No enrolment or records are changed.
export function doubleMajorPathway({transcript,planners,primaryId,secondaryId,term='Semester 1',year=2027,maxSemesters=16}) {
  if(!['Semester 1','Semester 2'].includes(term)||!Number.isInteger(year)||year<2000||year>2100)throw new Error('Choose a valid starting semester and year.');
  if(!Number.isInteger(maxSemesters)||maxSemesters<1||maxSemesters>16)throw new Error('Drafts support up to 16 semesters.');
  const ranking=closestDistinctMajors(transcript,planners);
  if(ranking.length<2)throw new Error('At least two distinct major unit pools are needed. Different intake copies of the same major are not a double major.');
  if(!ranking.some(r=>r.matched>0))throw new Error('No completed DPA units match the saved major planners. Check the DPA and available records.');
  const primary=primaryId==null?ranking[0].planner:planners.find(p=>String(p.id)===String(primaryId));
  if(!primary)throw new Error('The selected primary planner is no longer available.');
  const secondRanking=rankedSecondMajors(transcript,planners,primary);
  const secondary=secondaryId==null?secondRanking[0]?.planner:planners.find(p=>String(p.id)===String(secondaryId));
  if(!primary||!secondary)throw new Error('A selected planner is no longer available. Choose it again.');
  if(majorIdentity(primary)===majorIdentity(secondary)||signature(primary)===signature(secondary))throw new Error('These planners represent the same major or identical major requirements. Choose a different major.');
  const pair=[primary,secondary].map(p=>({...p,plannerTemplate:p.plannerTemplate?{...p.plannerTemplate,requirements:(p.plannerTemplate.requirements||[]).filter(r=>!isMajorCategory(r.unitType?.Name)||(Number.isInteger(r.requiredCount)&&r.requiredCount>0&&r.requiredCount<=majorUnits(p).length))}:null}));
  const coverage=checkDoubleMajor(transcript,pair);
  // Primary course requirements + both major pools; secondary core/elective categories are not additional degrees.
  const raw=[...primary.units,...secondary.units]; // Core records support prerequisite checks; selection below schedules only major memberships.
  const pool=[...new Map(raw.map(u=>[u.ID??normalizeCode(u.UnitCode),u])).values()];
  const nonMajor=[]; // Double-major coverage compares major pools only, not two degree/core plans.
  const groups=[...new Set(nonMajor.map(category))];
  const categoryRequirements=groups.map(name=>{
    const units=[...new Map(nonMajor.filter(u=>category(u)===name).map(u=>[normalizeCode(u.UnitCode),u])).values()];
    const record=primary.plannerTemplate?.requirements?.find(r=>r.unitType?.Name?.trim()===name);
    const configured=Number.isInteger(record?.requiredCount)&&record.requiredCount>=0&&record.requiredCount<=units.length;
    return {name,required:configured?record.requiredCount:units.length,configured,units};
  });
  const original=transcript.completed.map(u=>({...u}));
  const simulated={...transcript,completed:original.map(u=>({...u}))};
  const semesters=[];let empty=0,currentTerm=term,currentYear=year,lastCandidates=[];
  const remaining=()=>({majors:checkDoubleMajor(simulated,pair).majors,categories:categoryRequirements.map(r=>({...r,remaining:Math.max(0,r.required-r.units.filter(u=>passed(u,simulated.completed)).length)}))});
  let state=remaining();
  const done=()=>state.majors.every(m=>m.configured&&m.remaining===0)&&state.categories.every(c=>c.remaining===0);
  while(!done()&&semesters.length<maxSemesters&&empty<2){
    const plan=semesterPlan({transcript:simulated,planner:{units:pool.map(u=>({...u,unitType:{Name:'Pathway'}})),plannerTemplate:{requirements:[{unitType:{Name:'Pathway'},requiredCount:new Set(pool.map(u=>normalizeCode(u.UnitCode))).size}]}},relations:pool.flatMap(u=>u.UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit||[]),term:currentTerm,maxUnits:4,maxCredits:50,provisional:true});
    lastCandidates=plan.candidates;
    const majorSlots=state.majors.map(m=>m.remaining),categorySlots=new Map(state.categories.map(c=>[c.name,c.remaining]));
    const selected=[];let credits=0;
    const memberships=code=>state.majors.map((m,i)=>m.units.some(u=>u.code===code)?i:-1).filter(i=>i>=0);
    const candidates=[...plan.candidates].sort((a,b)=>memberships(b.code).length-memberships(a.code).length||a.code.localeCompare(b.code));
    for(const candidate of candidates){
      if(candidate.status!=='candidate'||selected.length>=4||credits+candidate.credits>50)continue;
      const u=pool.find(v=>normalizeCode(v.UnitCode)===candidate.code);
      const majors=memberships(candidate.code).filter(i=>majorSlots[i]>0);
      const group=nonMajor.find(v=>normalizeCode(v.UnitCode)===candidate.code);
      if(!majors.length&&!(group&&categorySlots.get(category(group))>0))continue;
      selected.push({...candidate,countsToward:[...majors.map(i=>state.majors[i].name),...(group&&categorySlots.get(category(group))>0?[category(group)]:[])]});credits+=candidate.credits;
      for(const i of majors)majorSlots[i]--;
      if(group)categorySlots.set(category(group),Math.max(0,(categorySlots.get(category(group))||0)-1));
    }
    semesters.push({term:currentTerm,year:currentYear,selected,credits});
    empty=selected.length?0:empty+1;
    // Only future semesters can use these hypothetical passes as prerequisites.
    for(const u of selected)simulated.completed.push({code:u.code,name:u.name,earned:u.credits,grade:'SIMULATED',status:'complete'});
    state=remaining();
    if(currentTerm==='Semester 1')currentTerm='Semester 2';else{currentTerm='Semester 1';currentYear++;}
  }
  const outstanding=lastCandidates.filter(c=>state.majors.some(m=>m.remaining>0&&m.units.some(u=>u.code===c.code&&!passed(pool.find(v=>normalizeCode(v.UnitCode)===u.code),simulated.completed)))||state.categories.some(g=>g.remaining>0&&g.units.some(u=>normalizeCode(u.UnitCode)===c.code&&!passed(u,simulated.completed))));
  const choices=rankPlannerMatches(planners,transcript.completed).filter(r=>majorUnits(r.planner).length).map(r=>({id:r.planner.id,name:r.planner.name,majorMatched:majorUnits(r.planner).filter(u=>passed(u,original)).length,matched:r.matched}));
  return {choices,secondaryRanking:secondRanking.map(r=>({id:r.planner.id,name:r.planner.name,matched:r.secondaryMatched,electiveMatched:r.electiveMatched})),electiveMajorMatches:majorUnits(secondary).filter(u=>passed(u,original)&&primary.units.some(v=>/elective/i.test(category(v))&&normalizeCode(v.UnitCode)===normalizeCode(u.UnitCode))).map(u=>({code:normalizeCode(u.UnitCode),name:u.Name})),ranking:ranking.map(r=>({id:r.planner.id,name:r.planner.name,majorMatched:r.majorMatched,majorTotal:majorUnits(r.planner).length,matched:r.matched,credits:r.credits})),primary:{id:primary.id,name:primary.name},secondary:{id:secondary.id,name:secondary.name},coverage,transcript,semesters,remaining:{majors:state.majors,categories:state.categories.map(({units,...rest})=>rest)},outstanding,completeDraft:done(),warnings:[
    'Primary planner uses the same completed-code overlap as Unit Suggestions. The second major ranks completed secondary-major units outside the primary core/major pool, including electives in the primary planner. Intake copies of the same major are grouped; ties preserve catalogue order.',
    'Future semesters assume every drafted unit is passed with its recorded credit. Your actual DPA is unchanged. Up to four units and 50 CP are scheduled per semester; fewer are shown when checks prevent a full load.',
    'Only recurring semester offerings are recorded; availability for a particular year and timetable clashes are not verified. Project A must be passed in an earlier semester than Project B. Co-requisites are conservatively required to be earned first.',
    'This draft schedules only the two major requirements. It does not compare or certify core, WIL or overall degree completion. It does not establish university double-major compatibility, overlap limits, exemption applicability or graduation approval.',
    ...(!coverage.majors.every(m=>m.configured)||categoryRequirements.some(c=>!c.configured)?['Some category counts are missing or inconsistent; the draft assumes the entire recorded pool for those categories. Confirm the applicable requirements.']:[]),
    'Absent prerequisite records are treated as no additional recorded prerequisites. Unknown credit, offerings, duplicate versions and unsupported rule logic are held for review. Prerequisites outside the planner pools are not automatically added.',
  ]};
}
