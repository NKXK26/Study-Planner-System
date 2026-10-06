import {studyPlanRequest} from './studyPlanWorkflow.mjs';
import {isCourseCompletionRequest} from './courseCompletion.mjs';
export const UNABLE_TO_ANSWER='I am unable to answer this question reliably with the information available.';

// Evidence gates, not a model's self-reported confidence percentage.
export function questionBoundary(question,{document=null,workflow=null,suggestionContext=null}={}) {
  const q=String(question).trim();
  if(/\b(?:weather|recipe|politic|president|stock price|investment|medical|diagnos|visa|scholarships?|tuition|fees?|refund|lecturer email|phone number)\b/i.test(q))return {status:'refuse',reason:'This question is outside the supported study-planning records.'};
  if(/who (?:teaches|is .*lecturer)|what.*(?:learn|taught)|assessment|learning outcomes|syllabus content|teach me/i.test(q))return {status:'refuse',reason:'Teaching staff, assessment details and learning content are not verified in the available unit records.'};
  if(studyPlanRequest(q))return {status:'supported'};
  if(isCourseCompletionRequest(q))return {status:'supported'};
  if(/\b(?:guarantee|guaranteed|official approval|approve(?:d|s)?|approval|graduat(?:e|ion)|timetable clash|exam date|deadline|university policy|academic regulation|handbook)\b/i.test(q)&&!/^(?:what can|how does) (?:this|the) (?:chatbot|assistant)/i.test(q))return {status:'refuse',reason:'I cannot verify official decisions, policies, dates or graduation eligibility from the stored planning records.'};
  if(/\b(?:offer(?:ed|ing|ings)?|available|availability)\b/i.test(q)&&/\b(?:19|20|21)\d{2}\b|\b(?:this|next) year\b/i.test(q))return {status:'refuse',reason:'The database has recurring semester offerings, not confirmed availability for a particular year.'};
  if(/^(?:hi|hello|hey|thanks|thank you|ok|okay)[!. ]*$/i.test(q))return {status:'answer',answer:/thank/i.test(q)?'You’re welcome.':'Hi! I can explain a DPA, compare planners, draft semester suggestions or check recorded second-major unit coverage.'};
  const definition=/^(?:what (?:is|are|does)|define|meaning of|how does|explain (?:what|the meaning))\b/i.test(q);
  if(definition&&/double\s*major|dual\s*major|second major/i.test(q))return {status:'answer',answer:'A double major involves completing the requirements of two majors within a programme. This system compares stored unit coverage; it cannot confirm whether your university permits a particular combination.'};
  if(definition&&/prerequisit|pre[ -]?req|co[ -]?requisit/i.test(q)&&!/\b(?:for|of)\b/i.test(q)&&!/\b[A-Z]{2,5}[ -]?\d{3,6}\b/i.test(q))return {status:'answer',answer:/co[ -]?requisit/i.test(q)?'A co-requisite is a unit that must be studied alongside another unit, or already completed, depending on the applicable rules. This draft planner conservatively requires recorded co-requisites to be earned first.':'A prerequisite is a condition that must be met before taking a unit. It may involve completing another unit or earning a minimum number of credit points. Specific conditions must come from the unit records.'};
  if(definition&&/\bEXM\b|exempt/i.test(q))return {status:'answer',answer:'In this DPA checker, EXM means exempted. It counts as completed when positive earned credit is recorded. An exemption does not automatically replace a different specific major unit.'};
  if(definition&&/\bN\b|failed grade/i.test(q))return {status:'answer',answer:'In this DPA checker, N means failed. It never counts as completed, even if the Status field says Complete.'};
  if(/what (?:can|does).*?(?:chatbot|assistant)|how.*(?:use|work).*?(?:chatbot|assistant)|\bhelp\b.*(?:chat|planner)|^help[!. ]*$/i.test(q))return {status:'answer',answer:'I can explain an uploaded DPA, compare selected planners, draft next-semester units and check recorded second-major coverage. Upload your DPA for personal planning, or choose a task in the workspace. Drafts use stored records and do not establish enrolment approval.'};
  if(/\b(?:DPA|transcript|planner|planners|planning|major|majors|semester|sem|term|units?|subjects?|suggestw*|recommendw*|concentration|completed|earned|passed|failed|exemptw*|progress|prerequisit\w*|requisite\w*|credits?|CP|EXM|FYP|project [AB])\b|\b[A-Z]{2,5}[ -]?\d{3,6}\b/i.test(q))return {status:'supported'};
  if(document&&/^(?:explain|summari[sz]e|read|check)(?:\s+(?:this|it|my results))?[!. ]*$/i.test(q))return {status:'supported'};
  if((workflow==='suggestions'||suggestionContext)&&/\b(?:AI|DS|IOT)\b|artificial intelligence|data science|software development|cybersecurity|internet of things/i.test(q))return {status:'supported'};
  if(workflow==='compare'&&/\b(?:these|those|them|selected)\b.*(?:side by side|differ)|(?:differences|compare).*\b(?:these|those|them|selected)\b/i.test(q))return {status:'supported'};
  if((workflow||document)&&/^(?:compare|differentiate)(?: (?:these|those|them|selected)(?: (?:two|planners?|ones))?)?[!.? ]*$/i.test(q))return {status:'supported'};
  if((workflow||suggestionContext)&&/^(?:why[!.? ]*$|why (?:those|these|did you (?:pick|choose|select)|(?:is|was|isn.t|wasn.t) (?:it|that))|(?:is|can|could|does)\b.*\b(?:it|that|same)\b|(?:those|these|that|same|instead)[!.? ]*$)/i.test(q))return {status:'supported'};
  if(/can i take|tell me about|what about/i.test(q))return {status:'supported'}; // The record resolver must clarify unknown names.
  return {status:'refuse',reason:'I do not have verified information that answers this question.'};
}

