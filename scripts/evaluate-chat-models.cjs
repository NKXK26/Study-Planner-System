// Synthetic conversations only. Does not change the configured model or download models.
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const {interpretPlannerRequest}=await import('../src/app/libs/plannerRequest.mjs');
  const {composeToolReply}=await import('../src/app/libs/plannerResponse.mjs');
  const url=process.env.OLLAMA_URL||'http://127.0.0.1:11434';
  const installed=(await (await fetch(url+'/api/tags',{signal:AbortSignal.timeout(3000)})).json()).models.map(m=>m.name);
  const flag=process.argv.find(a=>a.startsWith('--models='));
  const models=flag?flag.slice(9).split(','):installed;
  if(models.some(m=>!installed.includes(m)))throw Error('Use installed model names only: '+installed.join(', '));
  const cases=[
    {question:'idk what subjects to pick next term',expected:'suggest_next_semester'},
    {question:'I want to switch from AI to data science, what should I take?',expected:'suggest_next_semester',major:'DS'},
    {question:'why those?',workflow:'suggestions',suggestionContext:{targetMajor:'AI',planner:'12',term:'Semester 1'},expected:'explain_next_semester'},
    {question:'compare these',workflow:'compare',workspaceContext:{workflow:'compare',plannerA:'12',plannerB:'18'},expected:'compare_planners',selection:true},
    {question:'can I take cloud computing instead?',workflow:'suggestions',suggestionContext:{planner:'12'},expected:'explain_next_semester'},
    {question:'What is a double major?',expected:'answer'},
    {question:'AI or data science, which planner should I follow?',expected:'clarify'},
  ];
  const responseCases=[
    {question:'why did you pick these?',result:{tool:'explain_next_semester',workflow:'suggestions',answer:'COS20019 Cloud Computing Architecture: unfinished; Semester 1 offering recorded. Prerequisites satisfied in current DPA.\n\nProvisional draft.',data:{plan:{warnings:['Provisional draft.']}}}},
    {question:'explain my DPA please',result:{tool:'explain_dpa',answer:'COS10001: 12.5 earned CP. COS40005: failed grade N, not counted. AE1: 12.5 earned CP (EXM).',data:{documentName:'synthetic.xlsx'}}},
  ];
  const report={date:new Date().toISOString(),scope:'Small synthetic regression sample; not a human usability or safety certification. Cold model loading is included in latency.',configuredModel:process.env.OLLAMA_MODEL,models:[]};
  for(const model of models){
    const rows=[];
    for(const test of cases){
      const start=Date.now();const result=await interpretPlannerRequest(test,{model,timeoutMs:30000});
      const actual=result.kind==='tool'?result.call.name:result.kind;
      const correct=actual===test.expected&&(!test.major||result.call?.arguments.targetMajor===test.major)&&(!test.selection||(result.call?.arguments.plannerA==='12'&&result.call?.arguments.plannerB==='18'));
      rows.push({question:test.question,expected:test.expected,actual,correct,source:result.source,arguments:result.call?.arguments,ms:Date.now()-start});
      console.log(model,actual,correct?'PASS':'FAIL',result.source);
    }
    const replies=[];
    for(const test of responseCases){const start=Date.now();const result=await composeToolReply(test.result,{question:test.question},{model,timeoutMs:30000});replies.push({question:test.question,style:result.responseStyle,factsPreserved:result.verifiedAnswer===test.result.answer,answer:result.answer,ms:Date.now()-start});}
    report.models.push({model,routingCorrect:rows.filter(r=>r.correct).length,modelRoutingCorrect:rows.filter(r=>r.correct&&r.source==='model').length,total:rows.length,conversationalReplies:replies.filter(r=>r.style==='conversational').length,rows,replies});
  }
  const output=path.resolve('docs/evaluations');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'chat-model-comparison.json'),JSON.stringify(report,null,2)+'\n');
  const md=['# Local chatbot model comparison','',report.scope,'','Configured model remains `'+report.configuredModel+'`. No model was downloaded or configuration changed.','','| Model | Correct routes (including fallback) | Correct routes from model | Conversational replies | Average routing latency |','| --- | --- | --- | --- | --- |',...report.models.map(m=>'| '+m.model+' | '+m.routingCorrect+'/'+m.total+' | '+m.modelRoutingCorrect+'/'+m.total+' | '+m.conversationalReplies+'/2 | '+Math.round(m.rows.reduce((n,r)=>n+r.ms,0)/m.total)+' ms |'),'','Detailed prompts, decisions, fallback use and responses are in `chat-model-comparison.json`. Review prose quality manually; the automated checks measure routing and preservation of the original facts, not naturalness.','','Rerun: `node --env-file=.env scripts/evaluate-chat-models.cjs --models=llama3.2:3b,qwen2.5-coder:7b`',''];
  fs.writeFileSync(path.join(output,'chat-model-comparison.md'),md.join('\n'));
  console.log('Report written to docs/evaluations/chat-model-comparison.md');
})().catch(e=>{console.error(e);process.exitCode=1;});
