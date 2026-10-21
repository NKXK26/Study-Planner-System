const assert=require('node:assert/strict');
(async()=>{
  const {courseCompletionAudit,formatCompletionAudit,isCourseCompletionRequest}=await import('../src/app/libs/courseCompletion.mjs');
  const {reviewDpa,semesterPlan}=await import('../src/app/libs/academicPlanning.mjs');
  const {interpretPlannerRequest}=await import('../src/app/libs/plannerRequest.mjs');
  const {questionBoundary}=await import('../src/app/libs/plannerAnswerability.mjs');
  const {composeToolReply}=await import('../src/app/libs/plannerResponse.mjs');
  const unit=(code,name,category)=>({ID:code,UnitCode:code,Name:name,CreditPoints:12.5,Availability:'published',unitType:{Name:category},UnitTermOffered:[{TermType:'Semester 1'}]});
  const units=[unit('COS10001','Intro','Core'),unit('COS10002','Core sequel','Core'),unit('COS40005','Computing Project A','Major'),unit('COS40006','Computing Project B','Major'),unit('ELE10001','Elective one','Elective'),unit('ELE10002','Elective option','Elective')];
  const planner={units,plannerTemplate:{requirements:[{unitType:{Name:'Core'},requiredCount:2},{unitType:{Name:'Major'},requiredCount:2},{unitType:{Name:'Elective'},requiredCount:1}]}};
  const transcript=reviewDpa({rows:[['Course','Status','Earned','Grade'],['COS10001','Complete',12.5,'EXM'],['ELE10001','Complete',12.5,'P'],['AE1','Complete',12.5,'EXM'],['COS40005','Complete',12.5,'N']]}).transcript;
  const plan=semesterPlan({transcript,planner,relations:[],term:'Semester 1',maxCredits:50,maxUnits:4,provisional:true});
  const audit=courseCompletionAudit({transcript,planner,plan});
  assert.deepEqual(audit.categories.map(c=>[c.name,c.remainingCount]),[['Core',1],['Major',2],['Elective',0]]);
  assert.equal(audit.categories.find(c=>c.name==='Elective').options.length,0,'A fulfilled elective pool must not require all its alternatives');
  assert(audit.categories.find(c=>c.name==='Major').options.some(u=>u.code==='COS40005'),'N is unfinished even with positive recorded credit');
  assert(audit.categories.find(c=>c.name==='Major').options.find(u=>u.code==='COS40006').reasons.some(r=>/Project A/.test(r)));
  assert(plan.selected.some(u=>u.code==='COS40005'));assert(!plan.selected.some(u=>u.code==='COS40006'||u.code==='ELE10002'));
  assert.deepEqual(audit.unmatched,[]);assert.match(formatCompletionAudit(audit),/AE1 counts as 1 elective slot/);
  const unknown=courseCompletionAudit({transcript,planner:{units},plan});assert.equal(unknown.countsVerified,false);assert(unknown.categories.every(c=>c.remainingCount===null));
  const zeroPlanner={units,plannerTemplate:{requirements:[{unitType:{Name:'Elective'},requiredCount:0}]}};
  const zero=semesterPlan({transcript:{completed:[]},planner:zeroPlanner,relations:[],term:'Semester 1',maxCredits:50,maxUnits:4,provisional:true});assert(!zero.selected.some(u=>u.category==='Elective'));
  for(const question of ['what i need to take next to complete studies','Which units remain to finish my degree?','What units do I need to graduate?']){
    assert(isCourseCompletionRequest(question));assert.equal(questionBoundary(question).status,'supported');
    const route=await interpretPlannerRequest({question},{fetchImpl:async()=>assert.fail('Explicit completion planning should work without a model')});assert.equal(route.call.name,'plan_remaining_studies');
  }
  assert.equal(questionBoundary('Can I graduate with my current credits?').status,'refuse');assert(!isCourseCompletionRequest('What are the official graduation requirements?'));
  const reply=await composeToolReply({tool:'explain_dpa',workflow:'dpa',answer:'Recorded DPA facts',data:{tableVerified:true}},{question:'Explain my DPA'},{fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({intro:'Here is the comparison using your current selections.'})}})})});
  assert.equal(reply.answer,'Recorded DPA facts','A DPA explanation must not receive a comparison introduction');
  console.log('Course completion audit, category alternatives, exemptions, failed units, FYP sequence, routing and scoped introductions passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
