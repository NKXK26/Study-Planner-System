const assert=require('node:assert/strict');
(async()=>{
 const {retrievePlannerKnowledge,plannerKnowledge}=await import('../src/app/libs/plannerKnowledge.mjs');
 assert.equal(retrievePlannerKnowledge('Where can I check my double major?')[0].id,'double-major');
 assert.equal(retrievePlannerKnowledge('Find a replacement expired unit')[0].id,'replacement');
 assert.equal(retrievePlannerKnowledge('Where do I upload my transcript?')[0].id,'transcript');
 assert.equal(retrievePlannerKnowledge('write a recipe').length,0);
 assert(plannerKnowledge.every(d=>d.href.startsWith('/view/')&&!d.href.includes('://')));
 console.log('Planner retrieval and navigation tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
