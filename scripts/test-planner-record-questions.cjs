const assert=require('node:assert/strict');
(async()=>{
 const {interpretPlannerRequest,parsePlannerDecision}=await import('../src/app/libs/plannerRequest.mjs');
 const {plannerRecordRequest,resolvePlannerReference,formatPlannerUnits}=await import('../src/app/libs/plannerRecordRequests.mjs');
 const {nextSuggestionContext}=await import('../src/app/libs/plannerConversation.mjs');
 const {featureGuideRequest,describePlannerFeature,plannerFeatureGuides}=await import('../src/app/libs/plannerFeatureGuides.mjs');
 const {questionBoundary}=await import('../src/app/libs/plannerAnswerability.mjs');
 const offline=()=>{throw Error('offline');};
 for(const question of ['all the units in 23 sep csds','List all units in 23-Sep-CSDS','What are the units in 23_sep_csds?','show planner ID 47','show core units in 23 sep csds','how many units in 23 sep csds']){
  const intent=await interpretPlannerRequest({question,planningOnly:true},{fetchImpl:offline});assert.equal(intent.call.name,'inspect_planner',question);
 }
 assert.equal(plannerRecordRequest('show core units in 23 sep csds').arguments.category,'core');
 const record={id:47,name:'23-Sep-CSDS',units:[{UnitCode:'COS10001',Name:'Core unit',CreditPoints:12.5,unitType:{Name:'Core'}},{UnitCode:'COS20001',Name:'Major unit',CreditPoints:12.5,unitType:{Name:'Data Science Major'}}],plannerTemplateId:1,templates:[{id:1,name:'BCS',unitTypes:[{Name:'Core',requiredCount:8}]}]};
 assert.equal(resolvePlannerReference([record],'23 sep csds').planner.id,47);
 assert.equal(resolvePlannerReference([record],'23-sep-csai').status,'missing');
 assert.equal(resolvePlannerReference([record,{...record,id:48,name:'23-Sep-CSDS-r2'}],'23 sep').status,'ambiguous');
 assert.equal(resolvePlannerReference([record,{...record,id:48,name:'23 Sep CSDS'}],'23 sep csds').status,'ambiguous');
 const answer=formatPlannerUnits(record,{});assert.match(answer,/COS10001 Core unit/);assert.match(answer,/COS20001 Major unit/);assert.match(answer,/Core: 8 required/);
 const major=formatPlannerUnits(record,{category:'major'});assert.match(major,/COS20001/);assert(!major.includes('COS10001'));
 const context=nextSuggestionContext({planner:'53',plannerConfirmed:true},{tool:'inspect_planner',data:record});assert.equal(context.planner,'53');assert.equal(context.inspectedPlanner,'47');
 assert.equal(plannerRecordRequest('show units in that planner',context).arguments.planner,'47');
 const parsed=parsePlannerDecision({content:JSON.stringify({action:'inspect_planner',arguments:{planner:'23-Sep-CSDS'}})},{question:'all units in 23 sep csds'});assert.equal(parsed.call.name,'inspect_planner');
 assert.throws(()=>parsePlannerDecision({content:JSON.stringify({action:'inspect_planner',arguments:{planner:'24-Sep-CSDS'}})},{question:'all units in 23 sep csds'}));
 for(const question of ['suggest units from 23 sep csds next semester','what units do I need to complete studies with 23 sep csds','do not list units in 23 sep csds','compare 23 sep csds vs 24 sep csds'])assert.equal(plannerRecordRequest(question),null,question);
 for(const [question,workflow]of [['how does Study Planner Templates work','templates'],['how do I upload a study planner','upload'],['how does Unit Suggestions work','suggestions'],['what is Study Planner Maker','maker'],['how do I use Study Planner Management','management'],['how does Differentiate Study Planners work','compare'],['how does Double Major Checker work','double-major']]){
  assert.equal(featureGuideRequest(question).arguments.workflow,workflow,question);assert.equal(questionBoundary(question).status,'supported');
  const routed=await interpretPlannerRequest({question,planningOnly:true},{fetchImpl:offline});assert.equal(routed.call.name,'describe_workflow');assert.equal(routed.call.arguments.workflow,workflow);
  assert(describePlannerFeature(workflow).includes(plannerFeatureGuides.find(g=>g.id===workflow).href));
 }
 for(const question of ['all the planner in the database','all planners','show all saved planners','what planners are available in the database','which study planners do you have','how many planners exist in the database']){
  const listed=await interpretPlannerRequest({question,planningOnly:true},{fetchImpl:offline});assert.equal(listed.call.name,'list_planners',question);assert.deepEqual(listed.call.arguments,{});
 }
 const stale={targetMajor:'AI',planner:'46',plannerConfirmed:true};
 for(const question of ['list planners','show all planners','all the planner in the database','which planners are available']){
  const all=await interpretPlannerRequest({question,suggestionContext:stale,conversationHistory:[{role:'user',content:'show AI planners'}]},{fetchImpl:()=>{throw Error('Broad requests should not need model inference');}});
  assert.equal(all.call.name,'list_planners');assert.deepEqual(all.call.arguments,{});
  const proposed=parsePlannerDecision({content:JSON.stringify({action:'list_planners',arguments:{search:'CSAI'}})},{question,suggestionContext:stale,conversationHistory:[{role:'user',content:'show AI planners'}]});assert.deepEqual(proposed.call.arguments,{});
 }
 for(const [question,search]of [['list all AI planners','CSAI'],['show data science planners','CSDS'],['show software development planners','CSSD']]){
  const filtered=await interpretPlannerRequest({question,planningOnly:true},{fetchImpl:offline});assert.equal(filtered.call.name,'list_planners');assert.equal(filtered.call.arguments.search,search);
 }
 assert.throws(()=>parsePlannerDecision({content:JSON.stringify({action:'list_planners',arguments:{search:'CSAI'}})},{question:'give me the catalogue',conversationHistory:[{role:'user',content:'AI planners'}]}));
 assert.equal(plannerFeatureGuides.length,7);
 const {plannerUnitReadSelect}=await import('../src/app/libs/plannerReadCompatibility.mjs');
 const legacy=await plannerUnitReadSelect({$queryRawUnsafe:async()=>['id','studyPlannerId','unitId','unitTypeId'].map(name=>({name}))});assert(!legacy.plannedYear);assert(legacy.unit&&legacy.unitType);
 const modern=await plannerUnitReadSelect({$queryRawUnsafe:async()=>['id','plannedYear','plannedSemester','plannedDates','sortOrder'].map(name=>({name}))});assert.equal(modern.plannedYear,true);assert.equal(modern.sortOrder,true);
 const {validateToolCall}=await import('../src/app/libs/plannerToolDefinitions.mjs');assert.throws(()=>validateToolCall({name:'inspect_planner',arguments:{planner:'47',category:'imaginary'}}));
 console.log('Planner knowledge passed: natural references, unit lists, category filters, safe ambiguity, follow-ups and all seven feature guides.');
})().catch(e=>{console.error(e);process.exitCode=1;});