export function refusal(reason){return {status:'refused',answer:UNABLE_TO_ANSWER+(reason?'\n\n'+reason:''),sources:[]};}

export function generalEvidenceReply({question,docs=[],units=[],unitAdvice='',evidence=null,comparison='',plannerChoices=[],databaseWarning=''}) {
  const q=String(question);
  // No conversation-history keywords or unrelated attachment can authorise an answer.
  if(/can i take|am i eligible|allowed to|eligible for/i.test(q))return {status:'clarification',answer:'Which unit should I check? Give its code or name and upload your DPA so I can check the recorded conditions.',sources:[]};
  if(/double major|dual major|second major|compare/i.test(q)&&comparison)return {status:plannerChoices.length?'clarification':'verified',answer:comparison,plannerChoices,sources:[]};
  if(/DPA|transcript|completed|earned|passed|exempt|failed|progress|^explain(?: this| it)?[!. ]*$|^summari[sz]e/i.test(q)) {
    if(!evidence)return {status:'clarification',answer:'Upload your DPA PDF or XLSX using the upload control in this chat so I can check your results.',sources:[]};
    if(!evidence.transcript)return {status:'clarification',answer:UNABLE_TO_ANSWER+' I cannot verify the completed-unit table. Upload a readable XLSX with Course, Status and Earned columns.',sources:[]};
    return {status:'verified',answer:evidence.summary,sources:[]};
  }
  const codes=[...new Set((q.toUpperCase().match(/\b[A-Z]{2,5}[ -]?\d{3,6}\b/g)||[]).map(c=>c.replace(/[ -]/g,'')))];
  if(codes.length) {
    if(databaseWarning)return refusal('The unit database is unavailable. Retry when the records can be checked.');
    if(codes.some(code=>units.filter(u=>u.UnitCode===code).length!==1))return {status:'clarification',answer:'A unit code is missing from the records or has multiple versions. Check the code and applicable unit version.',sources:[]};
    if(!/prereq|pre[ -]?req|requisite|credits?|\bCP\b|offered|offering|available|availability|details|tell me about|what (?:is|are)|replacement|replace|alternative|before/i.test(q))return refusal('The available unit records do not contain enough information to answer that question.');
    if(/credits?|\bCP\b/i.test(q)&&units.some(u=>!Number.isFinite(u.CreditPoints)))return refusal('The credit value is missing from the unit records.');
    if(/offer|available|availability/i.test(q)&&units.some(u=>!u.UnitTermOffered?.length))return refusal('No recurring semester offerings are recorded for this unit.');
    const facts=units.map(u=>u.UnitCode+' '+u.Name+': '+(u.CreditPoints??'Unknown')+' CP; status '+u.Availability+'; recorded recurring terms: '+((u.UnitTermOffered||[]).map(t=>t.TermType).join(', ')||'not recorded')+'.').join('\n');
    return {status:'verified',answer:[facts,unitAdvice,'Recorded terms and publication status do not confirm year-specific enrolment eligibility.'].filter(Boolean).join('\n\n'),sources:[]};
  }
  // Curated application instructions can explain a supported feature, not policies or arbitrary academic facts.
  if(/where|open|navigate|go to|find (?:the )?page|how (?:do|can|to).*?(?:use|upload|compare|create|make|check|manage)|how does .*?(?:planner|checker|suggestion)/i.test(q)&&docs.length) {
    const ids=/double major/i.test(q)?['double-major']:/template/i.test(q)?['templates']:/mak|creat/i.test(q)?['maker']:/prereq/i.test(q)?['prerequisites']:/compar|suggest|upload|transcript/i.test(q)?['transcript','replacement']:/manag|saved/i.test(q)?['management']:[];
    const relevant=docs.filter(d=>ids.includes(d.id));
    if(relevant.length)return {status:'verified',answer:relevant.map(d=>d.text).join('\n\n'),sources:relevant.map(({id,title,href})=>({id,title,href}))};
  }
  if(/suggest|recommend|next.*sem|double major|dual major|second major/i.test(q)&&!evidence)return {status:'clarification',answer:'Upload your DPA PDF or XLSX using the upload control in this chat for personal planning.',sources:[]};
  return refusal('I need a supported task or an exact recorded reference; the available information does not answer this question.');
}

