const assert=require('node:assert/strict');
(async()=>{
 const {remainingStudyPlan,validatedPreferences,studyPlanRequest}=await import('../src/app/libs/studyPlanWorkflow.mjs');
 const {semesterPlan}=await import('../src/app/libs/academicPlanning.mjs');
 const {interpretPlannerRequest}=await import('../src/app/libs/plannerRequest.mjs');
 const unit=(code,category,terms=['Semester 1','Semester 2'])=>({ID:code,UnitCode:code,Name:code,CreditPoints:12.5,Availability:'published',unitType:{Name:category},UnitTermOffered:terms.map(TermType=>({TermType}))});
 const units=[unit('COS40005','Core'),unit('COS40006','Core'),unit('COS30001','Major',['Semester 2']),unit('ELE10001','Elective'),unit('ELE10002','Elective')];
 const planner={units,plannerTemplate:{requirements:[{unitType:{Name:'Core'},requiredCount:2},{unitType:{Name:'Major'},requiredCount:1},{unitType:{Name:'Elective'},requiredCount:1}]}};
 const transcript={completed:[],excluded:[],duplicates:0},original=JSON.stringify(transcript);
 const preferences=validatedPreferences({maxUnits:2,excluded:['ELE10001'],deferred:{COS40005:'Semester 2'}});
 const pathway=remainingStudyPlan({transcript,planner,relations:[],term:'Semester 1',year:2027,preferences});
 assert(pathway.completeDraft);assert.equal(JSON.stringify(transcript),original,'Hypothetical passes must not mutate DPA');
 assert(pathway.semesters.every(s=>s.selected.length<=2&&s.credits<=50));assert(!pathway.semesters.flatMap(s=>s.selected).some(u=>u.code==='ELE10001'));
 const semesterOf=code=>pathway.semesters.findIndex(s=>s.selected.some(u=>u.code===code));assert(semesterOf('COS40005')<semesterOf('COS40006'));assert.equal(pathway.semesters[semesterOf('COS40005')].term,'Semester 2');assert.equal(pathway.semesters[semesterOf('COS30001')].term,'Semester 2');
 const missing={...planner,plannerTemplate:null};assert.equal(remainingStudyPlan({transcript,planner:missing,relations:[],term:'Semester 1',year:2027,preferences:validatedPreferences()}).completeDraft,false);
 const blocked={...planner,units:units.map(u=>u.UnitCode==='COS40005'?{...u,Availability:'draft'}:u)};const partial=remainingStudyPlan({transcript,planner:blocked,relations:[],term:'Semester 1',year:2027,preferences:validatedPreferences()});assert.equal(partial.completeDraft,false);assert(partial.outstanding.some(c=>c.options.some(u=>u.code==='COS40006')));
 assert.throws(()=>validatedPreferences({maxUnits:8}));assert.throws(()=>validatedPreferences({maxCredits:75}));
 for(const [question,name] of [['Plan until I finish','plan_remaining_studies'],['Only two units next semester','adjust_study_plan'],["I don't want this elective",'adjust_study_plan'],['Move COS40005 to Semester 2','adjust_study_plan'],["Why wasn't Project B suggested?",'explain_next_semester']]){assert.equal(studyPlanRequest(question).name,name);const route=await interpretPlannerRequest({question},{fetchImpl:()=>assert.fail('Recognised adjustments must not require model')});assert.equal(route.call.name,name);}
 const completionPrompts=['what should i take to complete my study','What do I need to finish my studies?','Which subjects should I take to finish my degree?','What units do I need to graduate?','what i need to take next to complete studies','Plan all remaining semesters until I finish.'];
 for(const question of completionPrompts){const route=await interpretPlannerRequest({question,suggestionContext:{planner:'24',plannerConfirmed:true}},{fetchImpl:()=>assert.fail('Completion paraphrases must work offline')});assert.equal(route.call.name,'plan_remaining_studies',question);assert.equal(route.call.arguments.planner,'24');}
 for(const question of ['What should I take next semester to complete my study?','What should I take this semester to finish my degree?']){const route=await interpretPlannerRequest({question},{fetchImpl:()=>assert.fail('Single-semester completion must work offline')});assert.equal(route.call.name,'suggest_next_semester',question);}
 for(const question of ['Can I graduate with my current credits?','What are the official graduation requirements?',"Don't plan my remaining semesters",'What does graduation mean?'])assert.equal(studyPlanRequest(question),null,question);
 const majorRoute=await interpretPlannerRequest({question:'What units do I need to finish my degree in AI?'},{fetchImpl:()=>assert.fail('Explicit completion major must work offline')});assert.equal(majorRoute.call.arguments.targetMajor,'AI');
 const direct=semesterPlan({transcript,planner,relations:[],term:'Semester 1',maxUnits:2,maxCredits:25,provisional:true,preferences});assert(direct.candidates.find(u=>u.code==='COS40005').reasons.some(r=>r.includes('Deferred')));
 const {readPersonalDrafts,writePersonalDrafts}=await import('../src/app/libs/personalPlanDrafts.mjs');
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const draft={id:'one',name:'My draft',snapshot:{planner:{id:24,name:'24-Sep-CSDS'},term:'Semester 1',year:2027,units:[],preferences}};writePersonalDrafts(storage,'student-a',[draft]);assert.equal(readPersonalDrafts(storage,'student-a')[0].name,'My draft');assert.deepEqual(readPersonalDrafts(storage,'student-b'),[]);assert.throws(()=>writePersonalDrafts({setItem:()=>{throw Error('Storage full');}},'student-a',[draft]));
 console.log('Pathway sequencing, offerings, workload, preferences, unknown requirements, unchanged DPA, deterministic adjustments and account-scoped saved drafts passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
