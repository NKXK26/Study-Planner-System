const assert=require('node:assert/strict');
(async()=>{
  const {chatFollowUps}=await import('../src/app/libs/chatFollowUps.mjs');
  const {validateToolCall}=await import('../src/app/libs/plannerToolDefinitions.mjs');
  const document={name:'DPA.xlsx'};
  const states=[{}, {workflow:'suggestions'}, {document}, {document,workflow:'dpa'}, {workflow:'compare'}, {workflow:'compare',workspaceContext:{workflow:'compare',plannerA:'1',plannerB:'2'}}, {document,workflow:'double-major'}, {document,workflow:'double-major',planningContext:{dpaConfirmed:true},workspaceContext:{workflow:'double-major',primaryPlanner:'1'}}, {document,workflow:'suggestions',suggestionContext:{targetMajor:'AI'},toolResult:{data:{plan:{selected:[{code:'COS10001'}],candidates:[{code:'COS40006',status:'blocked'}]}}}}];
  for(const state of states){const steps=chatFollowUps(state);assert(steps.length>0&&steps.length<=3);assert.equal(new Set(steps.map(s=>s.id)).size,steps.length);for(const step of steps){assert(step.label);if(step.call)validateToolCall(step.call);else assert(['workspace','help'].includes(step.action));assert(!['maker','management','upload','templates'].includes(step.workflow));}}
  assert(chatFollowUps({}).some(s=>s.action==='workspace'&&s.id==='upload-dpa'));
  assert(!chatFollowUps({}).some(s=>s.call?.name==='suggest_next_semester'));
  const compare=chatFollowUps({workflow:'compare',workspaceContext:{workflow:'compare',plannerA:'1',plannerB:'2'}});assert.deepEqual(compare[0].call.arguments,{plannerA:'1',plannerB:'2'});
  assert(!chatFollowUps({document,workflow:'double-major'}).some(s=>s.call?.name==='check_double_major'));
  assert.equal(chatFollowUps(states.at(-1))[1].call.arguments.code,'COS40006');
  assert(!chatFollowUps({document,planningContext:{corrections:[{}],dpaConfirmed:false}}).some(step=>step.call));
  console.log('Contextual follow-up actions, upload/review gating, current selections and read-tool schemas passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
