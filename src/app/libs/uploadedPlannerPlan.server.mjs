import {readPlannerDocument} from './uploadedPlanner.server.mjs';
import {uploadedPlannerModel} from './uploadedPlannerRules.mjs';
import {reviewDpa,semesterPlan} from './academicPlanning.mjs';
import {validateDocument} from './chatDpa.mjs';
import {courseCompletionAudit} from './courseCompletion.mjs';
import {remainingStudyPlan,validatedPreferences} from './studyPlanWorkflow.mjs';
export function planUploadedDocument(attachment,document,records,arguments_,context={}){
 const data=readPlannerDocument(attachment),a=arguments_;
 if(a.targetMajor)throw new Error('This uploaded planner defines '+data.title+'. Remove it before switching to a database major planner.');
 const model=uploadedPlannerModel(data,records);
 const transcript=document?reviewDpa(validateDocument(document)).transcript:{completed:[],excluded:[],duplicateCompleted:[]};
 const now=new Date(),month=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuala_Lumpur',month:'numeric'}).format(now)),currentYear=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuala_Lumpur',year:'numeric'}).format(now));
 const term=a.term||context.term||(month<7?'Semester 2':'Semester 1'),year=Number(a.year||context.year||(month<7?currentYear:currentYear+1));
 if(!['Semester 1','Semester 2'].includes(term)||!Number.isInteger(year)||year<2000||year>2100)throw new Error('Choose Semester 1 or 2 and a year between 2000 and 2100.');
 const preferences=validatedPreferences({...context.preferences,...(a.maxUnits?{maxUnits:a.maxUnits}:{}),...(a.maxCredits?{maxCredits:a.maxCredits}:{})});
 const plan=semesterPlan({...model,transcript,term,maxUnits:preferences.maxUnits,maxCredits:preferences.maxCredits,provisional:true,preferences});
 const completionAudit=courseCompletionAudit({transcript,planner:model.planner,plan});
 const pathway=a.full?remainingStudyPlan({...model,transcript,term,year,preferences}):null;
 const warnings=[...model.warnings,...(!document?['No DPA attached: this plan starts with no completed units.']:[]),'Uploaded PDF categories and prerequisites define this draft. Database unit properties supplement credits and recurring offerings.',...(pathway?.warnings||plan.warnings)];
 plan.warnings=[...new Set(warnings)];if(pathway){pathway.warnings=plan.warnings;if(data.issues.length)pathway.completeDraft=false;}
 const semesters=pathway?.semesters||[{term,year,selected:plan.selected,credits:plan.credits}];
 const lines=['Using your uploaded study planner: '+data.title+' ('+data.name+').',document?'Completed and exempted units from '+document.name+' are excluded from the draft.':'No DPA attached, so this draft starts from the beginning.','Workload: up to '+preferences.maxUnits+' units / '+preferences.maxCredits+' CP per semester.',''];
 for(const s of semesters)lines.push('**'+s.term+' '+s.year+'** - '+s.selected.length+' unit'+(s.selected.length===1?'':'s')+', '+s.credits+' CP\n'+(s.selected.map(u=>'- '+u.code+' '+u.name+' ('+u.credits+' CP)').join('\n')||'Waiting for a recorded offering; no eligible units this semester.'));
 if(pathway){
  lines.push('\n'+(pathway.completeDraft?'All category requirements in this uploaded planner are covered, assuming each drafted unit is passed.':'This is a partial pathway. The following requirements still need attention:'));
  if(!pathway.completeDraft)for(const c of pathway.outstanding){lines.push(c.name+': '+(c.remainingCount??'unknown')+' remaining.');for(const u of c.options)lines.push('- '+u.code+': '+(u.reasons.join('; ')||'Not scheduled within this pathway'));}
 }
 return {answer:lines.join('\n\n'),workflow:'suggestions',tool:a.full?'plan_remaining_studies':'suggest_next_semester',data:{plan,pathway,completionAudit,preferences,planMode:pathway?'full':'semester',plannerSource:'upload',plannerConfirmed:true,planner:{name:data.title},term,year,documentName:document?.name||'No DPA - starting from scratch',uploadedPlannerName:data.name,unitReferences:model.planner.units.map(u=>({code:u.UnitCode,name:u.Name,credits:u.CreditPoints})),choices:[]}};
}
