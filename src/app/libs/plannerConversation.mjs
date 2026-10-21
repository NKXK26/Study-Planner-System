// Keep the student's destination and selections; clear stale unit focus on a new draft.
export function nextSuggestionContext(current,result) {
  if(result?.suggestionContext)return result.suggestionContext;
  const data=result?.data;
  if(!data)return current;
  if(result.tool==='inspect_planner'&&data.id)return {...current,inspectedPlanner:String(data.id),inspectedPlannerName:data.name};
  if(result.tool==='check_double_major'&&data.primary?.id&&data.secondary?.id)return {...current,planMode:'double-major',primaryPlanner:String(data.primary.id),secondaryPlanner:String(data.secondary.id),planner:null,plannerConfirmed:false,plannerName:data.primary.name+' + '+data.secondary.name,term:data.term,year:data.year,targetMajor:null,unitCode:null,pendingQuestion:null};
  if(data.plan)return {...current,plannerSource:data.plannerSource||'database',primaryPlanner:null,secondaryPlanner:null,pendingQuestion:null,preferences:data.preferences||current?.preferences,planMode:data.planMode||current?.planMode,year:data.year,plannerConfirmed:data.plannerConfirmed===true,plannerName:data.planner?.name||'',targetMajor:data.targetMajor,planner:String(data.planner?.id||''),term:data.term,unitCode:data.focusCode||null};
  if(data.planMode&&!data.plan)return {...current,planMode:data.planMode,targetMajor:data.targetMajor??current?.targetMajor};
  if(data.focusCode)return {...current,unitCode:data.focusCode};
  if(Object.hasOwn(data,'targetMajor'))return {...current,targetMajor:data.targetMajor};
  return current;
}

// Store a snapshot with each reply: later planner/DPA changes cannot silently
// change the contents of an earlier download.
export function plannerPdfSnapshot(result) {
  const data=result?.data;
  if(result?.answerability==='refused'||!(data?.pathway?.semesters.some(s=>s.selected.length)||data?.plan?.selected?.length))return null;
  return JSON.parse(JSON.stringify({planner:data.planner,secondary:data.secondary,coverage:data.coverage,term:data.term,year:data.year,documentName:data.documentName,uploadedPlannerName:data.uploadedPlannerName,units:data.pathway?data.pathway.semesters.flatMap(s=>s.selected):data.plan.selected,semesters:data.pathway?.semesters,outstanding:data.pathway?.outstanding,completeDraft:data.pathway?.completeDraft,preferences:data.preferences,planMode:data.planMode,credits:data.pathway?data.pathway.semesters.reduce((n,s)=>n+s.credits,0):data.plan.credits,completionAudit:data.completionAudit,warnings:data.pathway?.warnings||data.plan.warnings||[]}));
}

// Older restored replies can lack the structured PDF snapshot. Their text is
// only a record reference for rechecking the tool, never the PDF's unit source.
export function suggestionExportReference(message) {
  if(message?.role!=='assistant'||message.source!=='tool')return null;
  const term=message.content?.match(/Suggested next semester:\s*(Semester [12])\b/)?.[1];
  const planner=message.content?.match(/^Planner:\s*(.+?)\s+(?:-|\?)\s*\d+ earned-unit matches\./m)?.[1];
  return term&&planner?{term,planner}:null;
}
