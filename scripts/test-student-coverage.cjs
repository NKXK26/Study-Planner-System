const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const ts = require('typescript');

(async()=>{
  const {plannerCoverage, transcriptIdentity} = await import('../src/app/libs/studentCatalogueCoverage.mjs');
  const enrolment={courseCode:'Bachelor of Computer Science',intakeYear:2026,intakeMonth:9,major:'CSAI',confirmed:true};
  const exact={...enrolment,name:'26-Sep-CSAI',courseCode:'BA-CS',major:'Artificial Intelligence',id:4,status:'Published',units:[]};
  const published=[{...exact,id:2,intakeMonth:3,units:[{UnitCode:'COS10003'}]},exact,
    {...exact,id:5,major:'Data Science',status:'Draft'}];
  const state=overrides=>plannerCoverage(published,{...enrolment,...overrides}).state;
  assert.equal(plannerCoverage(published,enrolment).planner.id,4);
  assert.equal(state({major:'ai',courseCode:'BCS'}),'exact');
  for(const difference of [{intakeYear:2022},{intakeYear:2025},{intakeMonth:2},{major:'DS'},{courseCode:'BA-BUS'},{major:'CSSD'}])
    assert.equal(state(difference),'review');
  for(const missing of [{courseCode:''},{major:''},{intakeMonth:null},{intakeYear:''},{confirmed:false}])
    assert.equal(state(missing),'confirm');
  const inferred=transcriptIdentity([{Course:'COS10003',Term:'2026_SEP_S2'}],{year:2026,month:9,isTeaching:true});
  assert.equal(inferred.courseCode,'');
  assert.equal(inferred.major,'');
  assert.equal(plannerCoverage(published,{...enrolment,...inferred}).state,'confirm');
  assert.equal(plannerCoverage(published,{...inferred,courseCode:'BA-CS',major:'AI'}).state,'confirm');
  assert.equal(transcriptIdentity([{Programme:'BCS',Major:'CSDS'}]).major,'Data Science');
  assert.equal(plannerCoverage([...published,{...exact,id:6}],enrolment).state,'review');
  assert.equal(plannerCoverage([...published,{...published[2],status:'Published'}],{...enrolment,major:'DS'}).state,'exact');

  // Invoke the route handler with a real Request. A local database read would fail this test.
  const route=resolve('src/app/api/study-planner/validate-schedule/route.js');
  const source=ts.transpileModule(readFileSync(route,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const portEnv={APP_EDITION:'student-web'};
  const access=await import('../src/app/libs/studentPortalAccess.mjs');
  let outage=false;
  const imports={
    '@app/libs/officialCatalogue.mjs':{publishedPlanningPool:async()=>{if(outage)throw Error('private diagnostics');return published;}},
    '@utils/db/db':{},'@utils/auth/SimpleSessionManager':{},
    '@app/libs/studentPortalAccess.mjs':{isStudentPortalRequest:req=>access.isStudentPortalRequest(req,portEnv)},
    '@app/view/unit_suggestion/plannerHelpers':await import('../src/app/view/unit_suggestion/plannerHelpers.js'),
  };
  const mod={exports:{}};
  new Function('require','module','exports',source)(id=>imports[id]||require(id.startsWith('@app/')?resolve('src/app',id.slice(5)):id),mod,mod.exports);
  const call=body=>mod.exports.POST(new Request('http://localhost/api/study-planner/validate-schedule',{
    method:'POST',headers:{'x-student-portal':'1'},body:JSON.stringify({schedule:[],...body})}));
  process.env.PLANNER_CATALOGUE_URL='http://127.0.0.1:1/catalogue';
  assert.equal((await call({plannerId:4})).status,422);
  for(const revision of [null,2,5]) assert.equal((await call({plannerRevisionId:revision,enrolment})).status,409);
  assert.equal((await call({plannerRevisionId:4,plannerId:2,enrolment})).status,409);
  assert.equal((await call({plannerRevisionId:4,enrolment:{...enrolment,major:'DS'}})).status,409);
  const valid=await call({plannerRevisionId:4,enrolment});
  assert.equal(valid.status,200);
  assert.equal((await valid.json()).valid,true);
  outage=true;
  const unavailable=await call({plannerRevisionId:4,enrolment});
  assert.equal(unavailable.status,503);
  assert.doesNotMatch(await unavailable.text(),/HOD|private diagnostics/);
  delete process.env.PLANNER_CATALOGUE_URL;
  assert.equal((await call({plannerId:4,enrolment})).status,503);

  // Exercise the form, retry and downstream render gate with the real JSX and a local catalogue double.
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const guard=ts.transpileModule(readFileSync(resolve('src/components/StudentCatalogueGuard.jsx'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}
  }).outputText;
  const slots=[];
  let cursor=0,effect,retryDependency,payload;
  const hooks={
    ...React,
    useState(initial){
      const index=cursor++;
      if(!(index in slots)) slots[index]=typeof initial==='function'?initial():initial;
      return [slots[index],v=>{slots[index]=typeof v==='function'?v(slots[index]):v;}];
    },
    useMemo:fn=>fn(),
    useEffect(fn,[attempt]){if(attempt!==retryDependency){effect=fn;retryDependency=attempt;}},
  };
  const ui={exports:{}};
  new Function('require','module','exports',guard)(id=>id==='react'?hooks:id==='@utils/auth/FrontendAuthHelper'
    ? {authenticatedFetch:async()=>({ok:!!payload,json:async()=>payload})}
    : id.startsWith('@app/')?require(resolve('src/app',id.slice(5))):require(id),ui,ui.exports);
  function draw(){
    cursor=0;
    return ui.exports.default({initial:{...enrolment,major:'DS'},children:p=>React.createElement('button',null,'Generate '+p.name)});
  }
  function find(tree,test){
    if(!React.isValidElement(tree))return;
    if(test(tree))return tree;
    for(const child of React.Children.toArray(tree.props.children)){const found=find(child,test);if(found)return found;}
  }
  const tick=()=>new Promise(done=>setImmediate(done));
  let tree=draw();
  effect();await tick();
  tree=draw();
  assert.match(renderToStaticMarkup(tree),/temporarily unreachable/);
  assert.doesNotMatch(renderToStaticMarkup(tree),/HOD academic review required|Generate /);
  find(tree,e=>e.props.children==='Retry catalogue').props.onClick();
  payload={success:true,source:'cache',data:published,warning:'Using recent published copy.'};
  draw();effect();await tick();
  tree=draw();
  assert.match(renderToStaticMarkup(tree),/Using recent published copy/);
  assert.doesNotMatch(renderToStaticMarkup(tree),/HOD academic review required|Generate /);
  find(tree,e=>e.type==='form').props.onSubmit({preventDefault(){}});
  tree=draw();
  assert.match(renderToStaticMarkup(tree),/HOD academic review required/);
  assert.match(renderToStaticMarkup(tree),/September 2026, Data Science/);
  find(tree,e=>e.props.list==='enrolment-major').props.onChange({target:{value:'AI'}});
  tree=draw();
  find(tree,e=>e.type==='form').props.onSubmit({preventDefault(){}});
  tree=draw();
  assert.match(renderToStaticMarkup(tree),/Generate 26-Sep-CSAI/);
  find(tree,e=>e.props.list==='enrolment-intakeYear').props.onChange({target:{value:'2022'}});
  assert.doesNotMatch(renderToStaticMarkup(draw()),/Generate /);
  console.log('Student enrolment, exact Published coverage, dynamic publication and direct validation API checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
