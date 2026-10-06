const assert=require('node:assert/strict');
(async()=>{
  const {interpretPlannerRequest,parsePlannerDecision}=await import('../src/app/libs/plannerRequest.mjs');
  const {requestedMajor}=await import('../src/app/libs/plannerIntent.mjs');
  const {inferPlannerTool}=await import('../src/app/libs/plannerToolDefinitions.mjs');
  const decide=async(input,decision)=>interpretPlannerRequest(input,{fetchImpl:async(url,opts)=>{
    const body=JSON.parse(opts.body);assert(body.messages[0].content.startsWith('PLANNER_INTENT_ROUTER'));
    assert.equal(JSON.parse(body.messages.at(-1).content).question,input.question);
    assert(!JSON.stringify(body.messages).includes('PRIVATE DPA TEXT'));
    return {ok:true,json:async()=>({message:{content:JSON.stringify(decision)}})};
  }});
  const cases=[
    ['Help me pick subjects for the coming term','suggest_next_semester',{}],
    ['Could I pursue a second concentration?','check_double_major',{}],
    ['Put those two side by side','compare_planners',{plannerA:'12',plannerB:'18'}],
    ['Why did you pick these?','explain_next_semester',{}],
  ];
  for(const [question,name,args]of cases){
    const input={question,workflow:'suggestions',document:{text:'PRIVATE DPA TEXT'},conversationHistory:[{role:'user',content:'planner ID 12 and planner ID 18'}]};
    const result=await decide(input,{kind:'tool',call:{name,arguments:args}});assert.equal(result.call.name,name);assert.deepEqual(result.call.arguments,args);
  }
  assert.equal((await decide({question:'What is a double major?'},{kind:'answer'})).kind,'answer');
  const structured=await decide({question:'help choose subjects'},{action:'suggest_next_semester',arguments:{term:'coming term',primaryPlanner:'invented'},message:''});assert.equal(structured.call.name,'suggest_next_semester');assert.deepEqual(structured.call.arguments,{});
  assert.equal((await decide({question:'Either AI or data science, which planner?'},{kind:'clarify',message:'Which major should I use: AI or Data Science?'})).kind,'clarify');
  assert.equal(requestedMajor('switch from AI to data science'),'DS');
  assert.equal(requestedMajor('I want to switch from AI to data science'),'DS');
  assert.equal(requestedMajor('switch to data science instead of AI'),'DS');
  assert.equal(requestedMajor('not AI, data science instead'),'DS');
  assert.equal(requestedMajor('AI or data science'),null);
  assert.equal(inferPlannerTool('What is a double major?'),null);
  assert.equal(inferPlannerTool('do not suggest next semester units'),null);
  const parse=(call,input={question:'hello'})=>parsePlannerDecision({content:JSON.stringify({kind:'tool',call})},input);
  assert.throws(()=>parse({name:'save_planner',arguments:{}}));
  assert.throws(()=>parse({name:'inspect_planner',arguments:{planner:'987654'}}));
  assert.throws(()=>parse({name:'suggest_next_semester',arguments:{targetMajor:'AI'}}));
  assert.throws(()=>parsePlannerDecision({content:'not JSON'},{}));
  const follow=await decide({question:'same major, suggest next semester',suggestionContext:{targetMajor:'AI'}},{kind:'tool',call:{name:'suggest_next_semester',arguments:{}}});assert.equal(follow.call.arguments.targetMajor,'AI');
  const selected=await decide({question:'compare these',workflow:'compare',workspaceContext:{workflow:'compare',plannerA:'12',plannerB:'18'}},{action:'compare_planners',arguments:{},message:''});assert.deepEqual(selected.call.arguments,{plannerA:'12',plannerB:'18'});
  const stale=await decide({question:'compare these',workflow:'compare',workspaceContext:{workflow:'management',plannerA:'12',plannerB:'18'}},{action:'compare_planners',arguments:{},message:''});assert.deepEqual(stale.call.arguments,{});
  const override=await decide({question:'compare selected planner ID 22 with ID 33',workflow:'compare',workspaceContext:{workflow:'compare',plannerA:'12',plannerB:'18'}},{action:'compare_planners',arguments:{plannerA:'22',plannerB:'33'},message:''});assert.deepEqual(override.call.arguments,{plannerA:'22',plannerB:'33'});
  const offline=async()=>{throw new Error('offline')};
  const explicitOffline=await interpretPlannerRequest({question:'compare these instead, ID 22 vs ID 33',workflow:'compare',workspaceContext:{workflow:'compare',plannerA:'12',plannerB:'18'}},{fetchImpl:offline});assert.deepEqual(explicitOffline.call.arguments,{});
  const fallback=await interpretPlannerRequest({question:'suggest next semester'},{fetchImpl:offline});assert.equal(fallback.call.name,'suggest_next_semester');assert.equal(fallback.source,'fallback');
  const invalid=await decide({question:'suggest next semester'},{kind:'tool',call:{name:'delete_planner',arguments:{}}});assert.equal(invalid.source,'fallback');assert.equal(invalid.call.name,'suggest_next_semester');
  assert.equal((await interpretPlannerRequest({question:'What is a double major?'},{fetchImpl:offline})).kind,'answer');
  console.log('Semantic routing integration, follow-up context, destination corrections, grounding, invalid output and offline fallback passed (mock model).');
})().catch(e=>{console.error(e);process.exitCode=1;});
