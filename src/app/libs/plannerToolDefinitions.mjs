import {studyPlanRequest} from './studyPlanWorkflow.mjs';
import {isPlannerMatchRequest} from './plannerMatching.mjs';
import {isCourseCompletionRequest} from './courseCompletion.mjs';
import {requestedMajor} from './plannerIntent.mjs';
export const chatWorkflows = [
  {id:'dpa',title:'Explain My DPA'},
  {id:'compare',title:'Differentiate Study Planners'},
  {id:'templates',title:'Study Planner Templates'},
  {id:'upload',title:'Upload Study Planner'},
  {id:'suggestions',title:'Unit Suggestions'},
  {id:'maker',title:'Study Planner Maker'},
  {id:'management',title:'Study Planner Management'},
  {id:'double-major',title:'Double Major Checker'},
];
const schema = (name,description,properties={},required=[]) => ({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
const planner = {type:'string',description:'Exact planner name or numeric ID. Omit if the user has not selected one. Never invent a name or ID.'};
export const plannerReadTools = [
  schema('inspect_unit','Read a unit by the code or name actually mentioned. Ask for selection when several recorded units match. Use explain_next_semester for personal eligibility with a DPA.',{code:{type:'string'},unitQuery:{type:'string',description:'Unit name or partial name quoted from the student.'}}),
  schema('explain_dpa','Explain the attached DPA using verified table evidence, including completed, failed and exempted records.'),
  schema('open_workflow','Open an interactive workflow inside the chat.',{workflow:{type:'string',enum:chatWorkflows.map(w=>w.id)}},['workflow']),
  schema('match_dpa_planners','Rank all saved planners against completed DPA units using the same matching function as Unit Suggestions. Use for highest, closest or best matching planner requests. Do not inherit previous destination-major filters.'),
  schema('list_planners','Search saved study planners.',{search:{type:'string'}}),
  schema('inspect_planner','Read a saved planner and its units.',{planner},['planner']),
  schema('compare_planners','Differentiate two saved planners. Ask the user to select missing or ambiguous planners.',{plannerA:planner,plannerB:planner}),
  schema('suggest_next_semester','Audit remaining core, major and elective requirements, then suggest up to four unfinished units for next semester from the selected or highest-matching planner using the DPA. Use for explicit next-semester requests or a remaining-requirements audit.',{term:{type:'string'},planner:planner,targetMajor:{type:'string',description:'Requested destination major, for example AI, DS, SD, IOT or CS. Preserve explicit major-change requests.'}}),
  schema('plan_remaining_studies','Build a provisional schedule through completion, including natural requests such as what should I take to complete my study or what units do I need to graduate. Uses DPA, category counts, prerequisites, offerings and preferences.',{planner,term:{type:'string'},year:{type:'string'},maxUnits:{type:'string'},maxCredits:{type:'string'},targetMajor:{type:'string'}}),
  schema('adjust_study_plan','Recalculate the current plan after a workload change, elective exclusion or unit deferral. Never remove required core or major units.',{action:{type:'string',enum:['workload','exclude','defer','reset']},code:{type:'string'},term:{type:'string'},year:{type:'string'},maxUnits:{type:'string'},maxCredits:{type:'string'}},['action']),
  schema('explain_next_semester','Explain previous semester suggestions or check a specific unit against the current DPA and planner. Rechecks actual rules rather than repeating the draft.',{code:{type:'string',description:'Optional unit code explicitly mentioned by the student.'},unitQuery:{type:'string',description:'Unit name or partial name quoted from the student; omit for general explanations.'}}),
  schema('list_templates','Read configured template category requirements.'),
  schema('replacement_units','Find title-based replacement candidates, not approved equivalents.',{code:{type:'string'}},['code']),
  schema('check_double_major','Automatically find the two closest different majors from a DPA, count primary electives against secondary-major units and draft future semesters. Primary and secondary planner overrides are optional.',{primaryPlanner:planner,secondaryPlanner:planner}),
];
export const mutationTools = ['save_planner','save_template','update_template','update_planner'];
export function inferPlannerTool(question,workflow=null) {
  const q=String(question).toLowerCase();
  const planning=studyPlanRequest(question);if(planning)return planning.name==='plan_remaining_studies'&&requestedMajor(question)?{...planning,arguments:{...planning.arguments,targetMajor:requestedMajor(question)}}:planning;
  if(isPlannerMatchRequest(question))return {name:'match_dpa_planners',arguments:{}};
  if(isCourseCompletionRequest(question))return {name:'suggest_next_semester',arguments:{...(requestedMajor(question)?{targetMajor:requestedMajor(question)}:{})}};
  if(/^(?:what (?:is|are|does)|define|meaning of|difference between|how does)\b(?!.*\bbest\b)|\b(?:don['’]?t|do not|never)\s+(?:run|suggest|recommend|compare|check|open|switch|shift)\b/.test(q))return null;
  if (/double\s*major|dual\s*major|second\s*major|two\s*majors?|2\s*majors?/.test(q)) return {name:'check_double_major',arguments:{}};
  const targetMajor=requestedMajor(question);
  if(targetMajor && (/shift|switch|change|move|transfer|best|plann?er|plannre|follow|take|suggest|recommend/.test(q)||workflow==='suggestions'&&/instead|rather|what about|actually/.test(q)))return {name:'suggest_next_semester',arguments:{targetMajor}};
  if(workflow==='suggestions' && /\bwhy\b|why these|eligible|can i take|what about|instead of/.test(q))return {name:'explain_next_semester',arguments:{...(q.match(/\b[a-z]{2,5}[ -]?\d{3,6}\b/i)?{code:q.match(/\b[a-z]{2,5}[ -]?\d{3,6}\b/i)[0].replace(/[ -]/g,'').toUpperCase()}:{})}};
  if (/suggest|sugg[e]?st|recommend|reccomend|what.*take.*next|next.*sem/.test(q) && !/replace|alternative/.test(q)) return {name:'suggest_next_semester',arguments:{}};
  if (/dpa|transcript/.test(q) && /explain|upload|attach|read|understand/.test(q)) return {name:'open_workflow',arguments:{workflow:'dpa'}};
  if (/\b(?:id\s*|#)\d+\s+(?:vs|versus)\s+(?:id\s*|#)?\d+/i.test(q)) return {name:'compare_planners',arguments:{}};
  if (workflow==='compare' && /compare|versus|\bvs\b/.test(q)) return {name:'compare_planners',arguments:{}};
  const selected=q.match(/(?:show|inspect|view|load|edit)\s+(?:my\s+|the\s+)?(?:study\s+)?planner\s+(?:id\s*|#)(\d+)\b/);
  if(selected)return {name:'inspect_planner',arguments:{planner:selected[1]}};
  if (/differentiat|diff\b|compar[ei]|compare/.test(q) && /planner|\bvs\b/.test(q)) return {name:'compare_planners',arguments:{}};
  if (/template/.test(q) && !/semester|prereq/.test(q)) return {name:'list_templates',arguments:{}};
  if (/upload|import/.test(q) && /planner/.test(q) && !/transcript|dpa/.test(q)) return {name:'open_workflow',arguments:{workflow:'upload'}};
  if (/make|create|build|copy|clone/.test(q) && /planner/.test(q)) return {name:'open_workflow',arguments:{workflow:'maker'}};
  if (/manage|edit|saved|list|browse|search|find/.test(q) && /planner/.test(q)) return {name:'list_planners',arguments:{}};
  const code=q.match(/\b([a-z]{2,5})[ -]?(\d{3,6})\b/i);
  if (/replace|alternative|expired/.test(q) && code) return {name:'replacement_units',arguments:{code:(code[1]+code[2]).toUpperCase()}};
  if (/prereq|requisite|tell me about|what about|unit.*offered|unit.*available|(?:it|that unit|same unit).*offered|can i take/.test(q)&&!/major|planner/.test(q))return {name:'inspect_unit',arguments:{}};
  if (/unit suggestion|suggest.*unit|what should i take|next semester/.test(q)) return {name:'suggest_next_semester',arguments:{}};
  return null;
}
export function validateToolCall(call, allowWrites=false) {
  if (!call || typeof call.name!=='string' || ![...plannerReadTools.map(t=>t.function.name),...(allowWrites?mutationTools:[])].includes(call.name)) throw new Error('That tool is not available. Choose a task from the chat toolbar.');
  let args=call.arguments || {};
  if(typeof args==='string'){try{args=JSON.parse(args);}catch{throw new Error('The AI supplied incomplete tool arguments. Choose the planners in the task card.');}}
  if(!args || typeof args!=='object' || Array.isArray(args))throw new Error('Tool arguments must be an object.');
  if(!mutationTools.includes(call.name)) {
    const def=plannerReadTools.find(t=>t.function.name===call.name).function.parameters;
    if(Object.keys(args).some(k=>!Object.hasOwn(def.properties,k)))throw new Error('Unexpected tool arguments.');
    for(const key of def.required)if(!Object.hasOwn(args,key))throw new Error(`Select ${key} first.`);
    for(const [key,value]of Object.entries(args))if(typeof value!=='string'||value.length>200)throw new Error(`Invalid ${key}. Use a name or ID up to 200 characters.`);
    if(call.name==='adjust_study_plan'&&!['workload','exclude','defer','reset'].includes(args.action))throw new Error('Unknown adjustment.');
    if(call.name==='open_workflow'&&!chatWorkflows.some(w=>w.id===args.workflow))throw new Error('Unknown chat workflow.');
  }
  return {name:call.name,arguments:args};
}
