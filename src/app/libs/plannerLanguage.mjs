import {plannerRecordRequest} from './plannerRecordRequests.mjs';
import {studyPlanRequest} from './studyPlanWorkflow.mjs';
import {inferPlannerTool} from './plannerToolDefinitions.mjs';
// Correct only known task words. Never fuzzy-correct academic codes or record names.
export function normalizeStudentRequest(question) {
 const words={wat:'what',wht:'what',pls:'please',plz:'please',sugestion:'suggestion',sugestions:'suggestions',suggstion:'suggestion',sugest:'suggest',reccomend:'recommend',prerequitesite:'prerequisite',prerequsite:'prerequisite',seemster:'semester',semestr:'semester',complte:'complete',compelete:'complete',finsih:'finish',duble:'double'};
 return String(question).replace(/\u2019/g,"'").replace(/\b[a-z]+\b/gi,w=>words[w.toLowerCase()]||w);
}
export function contextualRequest(input) {
 const q=normalizeStudentRequest(input.question).trim(),context=input.suggestionContext;
 const record=plannerRecordRequest(q,context);if(record)return {call:record};
 const hasPlan=!!context?.planner||context?.plannerSource==='upload'||!!input.plannerDocument;
 const doubleMajor=context?.planMode==='double-major'&&context.primaryPlanner&&context.secondaryPlanner;
 if(doubleMajor&&/^(?:same|again|redo it|recalculate|what(?:'s| is) left(?: for me)?)[.!? ]*$/i.test(q))return {call:{name:'check_double_major',arguments:{primaryPlanner:String(context.primaryPlanner),secondaryPlanner:String(context.secondaryPlanner)}}};
 if(doubleMajor&&/^(?:only|just)\s+(?:one|two|three|four|[1-4])[.!? ]*$/i.test(q))return {kind:'clarify',message:'The double-major checker currently drafts up to four units per semester. Do you want to change the workload for your single-major study plan instead?'};
 if(/^(?:please )?(?:change|switch|update|fix|redo)(?: (?:it|this|that))?[.!? ]*$/i.test(q))return {kind:'clarify',message:'What would you like to change: the planner, semester, workload or a suggested unit?'};
 if(hasPlan&&/^(?:only|just)\s+(one|two|three|four|[1-4])[.!? ]*$/i.test(q))return {question:q.replace(/[.!? ]*$/,'')+' units next semester'};
 if(hasPlan&&/^(?:why|why (?:those|these)|why (?:not )?(?:that|it))[.!? ]*$/i.test(q))return {call:{name:'explain_next_semester',arguments:context.unitCode?{code:context.unitCode}:{}}};
 if(/\b(?:what(?:'s| is)?|anything)\s+(?:still )?left\b|\b(?:what|which)\s+(?:else|more)\s+(?:do i )?need\b/i.test(q)&& (input.document||hasPlan))return {call:{name:'plan_remaining_studies',arguments:{}}};
 if((input.document||hasPlan)&&/\b(?:last few|remaining)\s+(?:classes|subjects|units)\b/i.test(q)&&/\b(?:help|figure|plan|take|need)\b/i.test(q))return {call:{name:'plan_remaining_studies',arguments:{}}};
 if(hasPlan&&/^(?:same|again|redo it|recalculate)[.!? ]*$/i.test(q))return {call:{name:context.planMode==='full'?'plan_remaining_studies':'suggest_next_semester',arguments:{}}};
 if(input.document&&/^(?:explain|summari[sz]e|read)(?: (?:this|it|my results))?[.!? ]*$/i.test(q))return {call:{name:'explain_dpa',arguments:{}}};
 return {question:q};
}
export function compoundRequests(question,workflow) {
 // Split only at explicit task connectors; do not split AND/OR prerequisites or major names.
 const parts=normalizeStudentRequest(question).split(/\s*(?:[;\n]+|,?\s+and\s+then\s+|,?\s+then\s+|,?\s+and\s+(?=(?:please\s+)?(?:explain|summari[sz]e|read|check|plan|map|draft|suggest|recommend|compare|show|tell|help)\b))\s*/i).filter(Boolean);
 if(parts.length<2||parts.length>4)return null;
 const calls=parts.map(part=>{
  if(/\b(?:don't|do not|never)\b/i.test(part))return null;
  if(/^(?:please\s+)?(?:explain|summari[sz]e|read)\b.*\b(?:dpa|transcript|results|academic record)\b/i.test(part))return {name:'explain_dpa',arguments:{}};
  const inferred=inferPlannerTool(part,workflow);
  if(inferred?.name==='plan_remaining_studies')return inferred;
  if(/\b(?:map|plan|schedule|draft)\b.*\b(?:finish(?:ing)?|complet(?:e|ion)|graduat(?:e|ion))\b/i.test(part)){const parsed=studyPlanRequest(part);const {action,...settings}=parsed?.arguments||{};return {name:'plan_remaining_studies',arguments:settings};}
  return inferPlannerTool(part,workflow);
 });
 return calls.every(Boolean)?{parts,calls}:null;
}
