import {planUploadedDocument} from './uploadedPlannerPlan.server.mjs';
import {readPlannerDocument} from './uploadedPlanner.server.mjs';
import {normalizeRecordReference,resolvePlannerReference,formatPlannerUnits,plannerReferences,plannerListRequest} from './plannerRecordRequests.mjs';
import {describePlannerFeature,plannerFeatureGuides} from './plannerFeatureGuides.mjs';
import {doubleMajorPathway} from './doubleMajorPathway.mjs';
import {remainingStudyPlan,validatedPreferences} from './studyPlanWorkflow.mjs';
import {rankPlannerMatches} from './plannerMatching.mjs';
import {courseCompletionAudit,formatCompletionAudit} from './courseCompletion.mjs';
import {resolveUnitReference} from './unitReferences.mjs';
import {majorMatches,majorLabel} from './plannerIntent.mjs';
import {unitPlanningInclude} from './unitPlanningProperties.mjs';
import {reviewDpa,semesterPlan} from './academicPlanning.mjs';
import {MAX_UNITS_PER_SEMESTER,MAX_CREDITS_PER_SEMESTER} from './semesterRules.mjs';
import prisma from '@utils/db/db';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { GET as compareExisting } from '@app/api/compare-planners/route';
import { GET as readExisting, POST as createExisting } from '@app/api/study-planner/route';
import { GET as readTemplates, POST as createTemplate, PUT as updateTemplate } from '@app/api/planner-templates/route';
import { GET as inspectExisting, PUT as updateExisting } from '@app/api/study-planner/[id]/route';
import { validateToolCall, mutationTools } from './plannerToolDefinitions.mjs';
import { validateDocument } from './chatDpa.mjs';
import { reviewedChatDocument } from './reviewedChat.mjs';
import { documentEvidence } from './chatDpa.mjs';
import { checkDoubleMajor, assessDpaDoubleMajor, rankDpaPlanners, majorUnits } from './doubleMajorChecker.mjs';
import { replacementCandidates } from './unitReplacement.mjs';

