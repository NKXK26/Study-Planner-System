import {semesterPlan} from './academicPlanning.mjs';
import {courseCompletionAudit} from './courseCompletion.mjs';

export function studyPlanRequest(question) {
  const q=String(question),code=q.match(/\b([a-z]{2,5})[ -]?(\d{3,6})\b/i);
  if(/\b(?:official|guarantee|guaranteed|approval|eligible)\b|\bif\b|^\s*(?:can|should) i\b|\b(?:don't|do not|never)\s+(?:take|use|set|limit|move|defer)\b/i.test(q))return null;
  // Completion is a goal, even when the student never says "plan".
  const completionGoal=/\b(?:complete|finish)\b.*\b(?:stud(?:y|ies)|degree|course|program(?:me)?)\b|\bgraduat(?:e|ion)\b/i.test(q);
  const wantsSubjects=/\b(?:take|need|remaining|left|units?|subjects?)\b/i.test(q);
  const singleTerm=/\b(?:next|coming|upcoming|this)\s+(?:sem(?:ester)?|term)\b|\b(?:sem(?:ester)?|term)\s*[12]\b/i.test(q);
  const otherGoal=/\b(?:double|dual|second)\s*major|\b(?:two|2)\s*majors?\b/i.test(q);
  const full=(/\b(?:units?|subjects?)\s+per\s+(?:sem(?:ester)?|term)\b.*\b(?:until|till)\b.*\b(?:finish|complete|graduate)\b/i.test(q))||/\b(?:plan|schedule|map)\b.*(?:until.*(?:finish|complete|graduate)|all.*(?:remaining|semester)|through.*completion)|\bfull.*(?:study plan|schedule)|remaining semesters/i.test(q) || (completionGoal&&wantsSubjects&&!singleTerm&&!otherGoal);
  if(/\b(?:don't|do not|never)\s+(?:plan|schedule|generate)\b/i.test(q))return null;
  if(/\bwhy\b/i.test(q)&&/suggest|select|omit|project|fyp|[a-z]{2,5}\d{3,6}/i.test(q))return {name:'explain_next_semester',arguments:code?{code:(code[1]+code[2]).toUpperCase()}: {}};
  const units=q.match(/\b([1-4]|one|two|three|four)\s+(?:units?|subjects?)\b/i);
  const settings={};
  if(units&&/only|just|take|use|limit|set|maximum|max|plan|schedule|per\s*(?:sem|semester|term)/i.test(q))settings.maxUnits=String(Number(units[1])||['one','two','three','four'].indexOf(units[1].toLowerCase())+1);
  const cp=q.match(/\b(\d+(?:\.\d+)?)\s*(?:CP|credit points)\b/i);
  if(cp&&/limit|set|max|cap/i.test(q))settings.maxCredits=cp[1];
  const term=q.match(/\b(?:semester|sem)\s*([12])\b/i),year=q.match(/\b(?:year|in|for)\s+(20\d{2})\b|\bsemester\s*[12]\s+(20\d{2})\b/i);
  if(year&&/\b(?:set|start|plan|use|take|change)\b/i.test(q))settings.year=year[1]||year[2];
  if(/\b(?:move|defer|postpone)\b/i.test(q))return {name:'adjust_study_plan',arguments:{action:'defer',...(code?{code:(code[1]+code[2]).toUpperCase()}:{}),...(term?{term:'Semester '+term[1]}:{})}};
  if(/\b(?:remove|skip|exclude|avoid)\b|(?:don't|do not).*want/i.test(q)&&/elective|unit|subject|[a-z]{2,5}\d{3,6}/i.test(q))return {name:'adjust_study_plan',arguments:{action:'exclude',...(code?{code:(code[1]+code[2]).toUpperCase()}: {})}};
  if(/\b(?:reset|clear)\b.*(?:preferences|exclusions|adjustments)/i.test(q))return {name:'adjust_study_plan',arguments:{action:'reset'}};
  if(term&&!/why|offered|available|move|defer/i.test(q)&&/start|set|plan|use|take/i.test(q))settings.term='Semester '+term[1];
  return full?{name:'plan_remaining_studies',arguments:settings}:Object.keys(settings).length?{name:'adjust_study_plan',arguments:{action:'workload',...settings}}:null;
}
export function validatedPreferences(input={}) {
  const maxUnits=Number(input.maxUnits??4),maxCredits=Number(input.maxCredits??50);
  if(!Number.isInteger(maxUnits)||maxUnits<1||maxUnits>4||!Number.isFinite(maxCredits)||maxCredits<=0||maxCredits>50)throw new Error('Choose one to four units and a credit cap up to 50 CP.');
  const excluded=Array.isArray(input.excluded)?input.excluded:[],deferred=input.deferred||{};
  if(excluded.length>100||excluded.some(c=>!/^\w{2,5}\d{3,6}$/.test(c))||typeof deferred!=='object'||Array.isArray(deferred)||Object.keys(deferred).length>100||Object.entries(deferred).some(([c,t])=>!/^\w{2,5}\d{3,6}$/.test(c)||!['Semester 1','Semester 2'].includes(t)))throw new Error('Invalid saved planning preferences. Reset adjustments and retry.');
  return {maxUnits,maxCredits,excluded:[...new Set(excluded)],deferred:{...deferred}};
}
export function remainingStudyPlan({transcript,planner,relations,term,year,preferences,maxSemesters=16}) {
  const original=JSON.parse(JSON.stringify(transcript)),simulated=JSON.parse(JSON.stringify(transcript));
  const semesters=[];let currentTerm=term,currentYear=year,empty=0,audit,plan;
  const done=a=>a.countsVerified&&a.categories.every(c=>c.remainingCount===0);
  for(let i=0;i<maxSemesters;i++){
    plan=semesterPlan({transcript:simulated,planner,relations,term:currentTerm,maxUnits:preferences.maxUnits,maxCredits:preferences.maxCredits,provisional:true,preferences,starting:i===0});
    audit=courseCompletionAudit({transcript:simulated,planner,plan});
    if(done(audit))break;
    semesters.push({term:currentTerm,year:currentYear,selected:plan.selected,credits:plan.credits});
    for(const u of plan.selected)simulated.completed.push({code:u.code,name:u.name,earned:u.credits,grade:'SIMULATED',status:'complete'});
    empty=plan.selected.length?0:empty+1;
    if(currentTerm==='Semester 1')currentTerm='Semester 2';else{currentTerm='Semester 1';currentYear++;}
    if(empty>=2)break;
  }
  const finalPlan=semesterPlan({transcript:simulated,planner,relations,term:currentTerm,maxUnits:preferences.maxUnits,maxCredits:preferences.maxCredits,provisional:true,preferences,starting:false});
  audit=courseCompletionAudit({transcript:simulated,planner,plan:finalPlan});
  while(semesters.length&&!semesters.at(-1).selected.length)semesters.pop();
  const outstanding=audit.categories.filter(c=>c.remainingCount===null||c.remainingCount>0);
  return {semesters,completeDraft:done(audit),remaining:audit,outstanding,original, warnings:['Future semesters assume every drafted unit is passed. Your uploaded DPA is unchanged.','This is a provisional pathway against stored category counts, not graduation approval.',...finalPlan.warnings,...audit.warnings]};
}
