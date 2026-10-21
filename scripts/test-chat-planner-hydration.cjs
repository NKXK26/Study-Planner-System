const assert=require('node:assert/strict');
const fs=require('node:fs');
// Execute the component's actual result effect with setter spies.
const source=fs.readFileSync('src/components/ChatPlannerTools.jsx','utf8');
const start=source.indexOf('useEffect(()=>{\n    if(!toolResult?.data)return;');
assert(start>=0);
const end=source.indexOf('},[toolResult]);',start);
assert(end>start);
const body=source.slice(start+'useEffect(()=>{'.length,end);
const apply=new Function('toolResult','setResult','setSuggestionPlanner','autoSuggested','attachmentKey','document','setLeft','setRight','setDetail','setTemplate','setDraft',body);
function hydrate(toolResult){
 const mutations=[];
 const setter=name=>value=>mutations.push([name,value]);
 apply(toolResult,setter('result'),setter('suggestionPlanner'),{current:null},()=>null,null,setter('left'),setter('right'),setter('detail'),setter('template'),setter('draft'));
 return mutations;
}
for(const tool of ['inspect_planner','update_planner'])for(const data of [null,{}, {needsSelection:true,choices:[]},{id:47},{id:47,units:null},{id:47,units:{}}]){
 const changed=hydrate({tool,data});assert(!changed.some(([name])=>['detail','draft','left','template'].includes(name)),'Incomplete responses must preserve previous selections and drafts');
}
for(const answerability of ['refused','clarification'])assert(!hydrate({tool:'inspect_planner',answerability,data:{id:47,units:[]}}).some(([name])=>name==='detail'));
const detail={id:47,plannerTemplateId:2,units:[{ID:5,unitTypeId:3,UnitCode:'COS10001'}]};
const hydrated=hydrate({tool:'inspect_planner',answerability:'verified',data:detail});
assert.equal(hydrated.find(([name])=>name==='left')[1],'47');
assert.deepEqual(hydrated.find(([name])=>name==='draft')[1],[{...detail.units[0],unitId:5}]);
assert.deepEqual(hydrate({tool:'inspect_planner',data:{id:47,units:[]}}).find(([name])=>name==='draft')[1],[],'Empty but valid planner remains supported');
assert(!hydrate({tool:'compare_planners',data:{plannerA:{id:47}}}).some(([name])=>name==='left'),'Partial comparison must not dereference a missing second planner');
console.log('Planner UI hydration passed: missing/ambiguous/refused results preserve drafts, valid and empty planners hydrate, partial comparison is safe.');
