const tool=(id,label,prompt,name,args={})=>({id,label,prompt,call:{name,arguments:args}});
const workspace=(id,label,workflow,instruction)=>({id,label,action:'workspace',workflow,instruction});
const help={id:'help',label:'How to use this chat',action:'help'};
const explain=()=>tool('dpa','Explain my DPA','Explain my DPA','explain_dpa');
const suggest=context=>tool('suggest','Suggest next semester','Suggest units for my next semester','suggest_next_semester',context.suggestionContext?.targetMajor?{targetMajor:context.suggestionContext.targetMajor}:{});
const upload=workflow=>workspace('upload-dpa','Upload my DPA',workflow,'Upload your DPA PDF or XLSX in the planning workspace. I use its recorded results for personal advice; N is failed and earned EXM credit counts as exempted.');
const choosePlanners=()=>workspace('choose-planners','Choose planners to compare','compare','Choose two planners in the planning workspace, then select Compare or type "compare these two".');
export function chatFollowUps(context={}) {
  const {document,workflow,planningContext,workspaceContext,toolResult}=context;
  let steps;
  if(planningContext?.corrections?.length&&!planningContext.dpaConfirmed)steps=[workspace('confirm-corrections','Confirm DPA corrections',['dpa','suggestions','double-major'].includes(workflow)?workflow:'dpa','Review and confirm your edited DPA entries in the workspace before I calculate personal results.'),choosePlanners(),help];
  else if(workflow==='compare') {
    const selected=workspaceContext?.workflow==='compare'&&workspaceContext.plannerA&&workspaceContext.plannerB&&workspaceContext.plannerA!==workspaceContext.plannerB;
    steps=[selected?tool('compare','Compare selected planners','Compare these two selected planners','compare_planners',{plannerA:workspaceContext.plannerA,plannerB:workspaceContext.plannerB}):choosePlanners(),document?suggest(context):upload('suggestions'),document?explain():help];
  }else if(!document)steps=[upload(['dpa','suggestions','double-major'].includes(workflow)?workflow:'suggestions'),choosePlanners(),help];
  else if(workflow==='double-major') {
    const primary=workspaceContext?.workflow==='double-major'?workspaceContext.primaryPlanner:null;
    steps=[planningContext?.dpaConfirmed&&primary?tool('double-major','Check second-major options','Check my second-major options using my selected primary planner','check_double_major',{primaryPlanner:primary}):workspace('review-major','Review DPA / choose primary planner','double-major','Confirm the extracted DPA entries and select your actual primary planner in the workspace. Then I can calculate second-major unit coverage.'),explain(),suggest(context)];
  }else if(toolResult?.data?.plan) {
    const plan=toolResult.data.plan;
    const unit=plan.candidates.find(u=>u.status!=='candidate')||plan.selected[0];
    steps=[tool('why','Why these units?','Why did you choose these units for my next semester?','explain_next_semester'),unit?tool('unit','Check '+unit.code,'Can I take '+unit.code+' next semester? Explain its recorded checks.','explain_next_semester',{code:unit.code}):explain(),workspace('semester','Review semester / planner','suggestions','Use Change the assumed semester or matched planner in the workspace, then select Update suggestions to recalculate.')];
  }else steps=[explain(),suggest(context),workspace('second-major','Check a double major','double-major','Review and confirm your DPA entries and select your actual primary planner in the workspace to check second-major options.')];
  return steps.slice(0,3);
}
export const CHAT_HELP='I can help you with four tasks:\n\n1. Explain your DPA, including completed, failed and exempted units.\n2. Suggest up to four next-semester units using a matching planner and recorded checks.\n3. Compare two planners you select in the workspace.\n4. Check second-major unit coverage after you confirm your DPA and primary planner.\n\nFor personal advice, upload a DPA PDF or XLSX. You can tap the suggestions below or write your own question. Planner matching is provisional; I cannot approve enrolment or verify policies and offerings that are not recorded.';
