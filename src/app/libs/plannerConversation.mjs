// Keep the student's destination and selections; clear stale unit focus on a new draft.
export function nextSuggestionContext(current,result) {
  const data=result?.data;
  if(!data)return current;
  if(data.plan)return {...current,preferences:data.preferences||current?.preferences,planMode:data.planMode||current?.planMode,year:data.year,plannerConfirmed:data.plannerConfirmed===true,plannerName:data.planner?.name||'',targetMajor:data.targetMajor,planner:String(data.planner?.id||''),term:data.term,unitCode:data.focusCode||null};
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
  return JSON.parse(JSON.stringify({planner:data.planner,secondary:data.secondary,coverage:data.coverage,term:data.term,year:data.year,documentName:data.documentName,units:data.pathway?data.pathway.semesters.flatMap(s=>s.selected):data.plan.selected,semesters:data.pathway?.semesters,preferences:data.preferences,planMode:data.planMode,credits:data.pathway?data.pathway.semesters.reduce((n,s)=>n+s.credits,0):data.plan.credits,completionAudit:data.completionAudit,warnings:data.pathway?.warnings||data.plan.warnings||[]}));
}

// Older restored replies can lack the structured PDF snapshot. Their text is
// only a record reference for rechecking the tool, never the PDF's unit source.
export function suggestionExportReference(message) {
  if(message?.role!=='assistant'||message.source!=='tool')return null;
  const term=message.content?.match(/Suggested next semester:\s*(Semester [12])\b/)?.[1];
  const planner=message.content?.match(/^Planner:\s*(.+?)\s+(?:-|\?)\s*\d+ earned-unit matches\./m)?.[1];
  return term&&planner?{term,planner}:null;
}