export const SAFE_TOOL_INTROS=[
  'Here is the result from the current records.',
  'I checked the current records. Here is the result for your question.',
  'Here is a starting point based on your current records.',
  'Here are the recorded checks behind this draft.',
  'Here is the comparison using your current selections.',
];

export function guardToolEvidence(result,{question=''}={}) {
  if(question){const boundary=questionBoundary(question,{workflow:result.workflow});if(boundary.status==='refuse')return {...result,answer:refusal(boundary.reason).answer,answerability:'refused'};}
  if(result.tool==='explain_dpa'&&result.data?.tableVerified===false)return {...result,answer:UNABLE_TO_ANSWER+' I cannot verify the completed-unit table. Upload a readable XLSX with Course, Status and Earned columns.',answerability:'refused'};
  if(result.tool==='inspect_unit'&&result.data?.unit){
    const u=result.data.unit;
    if((/credits?|\bCP\b/i.test(question)&&!Number.isFinite(u.credits))||(/offer|available|availability/i.test(question)&&!u.terms?.length))return {...result,answer:UNABLE_TO_ANSWER+' The requested credit or offering information is not recorded for '+u.code+'.',answerability:'refused'};
  }
  const candidate=result.data?.plan?.candidates?.find(u=>u.code===result.data?.focusCode);
  if(/can i take|am i eligible|eligible for|allowed to/i.test(question)&&candidate&&!candidate.reasons?.length&&((candidate.unknown||[]).length||(candidate.rules||[]).some(r=>/no prerequisites recorded/i.test(r)))) {
    return {...result,answer:UNABLE_TO_ANSWER+' I cannot confirm personal eligibility for '+candidate.code+' because prerequisite or other rule evidence is incomplete.\n\n'+[...(candidate.unknown||[]),...(candidate.rules||[]).filter(r=>/no prerequisites recorded/i.test(r))].join('\n'),answerability:'refused'};
  }
  const missing=result.data?.needsSelection||!result.data||/^(?:Upload|Review and confirm|Confirm your actual|Which |Select )/i.test(result.answer);
  return {...result,answerability:missing?'clarification':'verified'};
}
