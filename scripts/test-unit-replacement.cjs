const assert = require('node:assert/strict');
(async()=>{
  const { replacementCandidates, compareText } = await import('../src/app/libs/unitReplacement.mjs');
  const source={code:'OLD100',name:'Database Design',creditPoints:12.5};
  const unit=(code,name,status='published',credits=12.5)=>({UnitCode:code,Name:name,Availability:status,CreditPoints:credits,UnitTermOffered:[{TermType:'Semester 1'}]});
  const candidates=replacementCandidates(source,[unit('old100','Database Design'),unit('NEW100','Database Design'),unit('NEW100','Database Design'),unit('NEW200','Database Systems','published',25),unit('OLD200','Database Design','unpublished'),unit('NEW300','Network Security')]);
  assert.equal(candidates.length,2);
  assert.equal(candidates[0].code,'NEW100');
  assert.equal(candidates[0].creditMatch,true);
  assert.equal(candidates[1].creditMatch,false);
  assert.deepEqual(candidates[0].terms,['Semester 1']);
  assert.equal(replacementCandidates({...source,creditPoints:null},[unit('NEW100','Database Design')])[0].creditMatch,null);
  assert.equal(compareText('','').score,0);
  assert.equal(compareText('Database design','Design database').score,100);
  assert.equal(compareText('Database','Networks').score,0);
  console.log('Replacement ranking and evidence tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
