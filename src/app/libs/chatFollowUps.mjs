import {attachmentKey} from './plannerIntent.mjs';
import {validateToolCall} from './plannerToolDefinitions.mjs';
import {plannerPdfSnapshot} from './plannerConversation.mjs';

// Suggestions are grounded continuations of verified results, never generic starter chips.
export function chatFollowUps({document,toolResult,question='',suggestionContext}={}) {
 if(!toolResult||toolResult.answerability!=='verified'||!toolResult.data)return [];
 const results=toolResult.toolResults||[toolResult],names=new Set(results.map(r=>r.tool));
 const result=results.findLast(r=>r.answerability==='verified')||toolResult,data=result.data;
 if(!data||data.needsSelection||data.unitChoices?.length)return [];
 const key=attachmentKey(document),steps=[];
 const add=(id,label,prompt,name,args={})=>{
  if(prompt.toLowerCase()===question.trim().toLowerCase())return;
  try{steps.push({id,label,prompt,call:validateToolCall({name,arguments:args}),documentKey:key});}catch{/* Omit invalid or incomplete actions. */}
 };
 const planningArgs={...(suggestionContext?.plannerConfirmed&&suggestionContext.planner?{planner:suggestionContext.planner}:{}),...(data.targetMajor?{targetMajor:data.targetMajor}:{}),...(data.term?{term:data.term}:{})};
 if(result.tool==='explain_dpa'&&document&&data.tableVerified){
  add('match','Find my matching planner','Which planner matches the completed units in this DPA best?','match_dpa_planners');
  if(!names.has('suggest_next_semester')&&!names.has('plan_remaining_studies'))add('next','What should I take next?','Using this DPA, what should I take next semester?','suggest_next_semester');
 }else if(result.tool==='match_dpa_planners'&&document&&data.suggested?.id&&data.ranking?.length){
  add('next','Suggest next-semester units','Suggest next-semester units using the highest-matching planner for this DPA.','suggest_next_semester');
  add('finish','Plan through completion','Plan all remaining semesters until I finish using this DPA.','plan_remaining_studies');
  for(const step of steps)step.resetPlannerMatch=true;
 }else if(data.plan&&(document||data.plannerSource==='upload')){
  const selected=data.plan.selected||[],candidates=data.plan.candidates||[];
  if(selected.length&&result.tool!=='explain_next_semester')add('why','Why these units?','Why did you choose these units for my current plan?','explain_next_semester');
  const blocked=candidates.find(u=>u.code!==data.focusCode&&u.reasons?.length&&u.status!=='candidate');
  if(blocked)add('blocked','Why not '+blocked.code+'?','Why was '+blocked.code+' not included in the suggested semester?','explain_next_semester',{code:blocked.code});
  if(!data.pathway&&data.completionAudit?.countsVerified&&data.completionAudit.categories.some(c=>c.remainingCount>0)&&!names.has('plan_remaining_studies'))add('finish','Plan the remaining semesters','Plan all remaining semesters until I finish using my current DPA and planning preferences.','plan_remaining_studies',planningArgs);
 }else if(result.tool==='inspect_unit'&&data.unit){
  // Ask only for properties present in this exact result; do not promise eligibility.
  const u=data.unit;
  if(!/prereq|requisite/i.test(question))add('rules','Requisites for '+u.code,'Show the recorded requisite conditions for '+u.code+'.','inspect_unit',{code:u.code});
  if(u.terms?.length&&!/offer|available|availability|term/i.test(question))add('terms','When is '+u.code+' offered?','What recurring semester offerings are recorded for '+u.code+'?','inspect_unit',{code:u.code});
 }else if(result.tool==='check_double_major'&&data.pathway&&document){
  // Download only an actual scheduled pathway; never invent an additional major recommendation.
  const snapshot=plannerPdfSnapshot(result);
  if(snapshot)steps.push({id:'pdf',label:'Download this pathway',prompt:'Download this double-major pathway as a PDF.',action:'pdf',snapshot,documentKey:key});
 }
 return steps.filter(s=>s.action==='pdf'||!names.has(s.call.name)||s.call.name==='inspect_unit'||s.call.name==='explain_next_semester').slice(0,3);
}
