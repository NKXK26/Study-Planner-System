// Intake labels describe curriculum cohorts, not the semester being scheduled.
// Do not equate S1/S2 with a named month without an explicit catalogue mapping.
export function plannerIntake(planner) {
  const name=String(typeof planner==='string'?planner:planner?.name||'').normalize('NFKC').replace(/[–—]/g,'-').trim();
  const match=name.match(/^(20\d{2}|\d{2})[\s._/-]*(january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|s[12])(?=$|[\s._/-]|cs[a-z])/i);
  if(!match)return null;
  const year=Number(match[1].length===2?'20'+match[1]:match[1]);
  const period=match[2].toLowerCase().slice(0,3);
  const label=String(year).slice(-2)+'-'+(period.startsWith('s')&&/^s[12]$/.test(period)?period.toUpperCase():period[0].toUpperCase()+period.slice(1));
  return {key:year+':'+period,label,year,period};
}

export function samePlannerIntake(left,right) {
  const intake=plannerIntake(left),other=plannerIntake(right);
  return !!intake&&!!other&&intake.key===other.key;
}

// The checker supplies these major identifiers with its selectable planner list.
export function compatibleSecondMajorChoices(choices,primaryId) {
  const primary=choices.find(p=>String(p.id)===String(primaryId));
  if(!primary)return [];
  return choices.filter(p=>String(p.id)!==String(primary.id)&&samePlannerIntake(primary,p)&&
    p.majorIdentity&&primary.majorIdentity&&p.majorIdentity!==primary.majorIdentity&&
    p.majorSignature&&primary.majorSignature&&p.majorSignature!==primary.majorSignature);
}
