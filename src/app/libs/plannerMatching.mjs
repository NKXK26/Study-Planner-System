// Match completed unit codes, exactly as Unit Suggestions does. Credit eligibility
// is checked separately when building a semester plan, not used as a tie-breaker.
export function matchingCode(value) {
  const text=String(value??'').trim().toUpperCase();
  return text.match(/[A-Z]{3}\d{5}/)?.[0]||text.split(' ')[0];
}
export function rankPlannerMatches(planners,completed) {
  const codes=new Set(completed.map(u=>matchingCode(u.code)).filter(Boolean));
  return planners.map(planner=>{
    const pool=new Set((planner.units||[]).map(u=>matchingCode(u.UnitCode)));
    return {planner,matched:[...codes].filter(code=>pool.has(code)).length,totalCompleted:codes.size};
  }).sort((a,b)=>b.matched-a.matched);
}
export function isPlannerMatchRequest(question) {
  const q=String(question);
  return !/\b(?:don't|do not|never)\b/i.test(q)&&/\bplann?ers?\b/i.test(q)&&/highest|closest|best.*match|match.*(?:dpa|transcript)|most.*match/i.test(q);
}