export async function toolIdentity(req, action='read') {
  const dev=req.headers.get('x-dev-override')==='true'&&process.env.NEXT_PUBLIC_MODE==='DEV';
  if(dev)return {key:'dev',canWrite:true,canUpdate:true};
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  const session=token&&SecureSessionManager.ValidateSession(token);
  if(!session?.success || session.session.email!==req.headers.get('x-session-email'))throw Object.assign(new Error('Please sign in again.'),{status:401});
  const user=await SecureSessionManager.authenticateUser(req);
  if(!user)throw Object.assign(new Error('Please sign in again.'),{status:401});
  const profile=await prisma.userProfile.findUnique({where:{ID:user.profileId},include:{UserRoles:{include:{Role:{include:{RolePermissions:{include:{Permission:true}}}}}}}});
  const permits = wanted => profile?.IsActive && profile.UserRoles.some(ur=>ur.Role?.IsActive && (!ur.ExpiresAt || new Date(ur.ExpiresAt)>new Date()) && (ur.Role.Name.toLowerCase()==='superadmin'||ur.Role.RolePermissions.some(rp=>rp.Granted&&rp.Permission.IsActive&&['planner','course','courses','study_plans','*'].includes(rp.Permission.Resource)&&[wanted,'manage','*'].includes(rp.Permission.Action))));
  if(!permits(action))throw Object.assign(new Error(`Your account does not have permission to ${action} planners.`),{status:403});
  return {key:String(user.id),canWrite:permits('create'),canUpdate:permits('update')};
}
function request(req,path,method='GET',body) {
  return new Request(new URL(path,req.url||'http://localhost'),{method,headers:req.headers,...(body?{body:JSON.stringify(body)}:{})});
}
async function existing(handler,req,path,method='GET',body,params) {
  const response=await handler(request(req,path,method,body),params);
  const data=await response.json();
  if(!response.ok||data.success===false)throw Object.assign(new Error(data.message||'The existing planner function could not complete this task.'),{status:response.status});
  return data.data;
}
export async function plannerCatalog(req) {
  const identity=await toolIdentity(req);
  const [planners,templates,units,types]=await Promise.all([
    existing(readExisting,req,'/api/study-planner'),existing(readTemplates,req,'/api/planner-templates'),
    prisma.unit.findMany({select:{ID:true,UnitCode:true,Name:true,CreditPoints:true,Availability:true},orderBy:{UnitCode:'asc'}}),
    prisma.unitType.findMany({select:{ID:true,Name:true},orderBy:{Name:'asc'}}),
  ]);
  return {planners,templates,units,types,permissions:{create:identity.canWrite,update:identity.canUpdate}};
}
function resolve(planners,reference) {
  if(reference==null||reference==='')return null;
  const matches=planners.filter(p=>String(p.id)===String(reference).trim()||p.name.replace(/[^a-z0-9]/gi,'').toLowerCase()===String(reference).replace(/[^a-z0-9]/gi,'').toLowerCase());
  return matches.length===1?matches[0]:null;
}
const receipts=new Map(),locks=new Set();
export async function runPlannerTool(req,input,{allowWrites=false,document=null,plannerDocument=null,planningContext=null,suggestionContext=null,question=''}={}) {
  const call=validateToolCall(input,allowWrites),a=call.arguments;
  const write=mutationTools.includes(call.name);
  const identity=await toolIdentity(req,write?(call.name.startsWith('update')?'update':'create'):'read');
  const result=(answer,workflow,data=null)=>({answer,workflow,data,tool:call.name,...(['inspect_planner','list_planners','list_templates','describe_workflow','compare_planners'].includes(call.name)?{chatOnly:true}:{})});
  if(call.name==='explain_dpa') {
    if(!document)return result('Upload your DPA PDF or XLSX beside the chat input to explain your results.','dpa');
    const checked=reviewedChatDocument(validateDocument(document),planningContext);
    const evidence=documentEvidence(checked);
    const transcript=evidence.transcript;
    const completed=transcript?.completed.map(u=>u.code+': '+u.earned+' earned CP'+(u.grade?.toUpperCase()==='EXM'?' (exempted)':'')).join('\n');
    const excluded=transcript?.excluded.map(u=>u.code+': '+u.reason).join('\n');
    return result(evidence.summary+(completed?'\n\nCompleted / exempted entries:\n'+completed:'')+(excluded?'\n\nEntries not counted as completed:\n'+excluded:''),'dpa',{documentName:document.name,tableVerified:!!transcript});
  }
  if(call.name==='inspect_unit') {
    if((document||plannerDocument)&&/can i take|eligible|eligibility|what about/i.test(question))return runPlannerTool(req,{name:'explain_next_semester',arguments:a},{document,plannerDocument,planningContext,suggestionContext,question});
    const records=await prisma.unit.findMany({include:unitPlanningInclude,orderBy:{UnitCode:'asc'}});
    const resolved=resolveUnitReference(records,{question,unitQuery:a.unitQuery,code:a.code,lastCode:suggestionContext?.unitCode});
    if(resolved.status!=='matched')return result(resolved.status==='ambiguous'?'Which recorded unit do you mean?':resolved.status==='version-review'?'Several versions use that code. Confirm the applicable unit version in your course planner.':'Which unit should I check? Tell me its code or a more specific name.','suggestions',{needsSelection:true,unitChoices:resolved.choices,unitChoiceTool:'inspect_unit'});
    const unit=resolved.unit;const rules=unit.UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit||[];
    const details=rules.map(r=>[r.UnitRelationship,r.LogicalOperators,r.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit?.UnitCode,r.MinCP!=null?r.MinCP+' minimum CP':''].filter(Boolean).join(' | '));
    return result(unit.UnitCode+' '+unit.Name+'\n'+(unit.CreditPoints??'Unknown')+' CP. Status: '+unit.Availability+'. Recorded terms: '+(unit.UnitTermOffered.map(t=>t.TermType).join(', ')||'not recorded')+'.\n\nRecorded requisite conditions:\n'+(details.join('\n')||'No relationships recorded; this does not establish unrestricted enrolment.')+'\n\nRecurring offerings do not confirm availability for a particular year.'+(!document&&/can i take|eligible/i.test(question)?' Attach your DPA to check your recorded results against a planner.':''),'suggestions',{unit:{code:unit.UnitCode,name:unit.Name,credits:unit.CreditPoints,terms:unit.UnitTermOffered.map(t=>t.TermType)},focusCode:unit.UnitCode});
  }
  if(call.name==='explain_next_semester') {
    const args={};
    for(const key of ['targetMajor','planner','term'])if(typeof suggestionContext?.[key]==='string')args[key]=suggestionContext[key];
    const draft=await runPlannerTool(req,{name:suggestionContext?.planMode==='full'?'plan_remaining_studies':'suggest_next_semester',arguments:args},{document,plannerDocument,planningContext,suggestionContext,question});
    if(!draft.data?.plan)return {...draft,tool:call.name};
    const {plan,planner}=draft.data;
    const wantsUnit=!!(a.code||a.unitQuery)||/why.*(?:not|wasn|weren|omit|suggest)|not.*suggest/i.test(question)||/\b[a-z]{2,5}[ -]?\d{3,6}\b/i.test(question)||/what about|can i take|eligible|eligibility|prereq|requisite|\bit\b|\bthat\b|same unit/i.test(question);
    let resolved=null,unit=null;
    if(wantsUnit){
      resolved=resolveUnitReference(draft.data.unitReferences,{question,unitQuery:a.unitQuery,code:a.code,lastCode:suggestionContext?.unitCode});
      if(resolved.status==='missing'){
        const pool=await prisma.unit.findMany({select:{UnitCode:true,Name:true,CreditPoints:true},orderBy:{UnitCode:'asc'}});
        resolved=resolveUnitReference(pool,{question,unitQuery:a.unitQuery,code:a.code,lastCode:suggestionContext?.unitCode});
      }
      if(resolved.status!=='matched')return result(resolved.status==='ambiguous'?'Which of these units did you mean?':resolved.status==='version-review'?'Several unit versions share that code; confirm the version in your course planner.':'Which unit should I check against your DPA? Give its code or a more specific name.','suggestions',{...draft.data,needsSelection:true,unitChoices:resolved.choices,unitChoiceTool:'explain_next_semester'});
      unit=plan.candidates.find(u=>u.code===resolved.code);
    }
    const units=wantsUnit?(unit?[unit]:[]):plan.selected;
    const details=units.map(u=>u.code+' '+u.name+': '+(plan.selected.some(s=>s.code===u.code)?'selected because it is unfinished and fits the recorded semester, category and four-unit/50 CP checks':u.status==='candidate'?'eligible under recorded checks, but outside this draft workload/category places':'not selected')+'. '+[...u.reasons,...u.unknown,...u.rules].join('; '));
    let absent='';
    if(wantsUnit&&!unit){
      const ref=draft.data.unitReferences.find(u=>u.code===resolved.code);
      const review=document?reviewDpa(validateDocument(document),planningContext?.corrections||[]):{transcript:{completed:[]}};
      const earned=review.transcript.completed.find(u=>u.code===resolved.code)?.earned||0;
      absent=ref&&Number.isFinite(ref.credits)&&ref.credits>0&&earned>=ref.credits?resolved.code+' '+ref.name+' already has sufficient recorded earned credit ('+earned+' CP) in your DPA; it is not suggested again.':resolved.code+' '+(resolved.unit.name||resolved.unit.Name)+' is outside this planner unfinished pool. I have not added it to the draft.';
    }
    return result('Rechecked against '+planner.name+(document?' and your current DPA.':' with no DPA attached.')+'\n\n'+(details.join('\n\n')||absent||'No eligible units were selected; inspect the blocked candidates in the workspace.')+'\n\n'+formatCompletionAudit(draft.data.completionAudit)+'\n\n'+plan.warnings.join('\n'),'suggestions',{...draft.data,focusCode:resolved?.code||null});
  }
  if(call.name==='open_workflow')return result(`Ready: ${a.workflow}. Use the planning workspace to select records and run this task.`,a.workflow);
  if(call.name==='describe_workflow')return result(describePlannerFeature(a.workflow),null,{features:plannerFeatureGuides.filter(g=>!a.workflow||g.id===a.workflow)});
  if(call.name==='list_templates'){
    const templates=await existing(readTemplates,req,'/api/planner-templates');
    const answer=templates.length?templates.map(t=>'**'+t.name+' (ID '+t.id+')**\n'+Object.entries(t.requirements||{}).map(([name,count])=>'- '+name+': '+count+' required units').join('\n')).join('\n\n'):'No planner templates are saved.';
    return result(answer,'templates',templates);
  }
  if(plannerDocument&&['suggest_next_semester','plan_remaining_studies'].includes(call.name)&&!a.planner){
    readPlannerDocument(plannerDocument);
    const records=await prisma.unit.findMany({include:unitPlanningInclude});
    return planUploadedDocument(plannerDocument,document,records,{...a,full:call.name==='plan_remaining_studies'},suggestionContext||{});
  }
  const planners=await existing(readExisting,req,'/api/study-planner');
  if(call.name==='list_planners'){
    const scope=plannerListRequest(question);
    const search=scope?scope.arguments.search:a.search;
    const found=planners.filter(p=>!search||normalizeRecordReference(p.name).includes(normalizeRecordReference(search)));
    return result(found.length?found.length+' planner(s) found'+(search?' matching "'+search+'" (of '+planners.length+' saved)':' in the database')+':\n\n'+found.map(p=>'- '+p.name+' (ID '+p.id+'): '+p.units.length+' units').join('\n')+'\n\nAsk "Show all units in '+found[0].name+'" to inspect a planner.':'No planners match that search. Try a shorter name.','management',found);
  }
  if(call.name==='inspect_planner') {
    const lookup=resolvePlannerReference(planners,a.planner);
    if(lookup.status!=='matched')return result(lookup.choices.length?'Which planner do you mean? Reply with its name or ID:\n'+lookup.choices.map(p=>'- '+p.name+' (ID '+p.id+')').join('\n'):'No saved planner matches "'+a.planner+'". Check the intake and major, or ask me to list planners.','management',{needsSelection:true,choices:lookup.choices});
    const selected=lookup.planner;
    const detail=await existing(inspectExisting,req,`/api/study-planner/${selected.id}`,'GET',null,{params:{id:String(selected.id)}});
    return result(formatPlannerUnits(detail,a),'management',detail);
  }
  if(call.name==='match_dpa_planners') {
    if(!document)return result('Upload your DPA to find the highest-matching planner.','suggestions',{targetMajor:null});
    if(planningContext?.corrections?.length&&!planningContext.dpaConfirmed)throw new Error('Confirm your DPA corrections in the optional review first.');
    const review=reviewDpa(validateDocument(document),planningContext?.corrections||[]);
    const ranking=rankPlannerMatches(planners,review.transcript.completed);
    if(!ranking[0]?.matched)throw new Error('No completed DPA units match a saved planner. Check the DPA table.');
    const top=ranking[0],ties=ranking.filter(r=>r.matched===top.matched);
    const choices=ranking.map(r=>({id:r.planner.id,name:r.planner.name+' ('+r.matched+' matches)'}));
    const answer='Highest-matching planner: '+top.planner.name+' - '+top.matched+' completed-unit matches.\n\n'+ranking.slice(0,5).map((r,i)=>(i+1)+'. '+r.planner.name+': '+r.matched+' matches').join('\n')+'\n\n'+(ties.length>1?'Several planners share the highest score. The first uses the same saved-record order as Unit Suggestions. ':'')+'A match suggests a planner; it does not establish your actual intake. Select your actual planner before planning enrolment. This ranking uses all planners and does not carry over an earlier major-change request.';
    return result(answer,'suggestions',{choices,ranking:ranking.map(r=>({id:r.planner.id,name:r.planner.name,matched:r.matched})),suggested:{id:top.planner.id,name:top.planner.name},targetMajor:null,documentName:document.name});
  }
  if(call.name==='adjust_study_plan') {
    if(suggestionContext?.planMode==='double-major')return result('Workload changes for a double-major pathway are not supported yet. Would you like to adjust a single-major study plan instead?','double-major',{needsSelection:true});
    const previous=validatedPreferences(suggestionContext?.preferences);
    const preferences=a.action==='reset'?validatedPreferences():validatedPreferences({...previous,...(a.maxUnits?{maxUnits:a.maxUnits}:{}),...(a.maxCredits?{maxCredits:a.maxCredits}:{})});
    let term=a.action==='defer'?suggestionContext?.term:a.term||suggestionContext?.term;
    if(['exclude','defer'].includes(a.action)){
      if(a.action==='defer'&&!a.term)return result('Which semester should I move the unit to: Semester 1 or Semester 2?','suggestions',{needsSelection:true});
      const baseline=await runPlannerTool(req,{name:'suggest_next_semester',arguments:{...(suggestionContext?.planner?{planner:suggestionContext.planner}:{}),...(term?{term}:{})}},{document,plannerDocument,planningContext,suggestionContext,question});
      if(!baseline.data?.plan)return baseline;
      let resolved=resolveUnitReference(baseline.data.unitReferences,{question,code:a.code,lastCode:suggestionContext?.unitCode});
      if(resolved.status!=='matched'&&/this elective|that elective/i.test(question)){
        const electives=baseline.data.plan.selected.filter(u=>/elective/i.test(u.category));
        if(electives.length===1)resolved={status:'matched',code:electives[0].code};
      }
      if(resolved.status!=='matched')return result('Which unit should I '+(a.action==='exclude'?'exclude':'defer')+'? Tell me its unit code.','suggestions',{needsSelection:true});
      const candidate=baseline.data.plan.candidates.find(u=>u.code===resolved.code);
      if(!candidate)return result(resolved.code+' is already completed or outside this planner. I have not changed your plan.','suggestions',{needsSelection:true});
      if(a.action==='exclude'&&!/elective/i.test(candidate.category))return result(resolved.code+' is a '+candidate.category+' unit. I cannot remove it as an elective choice. You can defer it to a later semester instead.','suggestions',{needsSelection:true});
      if(a.action==='exclude')preferences.excluded=[...new Set([...preferences.excluded,resolved.code])];
      else preferences.deferred[resolved.code]=a.term;
    }
    const name=suggestionContext?.planMode==='full'?'plan_remaining_studies':'suggest_next_semester';
    const adjusted=await runPlannerTool(req,{name,arguments:{...(suggestionContext?.planner?{planner:suggestionContext.planner}:{}),...(term?{term}:{}),...(a.year?{year:a.year}:suggestionContext?.year?{year:String(suggestionContext.year)}:{})}},{document,plannerDocument,planningContext,suggestionContext:{...suggestionContext,preferences},question});
    if(adjusted.data?.plan)adjusted.data.plannerConfirmed=suggestionContext?.plannerConfirmed===true;
    return adjusted;
  }
  if(['suggest_next_semester','plan_remaining_studies'].includes(call.name)) {
    if(!document)return result('Attach your DPA to match a saved planner, or attach a study planner PDF to plan directly from that file. With a DPA I will match it to '+(a.targetMajor?majorLabel(a.targetMajor)+' planners':'a planner')+', check unfinished units and '+(call.name==='plan_remaining_studies'?'draft the remaining semesters through completion.':'suggest up to four for next semester.'),'suggestions',{targetMajor:a.targetMajor||null,planMode:call.name==='plan_remaining_studies'?'full':'semester'});
    if(planningContext?.corrections?.length && !planningContext.dpaConfirmed)throw new Error('Confirm your DPA corrections in the optional review first.');
    const review=reviewDpa(validateDocument(document),planningContext?.corrections||[]);
    const allRanking=rankPlannerMatches(planners,review.transcript.completed);
    const ranking=a.targetMajor?allRanking.filter(r=>majorMatches(r.planner.name,a.targetMajor)):allRanking;
    if(a.targetMajor&&!ranking.length)return result('No planner records match your requested major: '+majorLabel(a.targetMajor)+'. Select a destination planner in the optional controls or tell me its exact name. I have not reused your previous major.','suggestions');
    if(!allRanking.length||!allRanking[0].matched)throw new Error('No earned units match a planner. Check the DPA table or use its XLSX export.');
    const chosen=a.planner?resolve(planners,a.planner):ranking[0].planner;
    if(!chosen)throw new Error('Planner not found. Select an exact planner record.');
    if(a.targetMajor&&!majorMatches(chosen.name,a.targetMajor))throw new Error('That planner does not match the requested destination major.');
    const record=await prisma.studyPlanner.findUnique({where:{id:chosen.id},include:{studyPlannerUnits:{include:{unit:{include:unitPlanningInclude},unitType:true}},plannerTemplate:{include:{requirements:{include:{unitType:true}}}}}});
    if(!record)throw new Error('Planner was removed. Retry with another planner.');
    const units=record.studyPlannerUnits.map(j=>({...j.unit,unitType:j.unitType}));
    const now=new Date(),month=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuala_Lumpur',month:'numeric'}).format(now)),currentYear=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuala_Lumpur',year:'numeric'}).format(now));
    const term=a.term||suggestionContext?.term||(month<7?'Semester 2':'Semester 1'),year=Number(a.year||suggestionContext?.year||(month<7?currentYear:currentYear+1));
    if(!Number.isInteger(year)||year<2000||year>2100)throw new Error('Choose a year between 2000 and 2100.');
    const preferences=validatedPreferences({...suggestionContext?.preferences,...(a.maxUnits?{maxUnits:a.maxUnits}:{}),...(a.maxCredits?{maxCredits:a.maxCredits}:{})});
    if(!['Semester 1','Semester 2'].includes(term))throw new Error('Choose Semester 1 or Semester 2.');
    const plan=semesterPlan({transcript:review.transcript,planner:{...record,units},relations:units.flatMap(u=>u.UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit||[]),term,maxUnits:preferences.maxUnits,maxCredits:preferences.maxCredits,provisional:true,preferences});
    const completionAudit=courseCompletionAudit({transcript:review.transcript,planner:{...record,units},plan});
    const top=ranking[0],ties=ranking.filter(r=>r.matched===top.matched);
    if(ties.length>1&&!a.planner)plan.warnings.unshift('Several planners match equally. Using '+chosen.name+' as a provisional draft using the same newest-first tie order as Unit Suggestions. Matching completed units does not identify your intake. Choose your actual planner in the workspace.');
    let answer=(a.targetMajor?'For your move to '+majorLabel(a.targetMajor)+', I recommend '+chosen.name+' as the '+majorLabel(a.targetMajor)+' planner with the strongest earned-unit match. Your completed units are checked against this destination planner, rather than repeating your previous major. Transfer approval and the applicable intake still need confirmation.\n\n':'')+'Suggested next semester: '+term+' '+year+' (calendar assumption; editable in the workspace).\nPlanner: '+chosen.name+' - '+ranking.find(r=>r.planner.id===chosen.id)?.matched+' earned-unit matches.\n'+(plan.selected.length?plan.selected.map((u,i)=>(i+1)+'. '+u.code+' '+u.name+' ('+u.credits+' CP)').join('\n'):'No units meet the recorded checks for this semester.')+'\n'+plan.selected.length+'/'+preferences.maxUnits+' units, '+plan.credits+' CP. '+(plan.selected.length<preferences.maxUnits?'Fewer units than your requested workload meet the recorded checks; blocked units are not added to fill the schedule.':'')+'\n\n'+formatCompletionAudit(completionAudit)+'\n\n'+plan.warnings.join('\n');
    let pathway=null;
    if(call.name==='plan_remaining_studies'){
      pathway=remainingStudyPlan({transcript:review.transcript,planner:{...record,units},relations:units.flatMap(u=>u.UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit||[]),term,year,preferences});
      answer='Provisional plan through completion: '+chosen.name+'\n\n'+pathway.semesters.map(s=>s.term+' '+s.year+' - '+s.selected.length+' units, '+s.credits+' CP\n'+(s.selected.map(u=>'- '+u.code+' '+u.name+' ('+u.credits+' CP)').join('\n')||'No eligible units; waiting for offerings or unresolved checks.')).join('\n\n')+'\n\n'+(pathway.completeDraft?'All configured category requirements are covered in this hypothetical pathway.':'Some requirements remain unresolved; this is a partial pathway, not a completion date.')+'\n\n'+formatCompletionAudit(pathway.remaining)+'\n\n'+pathway.warnings.join('\n');
      plan.warnings=[...new Set([...plan.warnings,...pathway.warnings])];
    }
    if(preferences.excluded.length||Object.keys(preferences.deferred).length||preferences.maxUnits!==4||preferences.maxCredits!==50)answer+='\n\nYour preferences: '+preferences.maxUnits+' units / '+preferences.maxCredits+' CP per semester; excluded electives: '+(preferences.excluded.join(', ')||'none')+'; deferred units: '+(Object.entries(preferences.deferred).map(([c,t])=>c+' to '+t).join(', ')||'none')+'.';
    if(suggestionContext?.savedDraft?.units){
      const old=new Set(suggestionContext.savedDraft.units.map(u=>u.code)),fresh=new Set((pathway?.semesters.flatMap(s=>s.selected)||plan.selected).map(u=>u.code));
      const completed=review.transcript.completed.filter(u=>old.has(u.code)).map(u=>u.code);
      answer+='\n\nChanges from saved draft: now earned in DPA: '+(completed.join(', ')||'none')+'; newly scheduled: '+([...fresh].filter(c=>!old.has(c)).join(', ')||'none')+'; no longer scheduled: '+([...old].filter(c=>!fresh.has(c)).join(', ')||'none')+'.';
    }
    return result(answer,'suggestions',{plan,pathway,preferences,planMode:pathway?'full':'semester',completionAudit,plannerConfirmed:!!a.planner,planner:{id:chosen.id,name:chosen.name},choices:ranking.map(r=>({id:r.planner.id,name:r.planner.name+' ('+r.matched+' matches)'})),term,year,documentName:document.name,targetMajor:a.targetMajor||null,unitReferences:units.map(u=>({code:u.UnitCode,name:u.Name,credits:u.CreditPoints}))});
  }
  if(call.name==='check_double_major') {
    if(!document)return result('Upload your DPA to find the two closest different majors and their remaining major units.','double-major');
    const dpa=documentEvidence(reviewedChatDocument(validateDocument(document),planningContext));
    if(!dpa.transcript)throw new Error('The DPA table is unclear. Attach its XLSX export.');
    const records=await prisma.studyPlanner.findMany({orderBy:{createdAt:'desc'},include:{studyPlannerUnits:{include:{unit:{include:unitPlanningInclude},unitType:true}},plannerTemplate:{include:{requirements:{include:{unitType:true}}}}}});
    const pool=records.map(p=>({...p,units:p.studyPlannerUnits.map(j=>({...j.unit,unitType:j.unitType}))}));
    const primary=a.primaryPlanner?resolve(pool,a.primaryPlanner):null,secondary=a.secondaryPlanner?resolve(pool,a.secondaryPlanner):null;
    if(a.primaryPlanner&&!primary||a.secondaryPlanner&&!secondary)throw new Error('A selected major planner is missing or ambiguous.');
    const now=new Date(),month=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuala_Lumpur',month:'numeric'}).format(now)),currentYear=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuala_Lumpur',year:'numeric'}).format(now));
    const term=suggestionContext?.term||(month<7?'Semester 2':'Semester 1'),year=Number(suggestionContext?.year||(month<7?currentYear:currentYear+1));
    const pathway=doubleMajorPathway({transcript:dpa.transcript,planners:pool,primaryId:primary?.id,secondaryId:secondary?.id,term,year});
    const lines=['Suggested double-major pair: '+pathway.primary.name+' + '+pathway.secondary.name+'.','Primary planner is the highest completed-unit match. The second major is selected from completed elective/other earned units matching a different major. Core pools are not compared.'];
    for(const m of pathway.coverage.majors){
      lines.push('\n'+m.name+': '+m.matched+' / '+m.required+' major units earned; '+m.remaining+' remaining. '+m.source+'.');
      if(m.remaining)lines.push('Remaining major choices (need '+m.remaining+'): '+m.units.filter(u=>!u.completed).map(u=>u.code+' '+u.name).join('; '));
    }
    lines.push('\nPrimary electives matching the second major: '+(pathway.electiveMajorMatches.map(u=>u.code+' '+u.name).join('; ')||'None recorded in the primary elective pool. Other earned exact-code matches are still checked.'));
    lines.push('\nFuture-semester double-major draft:');
    if(!pathway.semesters.length)lines.push('No additional major units need to be drafted against these recorded counts.');
    for(const s of pathway.semesters)lines.push(s.term+' '+s.year+': '+(s.selected.map(u=>u.code+' '+u.name+' ('+u.credits+' CP)').join('; ')||'No eligible units; recorded blockers remain.')+' - '+s.selected.length+'/4 units, '+s.credits+' CP.');
    if(!pathway.completeDraft){
      const unknownCounts=pathway.coverage.majors.filter(m=>!m.configured).map(m=>m.name);
      if(unknownCounts.length)lines.push('\nUnresolved category counts: '+unknownCounts.join(', '));
      if(pathway.outstanding.length)lines.push('\nUnresolved units: '+pathway.outstanding.map(u=>u.code+': '+[...u.reasons,...u.unknown].join('; ')).join('\n'));
    }
    lines.push('\n'+pathway.warnings.join('\n'));
    return result(lines.join('\n'),'double-major',{primary:pathway.primary,secondary:pathway.secondary,coverage:pathway.coverage,pathway,choices:pathway.choices,term,year,documentName:document.name,planner:{id:pathway.primary.id,name:pathway.primary.name+' + '+pathway.secondary.name},planMode:'double-major'});
  }
  if(call.name==='compare_planners') {
    let left=resolve(planners,a.plannerA),right=resolve(planners,a.plannerB);
    // Exact, unique names/IDs in the prompt can prefill selectors; never guess fuzzy matches.
    if(!a.plannerA&&!a.plannerB&&question){
      const refs=plannerReferences(question);
      const matched=refs.length===2?refs.map(ref=>resolve(planners,ref)).filter(Boolean):planners.filter(p=>question.toLowerCase().includes(p.name.toLowerCase())||new RegExp(`\\b(?:id\\s*|#)${p.id}\\b`,'i').test(question));
      if(matched.length===2){[left,right]=matched;}
    }
    const workflow=call.name==='compare_planners'?'compare':'double-major';
    if(!left||!right)return result('Which two planners should I compare? Reply with their names or IDs, for example “23 Sep CSDS vs 24 Sep CSDS” or “ID 12 vs ID 18”.',workflow);
    if(left.id===right.id)throw new Error('Choose two different planners. Your selections are retained.');
    if(call.name==='compare_planners') {
      const data=await existing(compareExisting,req,`/api/compare-planners?a=${left.id}&b=${right.id}`);
      const lines=[`${left.name} vs ${right.name}: ${data.summary.inBoth} shared units, ${data.summary.onlyInA} only in the first, ${data.summary.onlyInB} only in the second, ${data.summary.unitTypeChanged} category changes.`];
      for(const [label,units]of [['Only in '+left.name,data.diff.onlyInA],['Only in '+right.name,data.diff.onlyInB],['Shared units',data.diff.inBoth],['Category changes',data.diff.unitTypeChanged]])lines.push('\n'+label+':\n'+(units.map(u=>'- '+u.UnitCode+' '+u.Name+(label==='Category changes'?' ('+(u.unitType?.Name||'Unassigned')+' -> '+(u.unitTypeB?.Name||'Unassigned')+')':'')).join('\n')||'None.'));
      return result(lines.join('\n'),workflow,data);
    }

  }
  if(call.name==='replacement_units'){
    const code=String(a.code).trim().toUpperCase().replace(/[ -]/g,'');
    if(!/^[A-Z]{2,5}\d{3,6}$/.test(code))throw new Error('Enter a unit code such as COS20031.');
    const pool=await prisma.unit.findMany({include:{UnitTermOffered:true},orderBy:{ID:'asc'}});
    const originals=pool.filter(u=>u.UnitCode===code);
    if(originals.length!==1)throw new Error(originals.length?'Multiple unit versions share that code. Confirm the applicable version on the Units page.':'Unit code not found. Check the code and retry.');
    const source=originals[0],suggestions=replacementCandidates({code,name:source.Name,creditPoints:source.CreditPoints},pool);
    return result(`Replacement candidates for ${code}. These are based on title similarity and are not approved equivalents.`+'\n\n'+(suggestions.map(u=>'- '+u.code+' '+u.name+' ('+(u.credits??'Unknown')+' CP)').join('\n')||'No title-similarity candidates were found.'),'suggestions',{source,suggestions});
  }
  if(!write)throw new Error('Tool not available.');
  if(!allowWrites||a.confirmed!==true)throw new Error('Review the draft and use its Save button first.');
  if(typeof a.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(a.requestId))throw new Error('Missing save request ID. Please retry from the form.');
  const key=`${identity.key}:${a.requestId}`;
  for(const [k,v]of receipts)if(Date.now()-v.time>600000)receipts.delete(k);
  const payload=JSON.stringify(call);
  if(receipts.has(key)){const receipt=receipts.get(key);if(receipt.payload!==payload)throw new Error('This save ID was already used for a different draft. Refresh the draft before saving.');return receipt.result;}
  const lockKey=`${call.name}:${a.id||String(a.name).trim().toLowerCase()}`;
  if(locks.has(lockKey))throw new Error('This save is still running. Wait a moment before retrying.');
  locks.add(lockKey);
  try {
    let data,workflow;
    const name=typeof a.name==='string'?a.name.trim():'';
    if(['save_template','update_template'].includes(call.name)){
      if(!name||name.length>150||!a.requirements||typeof a.requirements!=='object'||Array.isArray(a.requirements)||Object.keys(a.requirements).length>50||!Object.keys(a.requirements).length)throw new Error('Enter a template name and at least one category count.');
      if(call.name==='save_template'&&(await prisma.plannerTemplate.findMany()).some(t=>t.name.trim().toLowerCase()===name.toLowerCase()))throw new Error('A template with that name already exists. Choose another name.');
      const types=await prisma.unitType.findMany();
      if(Object.entries(a.requirements).some(([n,c])=>!types.some(t=>t.Name===n)||!Number.isInteger(c)||c<0||c>100))throw new Error('Use existing categories and whole-number counts from 0 to 100.');
      if(call.name==='update_template'){
        if(!Number.isInteger(a.id)||a.id<=0)throw new Error('Select a template.');
        const current=await prisma.plannerTemplate.findUnique({where:{id:a.id}});
        if(!current)throw new Error('This template no longer exists. Reload the choices.');
        if(current.updatedAt.toISOString()!==a.expectedVersion)throw new Error('This template changed since you opened it. Reload it before saving.');
      }
      data=await existing(call.name==='save_template'?createTemplate:updateTemplate,req,'/api/planner-templates',call.name==='save_template'?'POST':'PUT',{id:a.id,name,requirements:a.requirements,expectedVersion:a.expectedVersion});workflow='templates';
    }else if(call.name==='save_planner'){
      if(!name||name.length>150||!Array.isArray(a.units)||!a.units.length||a.units.length>300)throw new Error('Enter a unique name and 1–300 reviewed units.');
      if(a.units.some(u=>!Number.isInteger(u.unitId)||u.unitId<=0||!Number.isInteger(u.unitTypeId)||u.unitTypeId<=0)||new Set(a.units.map(u=>u.unitId)).size!==a.units.length)throw new Error('Select valid units and categories; remove duplicate units.');
      const types=await prisma.unitType.findMany();
      if(a.units.some(u=>!types.some(t=>t.ID===u.unitTypeId)))throw new Error('A unit category was removed. Reload the choices.');
      if(a.plannerTemplateId!=null&&(!Number.isInteger(a.plannerTemplateId)||a.plannerTemplateId<=0))throw new Error('Select a valid template.');
      data=await existing(createExisting,req,'/api/study-planner','POST',{name,units:a.units,plannerTemplateId:a.plannerTemplateId??null});workflow='maker';
    }else{
      if(!Number.isInteger(a.id)||a.id<=0||!Array.isArray(a.units))throw new Error('Select a saved planner first.');
      const current=await existing(inspectExisting,req,`/api/study-planner/${a.id}`,'GET',null,{params:{id:String(a.id)}});
      if(JSON.stringify({templateId:current.plannerTemplateId,units:current.units.map(u=>[u.joinId,u.unitTypeId])})!==a.expectedVersion)throw new Error('This planner changed. Reload its details before saving.');
      const types=await prisma.unitType.findMany();
      if(a.units.length!==current.units.length||new Set(a.units.map(u=>u.joinId)).size!==a.units.length||a.units.some(u=>!current.units.some(v=>v.joinId===u.joinId)||!types.some(t=>t.ID===u.unitTypeId)))throw new Error('Invalid planner categories. Reload the planner.');
      if(a.plannerTemplateId!=null&&!(await prisma.plannerTemplate.findUnique({where:{id:a.plannerTemplateId}})))throw new Error('Template not found.');
      data=await existing(updateExisting,req,`/api/study-planner/${a.id}`,'PUT',{units:a.units,plannerTemplateId:a.plannerTemplateId??null,expectedVersion:a.expectedVersion},{params:{id:String(a.id)}});workflow='management';
    }
    const saved=result('Saved successfully. The existing planner function completed the change.',workflow,data);
    if(receipts.size>500)receipts.delete(receipts.keys().next().value);
    receipts.set(key,{time:Date.now(),payload,result:saved});return saved;
  }finally{locks.delete(lockKey);}
}
