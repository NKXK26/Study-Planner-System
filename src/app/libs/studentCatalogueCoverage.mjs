const label = v => typeof v === 'string' ? v.trim().replace(/\s+/g,' ') : '';
const key = v => label(v).toLowerCase().replace(/[\s-]+/g,'');
const aliases = new Map();
for (const [major, codes] of [
  ['Cybersecurity',['CS','CSCS']], ['Artificial Intelligence',['AI','CSAI']],
  ['Software Development',['SD','CSSD','Software Engineering']], ['Internet of Things',['IoT','CSIOT']],
  ['Data Science',['DS','CSDS']],
]) for (const name of [major,...codes]) aliases.set(key(name),major);

export function normalizeIdentity(input = {}) {
  const course = label(input?.courseCode);
  const number = (value, pattern) => pattern.test(String(value ?? '')) && ['string','number'].includes(typeof value) ? Number(value) : null;
  const month = number(input?.intakeMonth,/^\d{1,2}$/);
  return {
    courseCode:['bacs','bcs','bachelorofcomputerscience'].includes(key(course)) ? 'BA-CS' : course.toUpperCase(),
    major:aliases.get(key(input?.major)) || label(input?.major),
    intakeYear:number(input?.intakeYear,/^[1-9]\d{3}$/),
    intakeMonth:month >= 1 && month <= 12 ? month : null,
  };
}

export function plannerCoverage(planners, enrolment) {
  const identity = normalizeIdentity(enrolment);
  if (enrolment?.confirmed !== true || Object.values(identity).some(v=>!v)) return {state:'confirm',identity};
  const matches = planners.filter(p=>{
    const candidate = normalizeIdentity(p);
    return p.status === 'Published' && candidate.courseCode === 'BA-CS' && candidate.courseCode === identity.courseCode &&
      candidate.intakeYear === identity.intakeYear && candidate.intakeMonth === identity.intakeMonth &&
      key(candidate.major) === key(identity.major);
  });
  if (matches.length === 1) return {state:'exact',identity,planner:matches[0]};
  const intake = new Intl.DateTimeFormat('en',{month:'long',timeZone:'UTC'}).format(Date.UTC(2000,identity.intakeMonth-1));
  return {state:'review',identity,message:`A unique published planner is unavailable for ${identity.courseCode}, ${intake} ${identity.intakeYear}, ${identity.major}. Contact your HOD to confirm your study plan.`};
}

// The DPA Course column is the unit code. Only explicit programme metadata can prefill those fields.
export function transcriptIdentity(rows, term) {
  const fields = {courseCode:['programme code','program code','course code','programme','program'],
    major:['major','major name','specialisation','specialization'],intakeYear:['intake year'],intakeMonth:['intake month']};
  const identity = {};
  for (const [field,headers] of Object.entries(fields)) {
    const values = new Set(rows.flatMap(row=>Object.entries(row).filter(([k,v])=>headers.includes(k.trim().toLowerCase()) && v != null && String(v).trim()).map(([,v])=>String(v).trim())));
    if (values.size === 1) identity[field]=[...values][0];
    else if (!values.size && term?.isTeaching && field.startsWith('intake')) identity[field]=field==='intakeYear'?term.year:term.month;
  }
  return normalizeIdentity(identity);
}
