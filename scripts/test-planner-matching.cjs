const assert=require('node:assert/strict');
(async()=>{
  const {rankPlannerMatches}=await import('../src/app/libs/plannerMatching.mjs');
  const {parseTranscript}=await import('../src/app/libs/doubleMajorChecker.mjs');
  const {inferPlannerTool}=await import('../src/app/libs/plannerToolDefinitions.mjs');
  const {interpretPlannerRequest}=await import('../src/app/libs/plannerRequest.mjs');
  const transcript=parseTranscript([['Course','Status','Earned','Grade'],['COS10001','Complete',12.5,'EXM'],['COS10002','Complete',12.5,'N'],['COS10003','Complete',12.5,'P']]);
  // A named major category and credits above recorded earned must not exclude
  // the best overlap from ranking; semester eligibility is a separate check.
  const planners=[{id:24,name:'24-Sep-CSDS',units:[{UnitCode:'COS10001',CreditPoints:25,unitType:{Name:'Data Science Major'}},{UnitCode:'COS10003',CreditPoints:12.5}]},{id:26,name:'26-Mar-CSDS',units:[{UnitCode:'COS10001'},{UnitCode:'COS10003'}]},{id:23,name:'23-Sep-CSAI',units:[{UnitCode:'COS10001',unitType:{Name:'Major'}},{UnitCode:'COS10002'}]}];
  const ranking=rankPlannerMatches(planners,transcript.completed);
  assert.deepEqual(ranking.map(r=>[r.planner.id,r.matched]),[[24,2],[26,2],[23,1]]);
  assert.equal(rankPlannerMatches([{id:1,units:[{UnitCode:'COS10001 title'},{UnitCode:'COS10001'}]}],transcript.completed)[0].matched,1);
  for(const question of ['highest match planner for this dpa','Which planner matches my DPA best?','closest planner to my transcript']){
    assert.equal(inferPlannerTool(question).name,'match_dpa_planners');
    const decision=await interpretPlannerRequest({question,suggestionContext:{targetMajor:'AI',planner:'23',plannerConfirmed:true}}, {fetchImpl:()=>{throw Error('Must not call model');}});
    assert.equal(decision.call.name,'match_dpa_planners');assert.deepEqual(decision.call.arguments,{});
  }
  console.log('Shared planner ranking, named major categories, N/EXM, stable ties and context-independent match routing passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
