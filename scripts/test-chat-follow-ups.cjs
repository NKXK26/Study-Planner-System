const assert=require('node:assert/strict');
(async()=>{
 const {chatFollowUps}=await import('../src/app/libs/chatFollowUps.mjs');
 const {validateToolCall}=await import('../src/app/libs/plannerToolDefinitions.mjs');
 const {questionBoundary}=await import('../src/app/libs/plannerAnswerability.mjs');
 const {attachmentKey}=await import('../src/app/libs/plannerIntent.mjs');
 const document={name:'DPA.xlsx',rows:[['Course','Status','Earned'],['COS10001','Complete',12.5]]};
 const verified=(tool,data)=>({tool,data,answerability:'verified'});
 const dpa={document,question:'Explain my DPA',toolResult:verified('explain_dpa',{tableVerified:true})};
 const dpaSteps=chatFollowUps(dpa);assert.deepEqual(dpaSteps.map(s=>s.call.name),['match_dpa_planners','suggest_next_semester']);
 const plan={selected:[{code:'COS40005',name:'Project A',credits:12.5}],candidates:[{code:'COS40005',status:'candidate',reasons:[]},{code:'COS40006',status:'blocked',reasons:['Project A must be completed first']}]};
 const audit={countsVerified:true,categories:[{name:'Core',remainingCount:2}]};
 const semester={document,question:'What should I take next semester?',suggestionContext:{planner:'53',plannerConfirmed:true},toolResult:verified('suggest_next_semester',{plan,completionAudit:audit,planner:{id:53,name:'24-Sep-CSDS'},term:'Semester 1'})};
 const steps=chatFollowUps(semester);assert.deepEqual(steps.map(s=>s.id),['why','blocked','finish']);assert.equal(steps[1].call.arguments.code,'COS40006');assert.equal(steps[2].call.arguments.planner,'53');
 const provisional=chatFollowUps({...semester,suggestionContext:{planner:'53',plannerConfirmed:false}});assert(!provisional.find(s=>s.id==='finish').call.arguments.planner,'Provisional matches must not be silently confirmed');
 const why=chatFollowUps({...semester,question:'Why was COS40006 not included?',toolResult:verified('explain_next_semester',{...semester.toolResult.data,focusCode:'COS40006'})});assert(!why.some(s=>s.id==='why'||s.id==='blocked'));
 const full=chatFollowUps({...semester,toolResult:verified('plan_remaining_studies',{...semester.toolResult.data,pathway:{semesters:[]}})});assert(!full.some(s=>s.id==='finish'),'Do not offer the pathway again');
 const unknown=chatFollowUps({...semester,toolResult:verified('suggest_next_semester',{...semester.toolResult.data,completionAudit:{countsVerified:false,categories:[]}})});assert(!unknown.some(s=>s.id==='finish'));
 for(const context of [{},{document},{...dpa,document:null},{...dpa,toolResult:verified('explain_dpa',{tableVerified:false})},{...semester,toolResult:{...semester.toolResult,answerability:'refused'}},{...semester,toolResult:{...semester.toolResult,answerability:'clarification'}},{...semester,toolResult:verified('suggest_next_semester',{needsSelection:true})}])assert.deepEqual(chatFollowUps(context),[]);
 const unit={toolResult:verified('inspect_unit',{unit:{code:'COS20019',terms:['Semester 1']}}),question:'Tell me about COS20019'};assert.equal(chatFollowUps(unit).length,2);assert(!chatFollowUps({...unit,question:'Show prerequisites for COS20019'}).some(s=>s.id==='rules'));assert(!chatFollowUps({...unit,toolResult:verified('inspect_unit',{unit:{code:'COS20019',terms:[]}})}).some(s=>s.id==='terms'));
 const changed={...document,rows:[...document.rows,['COS10002','Complete',12.5]]};assert.notEqual(steps[0].documentKey,attachmentKey(changed));
 for(const context of [dpa,semester,unit])for(const step of chatFollowUps(context)){assert(step.label&&step.prompt);validateToolCall(step.call);assert.notEqual(questionBoundary(step.prompt,context).status,'refuse');assert(!/can i take|eligible|guarantee|approve/i.test(step.prompt));}
 const multi={document,toolResult:{...semester.toolResult,toolResults:[dpa.toolResult,semester.toolResult]}};assert(!chatFollowUps(multi).some(s=>s.call?.name==='explain_dpa'));
 console.log('Result-grounded follow-ups passed: prerequisites, context continuation, unavailable outcomes, no repetitions, missing evidence, no guessed eligibility and stale DPA protection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
