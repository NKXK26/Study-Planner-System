const assert=require('node:assert/strict');
(async()=>{
 const {interpretPlannerRequest,parsePlannerDecision}=await import('../src/app/libs/plannerRequest.mjs');
 const {questionBoundary}=await import('../src/app/libs/plannerAnswerability.mjs');
 const {executePlannerTasks}=await import('../src/app/libs/plannerTaskRunner.mjs');
 const {normalizeStudentRequest}=await import('../src/app/libs/plannerLanguage.mjs');
 const context={planner:'53',plannerName:'24-Sep-CSDS',plannerConfirmed:true,planMode:'full',targetMajor:'DS',unitCode:'COS40006'};
 const offline=()=>{throw Error('offline');};
 for(const [question,name] of [
 ['Help me figure out my last few classes','plan_remaining_studies'],
 ['wat should i take to complte my study','plan_remaining_studies'],
 ["what's left for me?",'plan_remaining_studies'],
 ['What else do I need?','plan_remaining_studies'],
 ['only two','adjust_study_plan'],['just 3','adjust_study_plan'],['why not that?','explain_next_semester'],
 ['again','plan_remaining_studies'],['summarize this','explain_dpa'],
 ['sugest next sem','suggest_next_semester'],['check duble major','check_double_major'],
 ['not AI, data science instead','suggest_next_semester']]){
  const input={question,document:{name:'dpa.xlsx'},workflow:'suggestions',suggestionContext:context};
  assert.notEqual(questionBoundary(question,input).status,'refuse',question);
  const route=await interpretPlannerRequest(input,{fetchImpl:offline});assert.equal(route.call?.name,name,question);
  if(question==='only two')assert.equal(route.call.arguments.maxUnits,'2');
 }
 const indirectMulti=await interpretPlannerRequest({question:'Read my academic record and map a route to finishing',document:{},planningOnly:true},{fetchImpl:offline});assert.deepEqual(indirectMulti.calls.map(c=>c.name),['explain_dpa','plan_remaining_studies']);
 assert.equal(normalizeStudentRequest('COS40006 wat?'),'COS40006 what?');
 assert.equal((await interpretPlannerRequest({question:'change this',suggestionContext:context},{fetchImpl:offline})).kind,'clarify');
 const multi=await interpretPlannerRequest({question:'Explain my DPA and check double major then plan all remaining semesters until I finish',planningOnly:true},{fetchImpl:offline});
 assert.deepEqual(multi.calls.map(c=>c.name),['explain_dpa','check_double_major','plan_remaining_studies']);
 const modelTasks={action:'tasks',arguments:{},message:'',tasks:[{name:'explain_dpa',arguments:{}},{name:'suggest_next_semester',arguments:{}}]};
 const parsed=parsePlannerDecision({content:JSON.stringify(modelTasks)},{question:'Read my results and recommend subjects'});assert.equal(parsed.calls.length,2);
 assert.equal(parsePlannerDecision({tool_calls:modelTasks.tasks.map(functionCall=>({function:functionCall}))},{question:'Read my results and recommend subjects'}).calls.length,2);
 assert.throws(()=>parsePlannerDecision({content:JSON.stringify({...modelTasks,tasks:[{name:'save_planner',arguments:{}}]})},{question:'save my planner'}));
 assert.throws(()=>parsePlannerDecision({content:JSON.stringify({...modelTasks,tasks:Array(5).fill(modelTasks.tasks[0])})},{question:'explain my DPA'}));
 assert.throws(()=>parsePlannerDecision({content:JSON.stringify({action:'inspect_unit',arguments:{unitQuery:'Invented name'},message:''})},{question:'Tell me about cloud computing'}));
 assert.throws(()=>parsePlannerDecision({tool_calls:[{function:{name:'inspect_unit',arguments:JSON.stringify({unitQuery:'Invented name'})}}]},{question:'Tell me about cloud computing'}));
 assert.equal(parsePlannerDecision({content:JSON.stringify({action:'inspect_unit',arguments:{unitQuery:'cloud computing'},message:''})},{question:'Tell me about cloud computing'}).call.arguments.unitQuery,'cloud computing');
 assert.throws(()=>parsePlannerDecision({content:JSON.stringify({action:'adjust_study_plan',arguments:{action:'workload',maxUnits:'4'},message:''})},{question:'only two'}));
 const executed=[];const run=async(call,ctx)=>{executed.push(call.name);if(call.name==='suggest_next_semester')assert.equal(ctx.suggestionContext.targetMajor,'AI');return {tool:call.name,workflow:'suggestions',answer:call.name,data:{targetMajor:'AI'},answerability:'verified'};};
 const result=await executePlannerTasks(modelTasks.tasks,{question:'explain my DPA and suggest subjects',context:{document:{}},run,compose:async r=>r});assert.deepEqual(executed,['explain_dpa','suggest_next_semester']);assert.equal(result.toolResults.length,2);assert(result.answer.includes('explain_dpa'));assert(result.answer.includes('suggest_next_semester'));
 let calls=0;const awaiting=await executePlannerTasks(modelTasks.tasks,{question:'explain my DPA and suggest subjects',run:async()=>{calls++;return {tool:'explain_dpa',workflow:'dpa',answer:'Upload your DPA',answerability:'clarification',data:{}};},compose:async r=>r});assert.equal(calls,1);assert.equal(awaiting.suggestionContext.pendingQuestion,'explain my DPA and suggest subjects');
 calls=0;const partial=await executePlannerTasks(modelTasks.tasks,{context:{document:{}},run:async()=>{if(++calls===2)throw Error('database unavailable');return {tool:'explain_dpa',answer:'Verified completed units',data:{},answerability:'verified'};},compose:async r=>r});assert(partial.answer.includes('Verified completed units'));assert.equal(partial.answerability,'refused');
 for(const question of ['Can I graduate with my current credits?','Is COS40006 offered in 2028?','What is the weather?'])assert.equal(questionBoundary(question,{document:{},suggestionContext:context}).status,'refuse');
 console.log('Natural prompt regression passed: typos, context, ambiguity, task sequences, argument grounding, upload continuation, partial failures and refusal boundaries.');
})().catch(e=>{console.error(e);process.exitCode=1;});
