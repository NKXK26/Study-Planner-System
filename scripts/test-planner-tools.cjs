const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {spawn} = require('node:child_process');

(async () => {
  const {inferPlannerTool,validateToolCall} = await import('../src/app/libs/plannerToolDefinitions.mjs');
  const {extractPlannerCodes,extractPlannerCategories} = await import('../src/app/libs/plannerImport.mjs');
  assert.deepEqual(extractPlannerCategories('COS10001\tCore\nCOS20001\tMajor\nCOS30001\tCore Elective',[{ID:1,Name:'Core'},{ID:2,Name:'Major'},{ID:3,Name:'Elective'}]),{COS10001:1,COS20001:2});
  const {parsePlanningPrompt}=await import('../src/app/libs/planningPrompt.mjs');
  assert.deepEqual(parsePlanningPrompt('use three units in semester 2 2027, limit to 37.5 CP'),{maxUnits:3,maxCredits:37.5,year:2027,term:'Semester 2'});
  assert.equal(parsePlanningPrompt('why did you choose three units?'),null);
  assert.equal(parsePlanningPrompt('Can I take 4 units?'),null);
  assert.equal(parsePlanningPrompt("don't use three units"),null);
  assert.equal(parsePlanningPrompt('do not set 50 CP'),null);
  assert.equal(parsePlanningPrompt('use planner ID 2027'),null);
  assert.equal(parsePlanningPrompt('if I take three units in 2027'),null);
  assert.deepEqual(parsePlanningPrompt('set year 2027'),{year:2027});
  assert.equal(inferPlannerTool('differentiate my planners pls').name,'compare_planners');
  assert.equal(inferPlannerTool('import a planner').arguments.workflow,'upload');
  assert.equal(inferPlannerTool('create a study planner').arguments.workflow,'maker');
  assert.equal(inferPlannerTool('can i do 2 majors').name,'check_double_major');
  assert.deepEqual(extractPlannerCodes('COS 20031 COS20031 INF10002'),['COS20031','INF10002']);
  assert.throws(()=>validateToolCall({name:'delete_planner',arguments:{}}));
  assert.throws(()=>validateToolCall({name:'save_planner',arguments:{}}));
  assert.throws(()=>validateToolCall({name:'compare_planners',arguments:'{bad'}));
  assert.throws(()=>validateToolCall({name:'open_workflow',arguments:{workflow:'secret'}}));
  assert.equal(inferPlannerTool('ID 12 vs ID 18').name,'compare_planners');
  assert.equal(inferPlannerTool('show planner ID 12').arguments.planner,'12');
  assert.equal(inferPlannerTool('explain my dpa').arguments.workflow,'dpa');
  assert.throws(()=>validateToolCall({name:'check_double_major',arguments:{plannerA:'1',plannerB:'2'}}));
  const toolSource=fs.readFileSync('src/app/libs/plannerTools.server.js','utf8').trimStart().replace(/^import .*;\r?\n/gm,'').replace(/export async function/g,'async function');
  const profile={IsActive:true,UserRoles:[{Role:{Name:'Lecturer',IsActive:true,RolePermissions:[{Granted:true,Permission:{IsActive:true,Resource:'study_plans',Action:'read'}}]}}]};
  const identity=new Function('prisma','SecureSessionManager',toolSource+'\nreturn toolIdentity;')({userProfile:{findUnique:async()=>profile}},{ValidateSession:token=>({success:token==='signed',session:{email:'test@example.test'}}),authenticateUser:async()=>({id:1,profileId:1})});
  const signed=new Request('http://localhost',{headers:{authorization:'Bearer signed','x-session-email':'test@example.test'}});
  assert.equal((await identity(signed)).canWrite,false);
  await assert.rejects(identity(signed,'update'),e=>e.status===403);
  await assert.rejects(identity(new Request('http://localhost',{headers:{authorization:'Bearer forged','x-session-email':'test@example.test'}})),e=>e.status===401);

  // Only a disposable database copy is mutated. The source database is never opened for writes.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'planner-tool-checks-'));
  const database = path.join(temp,'app.db');
  fs.copyFileSync('prisma/app.db',database);
  let modelRequests=0;const inferenceModels=[];
  const ai = http.createServer(async(req,res)=>{
    modelRequests++;let text='';for await(const chunk of req)text+=chunk;
    if(req.url==='/api/tags'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({models:[{name:'test:small'},{name:'alternate:4b'}]}));return;}
    const body=JSON.parse(text||'{}');
    inferenceModels.push(body.model);assert.equal(body.think,false);
    if(body.messages?.[0]?.content==='Return only JSON: {"ok":true}'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done:true,message:{content:'{"ok":true}'}}));return;}
    const question=JSON.parse(body.messages.at(-1).content).question;
    if(body.messages[0].content.startsWith('PLANNER_RESPONSE_WRITER')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:JSON.stringify({intro:'I checked the current records. Here is the result for your question.'})}}));return;}
    if(body.messages[0].content.startsWith('PLANNER_INTENT_ROUTER')) {
      let call=inferPlannerTool(question,JSON.parse(body.messages.at(-1).content).workflow);
      if(question==='Help me pick subjects for the coming term')call={name:'suggest_next_semester',arguments:{}};
      if(question==='Which layouts are available?')call={name:'list_templates',arguments:{}};
      if(question==='Why did you pick these?')call={name:'explain_next_semester',arguments:{}};
      const decision=call?{kind:'tool',call}:{kind:'answer'};
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:JSON.stringify(decision)}}));return;
    }
    if(!body.tools){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:'I can explain planning concepts. Saving actions are not available without reviewed forms.'}}));return;}
    const name=question.includes('unauthorised action')?'save_planner':'list_templates';
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({message:{content:'',tool_calls:[{function:{name,arguments:{}}}]}}));
  });
  await new Promise(resolve=>ai.listen(0,'127.0.0.1',resolve));
  const port=3118,base=`http://127.0.0.1:${port}`;
  let output='';
  const server=spawn(process.execPath,['.next/standalone/server.js'],{
    windowsHide:true,env:{...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',NEXT_PUBLIC_MODE:'DEV',DATABASE_URL:`file:${database.replaceAll('\\','/')}`,OLLAMA_MODEL:'test:small',OLLAMA_ROUTER_MODEL:'test:small',OLLAMA_RESPONSE_MODEL:'test:small',OLLAMA_URL:`http://127.0.0.1:${ai.address().port}`},stdio:['ignore','pipe','pipe'],
  });
  server.stdout.on('data',b=>{output+=b;});server.stderr.on('data',b=>{output+=b;});
  const request=async(url,body,authorized=true)=>{
    const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Connection':'close',...(authorized?{'x-dev-override':'true'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    return {...await response.json(),status:response.status};
  };
  const call=(name,args={},extra={})=>request('/api/planner-assistant/tools',{call:{name,arguments:args},...extra});
  try {
    const started=Date.now();while(!output.includes('Ready in')){if(server.exitCode!==null||Date.now()-started>20000)throw new Error(`Test server did not start: ${output}`);await new Promise(r=>setTimeout(r,100));}
    assert.equal((await request('/api/planner-assistant/tools',null,false)).status,401);
    assert.equal((await request('/api/double-major-pathway',{document:null},false)).status,401);
    assert.equal((await request('/api/double-major-pathway',{document:null})).status,400);
    const catalog=await request('/api/planner-assistant/tools');assert.equal(catalog.status,200);assert(catalog.planners.length>=2);assert(catalog.units.length);
    const [a,b]=catalog.planners;
    assert.equal((await request('/api/planner-assistant?verify=1',null,false)).status,401);
    const statusResponse=await fetch(base+'/api/planner-assistant',{headers:{Connection:'close'}});
    assert.equal((await statusResponse.json()).status,'installed');
    assert.equal(statusResponse.headers.get('cache-control'),'no-store');
    const verifiedResponse=await fetch(base+'/api/planner-assistant?verify=1',{headers:{'x-dev-override':'true',Connection:'close'}});
    assert.equal((await verifiedResponse.json()).status,'ready');
    const selectedStatus=await (await fetch(base+'/api/planner-assistant?model=alternate%3A4b',{headers:{Connection:'close'}})).json();
    assert.deepEqual(selectedStatus.models,['alternate:4b']);assert(selectedStatus.installedModels.includes('alternate:4b'));
    const swapStart=inferenceModels.length;
    const swapped=await request('/api/planner-assistant',{question:`compare planner ID ${a.id} vs ID ${b.id}`,enableTools:true,aiModel:'alternate:4b'});
    assert(swapped.toolResult.data.diff);assert.deepEqual(inferenceModels.slice(swapStart),['alternate:4b','alternate:4b']);
    const toolSwapStart=inferenceModels.length;
    await call('compare_planners',{plannerA:String(a.id),plannerB:String(b.id)},{aiModel:'alternate:4b'});
    assert.deepEqual(inferenceModels.slice(toolSwapStart),['alternate:4b']);
    assert.equal((await request('/api/planner-assistant',{question:'suggest next semester',enableTools:true,aiModel:'not-installed:7b'})).status,409);
    assert.equal((await request('/api/planner-assistant',{question:'suggest next semester',enableTools:true,aiModel:{name:'alternate:4b'}})).status,400);
    const beforePlannerMode=modelRequests;
    const plannerMode=await request('/api/planner-assistant',{question:`compare planner ID ${a.id} vs ID ${b.id}`,enableTools:true,planningOnly:true});
    assert(plannerMode.toolResult.data.diff);assert.equal(plannerMode.toolResult.responseStyle,'verified');
    await call('compare_planners',{plannerA:String(a.id),plannerB:String(b.id)},{planningOnly:true});
    assert.equal(modelRequests,beforePlannerMode,'Both chat and workspace planner mode must skip inference');
    const before=modelRequests;
    for(const question of ['What is the weather?','Will the university approve my double major?','Is COS20019 offered in 2028?','Who teaches COS20019?','What scholarship can I get for my major?']){const refused=await request('/api/planner-assistant',{question,enableTools:true,workflow:'suggestions',conversationHistory:[{role:'user',content:'Suggest my next semester'}],document:{name:'test.xlsx',text:'Course\tStatus\tEarned\tGrade\nCOS10001\tComplete\t12.5\tEXM'}});assert.equal(refused.status,200);assert.equal(refused.answerability,'refused');assert.match(refused.answer,/unable to answer/i);assert(!refused.toolResult);}
    assert.equal(modelRequests,before,'Unsupported questions must not invoke the model or execute a suggested tool');
    const uniqueUnit=catalog.units.find(u=>catalog.units.filter(v=>v.UnitCode===u.UnitCode).length===1&&catalog.units.filter(v=>v.Name===u.Name).length===1);
    assert(uniqueUnit);
    const byName=await call('inspect_unit',{unitQuery:uniqueUnit.Name},{question:'Tell me about '+uniqueUnit.Name});assert.equal(byName.status,200,byName.message);assert.equal(byName.data.focusCode,uniqueUnit.UnitCode);assert.match(byName.answer,/Recorded requisite conditions/);assert.equal(byName.responseStyle,'conversational');
    const pronoun=await call('inspect_unit',{},{question:'is it offered?',suggestionContext:{unitCode:uniqueUnit.UnitCode}});assert.equal(pronoun.data.focusCode,uniqueUnit.UnitCode);
    const missingUnit=await call('inspect_unit',{code:'ZZZ99999'},{question:'Tell me about ZZZ99999'});assert.equal(missingUnit.data.needsSelection,true);assert(!missingUnit.data.focusCode);
    let result=await call('compare_planners',{plannerA:String(a.id),plannerB:String(b.id)});assert.equal(result.status,200);assert(result.data.diff);
    const fromWorkspace=await request('/api/planner-assistant',{question:'compare these',workflow:'compare',workspaceContext:{workflow:'compare',plannerA:String(a.id),plannerB:String(b.id)},enableTools:true});assert(fromWorkspace.toolResult.data.diff);assert.equal(fromWorkspace.toolResult.data.plannerA.id,a.id);assert.equal(fromWorkspace.toolResult.data.plannerB.id,b.id);
    assert.equal((await call('compare_planners',{plannerA:String(a.id),plannerB:String(a.id)})).status,400);
    assert.equal((await call('compare_planners',{plannerA:'missing',plannerB:String(b.id)})).workflow,'compare');
    assert.equal((await call('inspect_planner',{planner:String(a.id)})).data.id,a.id);
    assert.equal((await call('list_templates')).workflow,'templates');
    assert.equal((await call('check_double_major')).workflow,'double-major');
    assert.equal((await call('suggest_next_semester')).workflow,'suggestions');
    assert.equal((await call('delete_planner',{id:a.id})).status,400);
    assert.equal((await call('save_planner',{name:'unreviewed',units:[]})).status,400);

    const savedArgs={name:'Tool regression planner',units:[{unitId:catalog.units[0].ID,unitTypeId:catalog.types[0].ID}],plannerTemplateId:null,confirmed:true,requestId:'planner-test-save-1'};
    const saved=await call('save_planner',savedArgs);assert.equal(saved.status,200,saved.message);
    assert.deepEqual((await call('save_planner',savedArgs)).data,saved.data,'Retried saves must return the same record');
    assert.equal((await call('save_planner',{...savedArgs,name:'changed payload'})).status,400);
    const detail=(await call('inspect_planner',{planner:String(saved.data.id)})).data;
    const edits={id:detail.id,units:detail.units.map(u=>({joinId:u.joinId,unitTypeId:catalog.types.at(-1).ID})),plannerTemplateId:null,expectedVersion:JSON.stringify({templateId:detail.plannerTemplateId,units:detail.units.map(u=>[u.joinId,u.unitTypeId])}),confirmed:true,requestId:'planner-test-edit-1'};
    assert.equal((await call('update_planner',edits)).status,200);
    if(catalog.types.at(-1).ID!==catalog.types[0].ID)assert.equal((await call('update_planner',{...edits,requestId:'planner-test-stale-1'})).status,400);
    // A foreign row cannot be changed by the reused management endpoint.
    const other=(await call('inspect_planner',{planner:String(a.id)})).data;
    if(other.units.length){
      const response=await fetch(`${base}/api/study-planner/${detail.id}`,{method:'PUT',headers:{'Content-Type':'application/json','x-dev-override':'true'},body:JSON.stringify({units:[{joinId:other.units[0].joinId,unitTypeId:catalog.types[0].ID}],plannerTemplateId:null})});
      assert.equal(response.status,400);
    }
    const templateArgs={name:'Tool regression template',requirements:{[catalog.types[0].Name]:2},confirmed:true,requestId:'template-test-save-1'};
    const template=await call('save_template',templateArgs);assert.equal(template.status,200,template.message);
    assert.equal((await call('save_template',templateArgs)).data.id,template.data.id);
    assert.equal((await call('update_template',{...templateArgs,id:template.data.id,expectedVersion:'stale',requestId:'template-test-stale-1'})).status,400);
    const refreshed=await request('/api/planner-assistant/tools');
    const templateEdit={...templateArgs,id:template.data.id,expectedVersion:refreshed.templates.find(t=>t.id===template.data.id).updatedAt,requirements:{[catalog.types[0].Name]:3},requestId:'template-test-edit-1'};
    assert.equal((await call('update_template',templateEdit)).status,200);
    assert.equal((await call('save_template',{...templateArgs,requestId:'template-test-duplicate-1'})).status,400);
    const majorPlanners=catalog.planners.filter(p=>p.units.some(u=>u.unitType?.Name?.trim().toLowerCase()==='major'));
    if(majorPlanners.length>1){
      const first=majorPlanners[0],codes=p=>p.units.filter(u=>u.unitType?.Name?.trim().toLowerCase()==='major').map(u=>u.UnitCode).sort().join(',');
      const second=majorPlanners.find(p=>codes(p)!==codes(first));
      if(second){
        const passed=first.units.find(u=>u.unitType?.Name?.trim().toLowerCase()==='major'&&u.CreditPoints>0);
        if(passed){
          const rows=[['Course','Status','Earned','Grade'],[passed.UnitCode,'Complete',passed.CreditPoints,'EXM']];
          const dpaSummary=await request('/api/planner-assistant',{question:'Explain my DPA',enableTools:true,toolCall:{name:'explain_dpa',arguments:{}},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});assert.equal(dpaSummary.toolResult.tool,'explain_dpa');assert.match(dpaSummary.answer,/Completed \/ exempted entries/);assert.match(dpaSummary.answer,/exempted/);
          const withFailure=[...rows,['ZZZ99999','Complete',12.5,'N']];const failedSummary=await call('explain_dpa',{},{document:{name:'failure.xlsx',rows:withFailure,text:withFailure.map(r=>r.join('\t')).join('\n')}});assert.match(failedSummary.answer,/ZZZ99999:.*Failed grade/);assert.match(failedSummary.answer,/1 completed units/);
          const pathway=await request('/api/double-major-pathway',{document:{name:'synthetic.xlsx',rows:withFailure,text:withFailure.map(r=>r.join('\t')).join('\n')},term:'Semester 1',year:2027});assert.equal(pathway.status,200,pathway.message);assert.notEqual(pathway.data.primary.id,pathway.data.secondary.id);assert.equal(pathway.data.coverage.majors.length,2);assert(pathway.data.semesters.every(s=>s.selected.length<=4&&s.credits<=50));assert(pathway.data.transcript.excluded.some(u=>u.code==='ZZZ99999'));assert(!pathway.data.semesters.flatMap(s=>s.selected).some(u=>u.code===passed.UnitCode));
          const simple=await call('suggest_next_semester',{term:'Semester 1'},{document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(simple.status,200,simple.message);assert(simple.data.plan.selected.length<=4);assert(simple.data.plan.credits<=50);
          assert(!simple.data.plan.selected.some(u=>u.code===passed.UnitCode));assert(simple.data.planner);
          const finishStudies=await request('/api/planner-assistant',{question:'what i need to take next to complete studies',enableTools:true,document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(finishStudies.status,200,finishStudies.message);assert.equal(finishStudies.toolResult.tool,'plan_remaining_studies');assert(finishStudies.toolResult.data.pathway);assert(finishStudies.toolResult.data.completionAudit.categories.length);assert.match(finishStudies.answer,/Remaining requirements against this planner/);
          const matches=await request('/api/planner-assistant',{question:'highest match planner for this dpa',enableTools:true,suggestionContext:{targetMajor:'AI',planner:String(first.id),plannerConfirmed:true},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(matches.status,200,matches.message);assert.equal(matches.toolResult.tool,'match_dpa_planners');assert.match(matches.answer,/Highest-matching planner/);assert.equal(matches.toolResult.data.targetMajor,null);
          const {rankPlannerMatches}=await import('../src/app/libs/plannerMatching.mjs');
          const currentCatalog=await request('/api/planner-assistant/tools');
          const expectedMatches=rankPlannerMatches(currentCatalog.planners,[{code:passed.UnitCode}]);
          assert.deepEqual(matches.toolResult.data.ranking.map(r=>[r.id,r.matched]),expectedMatches.map(r=>[r.planner.id,r.matched]));
          assert.equal(simple.data.planner.id,expectedMatches[0].planner.id,'Default suggestions must use the same ranking as Unit Suggestions');
          const fullPathway=await request('/api/planner-assistant',{question:'Plan until I finish',enableTools:true,suggestionContext:{planner:String(first.id),plannerConfirmed:true},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(fullPathway.status,200,fullPathway.message);assert.equal(fullPathway.toolResult.tool,'plan_remaining_studies');assert(fullPathway.toolResult.data.pathway);assert(fullPathway.toolResult.data.pathway.semesters.every(s=>s.selected.length<=4&&s.credits<=50));assert(!fullPathway.answer.includes('\\n'));
          const lighter=await request('/api/planner-assistant',{question:'Only two units next semester',enableTools:true,suggestionContext:{planner:String(first.id),plannerConfirmed:true},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(lighter.status,200,lighter.message);assert.equal(lighter.toolResult.data.preferences.maxUnits,2);assert(lighter.toolResult.data.plan.selected.length<=2);
          const adjustableCore=lighter.toolResult.data.plan.candidates.find(u=>/core/i.test(u.category));
          if(adjustableCore){
            const ctx={planner:String(first.id),plannerConfirmed:true,preferences:{maxUnits:2,maxCredits:25,excluded:[],deferred:{}}},doc={name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')};
            const omission=await request('/api/planner-assistant',{question:"Why wasn't "+adjustableCore.code+' suggested?',enableTools:true,planningOnly:true,workflow:'suggestions',suggestionContext:ctx,document:doc});assert.equal(omission.toolResult.tool,'explain_next_semester');assert.equal(omission.toolResult.data.preferences.maxUnits,2);assert.equal(omission.toolResult.data.focusCode,adjustableCore.code);
            const exclusion=await request('/api/planner-assistant',{question:'Skip '+adjustableCore.code+' unit',enableTools:true,planningOnly:true,suggestionContext:ctx,document:doc});assert.match(exclusion.answer,/cannot remove it as an elective/);
            const deferral=await request('/api/planner-assistant',{question:'Move '+adjustableCore.code+' to Semester 2',enableTools:true,planningOnly:true,suggestionContext:{...ctx,term:'Semester 1'},document:doc});assert.equal(deferral.toolResult.data.preferences.deferred[adjustableCore.code],'Semester 2');assert.equal(deferral.toolResult.data.preferences.maxUnits,2);
          }
          const changed=await request('/api/planner-assistant',{question:'Recheck my saved planner with updated DPA',enableTools:true,toolCall:{name:'suggest_next_semester',arguments:{planner:String(first.id)}},suggestionContext:{savedDraft:{units:[{code:passed.UnitCode}]}},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});assert.match(changed.answer,/Changes from saved draft/);assert(changed.answer.includes(passed.UnitCode));
          const explicitPlanner=await call('suggest_next_semester',{planner:String(first.id),term:'Semester 1'},{document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(explicitPlanner.data.planner.id,first.id);assert.equal(explicitPlanner.data.plannerConfirmed,true);
          const keptPlanner=await request('/api/planner-assistant',{question:'suggest next semester units',enableTools:true,suggestionContext:{planner:String(first.id),plannerName:first.name,plannerConfirmed:true},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(keptPlanner.toolResult.data.planner.id,first.id,'Later suggestions must retain an explicitly confirmed planner');
          const pdfRecheck=await request('/api/planner-assistant',{question:'Recheck suggestions for '+first.name+' and prepare a planner PDF.',enableTools:true,toolCall:{name:'suggest_next_semester',arguments:{planner:String(first.id),term:'Semester 1'}},suggestionContext:{targetMajor:'AI'},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(pdfRecheck.status,200,pdfRecheck.message);assert.equal(pdfRecheck.toolResult.data.planner.id,first.id,'Rechecking a PDF planner must not inherit an unrelated destination major');
          const prompted=await request('/api/planner-assistant',{question:'suggest next semester units',enableTools:true,document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(prompted.status,200,prompted.message);assert.equal(prompted.toolResult.tool,'suggest_next_semester');assert.equal(prompted.toolResult.responseStyle,'conversational');assert(prompted.toolResult.verificationNotes.length);assert(prompted.answer.includes(prompted.toolResult.data.plan.credits+' CP')); 
          const paraphrase=await request('/api/planner-assistant',{question:'Help me pick subjects for the coming term',enableTools:true});assert.equal(paraphrase.toolResult.tool,'suggest_next_semester');
          const definition=await request('/api/planner-assistant',{question:'What is a double major?',enableTools:true});assert.equal(definition.source,'guide');assert(!definition.toolResult);
          const awaitingDpa=await request('/api/planner-assistant',{question:'i want to shift to ai major what should i take next semester',enableTools:true});
          assert.equal(awaitingDpa.toolResult.data.targetMajor,'AI');assert.match(awaitingDpa.answer,/Artificial Intelligence planners/);
          const target=await request('/api/planner-assistant',{question:'i want to shift to ai major what is the best plannre to follow and what to take next semester',enableTools:true,document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(target.status,200,target.message);assert.match(target.toolResult.data.planner.name,/CSAI|artificial intelligence/i);
          assert.match(target.answer,/move to Artificial Intelligence/);assert.equal(target.toolResult.data.targetMajor,'AI');
          assert(target.toolResult.data.choices.every(p=>/CSAI|artificial intelligence/i.test(p.name)));
          const followup=await request('/api/planner-assistant',{question:'suggest next semester units',enableTools:true,suggestionContext:{targetMajor:'AI'},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.match(followup.toolResult.data.planner.name,/CSAI|artificial intelligence/i);
          const correction=await request('/api/planner-assistant',{question:'not AI, data science instead',workflow:'suggestions',enableTools:true,suggestionContext:{targetMajor:'AI'},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});assert.equal(correction.toolResult.data.targetMajor,'DS');
          const explanation=await request('/api/planner-assistant',{question:'Why did you pick these?',workflow:'suggestions',enableTools:true,suggestionContext:{targetMajor:'AI',planner:String(target.toolResult.data.planner.id),term:target.toolResult.data.term},document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(explanation.toolResult.tool,'explain_next_semester');assert.match(explanation.answer,/Rechecked against/);assert.equal(explanation.toolResult.data.planner.id,target.toolResult.data.planner.id);
          const context={targetMajor:'AI',planner:String(target.toolResult.data.planner.id),term:target.toolResult.data.term};
          const checkEarned=await call('explain_next_semester',{code:passed.UnitCode},{document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')},question:'can I take '+passed.UnitCode,suggestionContext:context});assert.equal(checkEarned.status,200,checkEarned.message);assert.equal(checkEarned.data.focusCode,passed.UnitCode);assert(!checkEarned.data.plan.selected.some(u=>u.code===passed.UnitCode));assert.match(checkEarned.answer,/already has sufficient|outside this planner/);
          const unavailable=await call('suggest_next_semester',{targetMajor:'unavailable robotics major'},{document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.match(unavailable.answer,/No planner records match/);assert.equal(unavailable.data,null);
          let majorResult=await call('check_double_major',{},{document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')}});
          assert.equal(majorResult.status,200,majorResult.message);assert(majorResult.data.coverage);assert(majorResult.data.secondary);assert(!/Confirm your actual primary/.test(majorResult.answer));assert(majorResult.data.options||majorResult.data.choices);
          const matchingPage=await request('/api/double-major-pathway',{document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')},term:majorResult.data.term,year:majorResult.data.year});assert.equal(matchingPage.status,200,matchingPage.message);assert.deepEqual(majorResult.data.primary,matchingPage.data.primary);assert.deepEqual(majorResult.data.secondary,matchingPage.data.secondary);assert.deepEqual(majorResult.data.coverage,matchingPage.data.coverage);assert.deepEqual(majorResult.data.pathway.semesters,matchingPage.data.semesters,'Chat and checker must share the same pathway');
          if(majorResult.data.choices){majorResult=await call('check_double_major',{primaryPlanner:String(majorResult.data.choices[0].id)},{document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')},planningContext:{dpaConfirmed:true,corrections:[]}});assert.equal(majorResult.status,200,majorResult.message);assert(majorResult.data.coverage);assert(majorResult.data.pathway);}
          const corrected=await call('check_double_major',{primaryPlanner:String(second.id)},{document:{name:'synthetic.xlsx',rows,text:rows.map(r=>r.join('\t')).join('\n')},planningContext:{dpaConfirmed:true,corrections:[]}});
          assert.equal(corrected.status,200,corrected.message);assert.equal(corrected.data.primary.id,second.id,'A student can confirm a programme beyond the highest overlap matches');
          assert(corrected.data.pathway.secondaryRanking.length);assert(corrected.data.pathway.secondaryRanking.every(p=>p.id!==second.id),'Second-major choices must be distinct from the primary planner');
        }
      }
    }
    const generated=await request('/api/planner-assistant',{question:'Which planner templates are available?',enableTools:true});assert.equal(generated.source,'tool');assert.equal(generated.toolResult.tool,'list_templates');
    const forbidden=await request('/api/planner-assistant',{question:'Try an unauthorised action',enableTools:true});assert.match(forbidden.answer,/unable to answer/i);
    const natural=await request('/api/planner-assistant',{question:`differentiate planner ID ${a.id} vs ID ${b.id}`,enableTools:true});assert(natural.toolResult.data.diff);
    console.log('Planner tool validation, real API reuse, selection, authentication, reviewed saves, retries, stale edits and model-call checks passed.');
  }catch(e){console.error('Standalone server exit:',server.exitCode,'signal:',server.signalCode,'output:',output.slice(-5000));throw e;}finally{server.kill();await new Promise(resolve=>ai.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
