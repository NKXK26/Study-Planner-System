const assert=require('node:assert/strict');
const fs=require('node:fs');

(async()=>{
  const access=await import('../src/app/libs/studentPortalAccess.mjs');
  const {adaptPublishedPlanningPool}=await import('../src/app/libs/officialPlannerAdapter.mjs');
  const env={APP_EDITION:'student-web',STUDENT_ACCESS_MODE:'public'};
  assert.equal(access.isStudentWebEdition(env),true);
  assert.equal(access.isPublicStudentAccessEnabled(env),true);
  assert.equal(access.isPublicStudentAccessEnabled({...env,STUDENT_ACCESS_MODE:'authenticated'}),false);
  assert.equal(access.isStudentPortalRequest({headers:new Headers({'x-student-portal':'1'})},env),true);
  assert.deepEqual([...access.studentPages].sort(),['/view/ai-assistant','/view/compare_study_planner','/view/dashboard','/view/graduation-eligibility']);
  assert.deepEqual(access.studentApiMethods.get('/api/auth/student-session'),['POST','DELETE']);
  for(const forbidden of ['/api/auth/admin-password-login','/api/audit_logs','/api/graduation-eligibility','/api/double-major-pathway','/api/planner-assistant/document','/api/user-management']){
    assert.equal(access.studentApiMethods.has(forbidden),false,forbidden+' must not be exposed');
  }

  const planners=adaptPublishedPlanningPool([{id:7,courseCode:'BA-CS',units:[{ID:11,UnitCode:'COS10001',offeredTerms:['Semester 1'],requisites:[{relationship:'pre',logicalOperator:'and',minCredits:null,unit:{ID:10,UnitCode:'COS10000'}}]}]},{id:8,courseCode:'OTHER',units:[]}]);
  assert.equal(planners.length,1);
  assert.deepEqual(planners[0].units[0].UnitTermOffered,[{TermType:'Semester 1',UnitID:11}]);
  assert.equal(planners[0].units[0].UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit[0].RequisiteUnitID,10);

  const middleware=fs.readFileSync('src/middleware.js','utf8');
  assert.match(middleware,/headers\.delete\('x-student-portal'\)/);
  assert.match(middleware,/headers\.delete\('x-dev-override'\)/);
  assert.match(middleware,/Access denied\./);
  assert.match(middleware,/Start a student session first\./);

  const assistant=fs.readFileSync('src/app/api/planner-assistant/route.js','utf8');
  assert.match(assistant,/Attachments are disabled in the public student AI assistant/);
  const graduation=fs.readFileSync('src/components/GraduationEligibilityPanel.jsx','utf8');
  const doubleMajor=fs.readFileSync('src/components/DoubleMajorPanel.jsx','utf8');
  assert.doesNotMatch(graduation,/api\/graduation-eligibility/);
  assert.doesNotMatch(doubleMajor,/api\/double-major-pathway/);
  assert.match(graduation,/api\/official-planners/);
  assert.match(doubleMajor,/api\/official-planners/);

  const chat=fs.readFileSync('src/components/DashboardChat.jsx','utf8');
  assert.match(chat,/attachments are disabled in AI chat/);
  assert.match(chat,/document:studentWebEdition\?null:document/);
  const render=fs.readFileSync('render.yaml','utf8');
  assert.match(render,/name: study-planner-student-staging/);
  assert.match(render,/NEXT_PUBLIC_APP_EDITION[\s\S]*value: student-web/);
  assert.match(render,/DATABASE_URL[\s\S]*file:\/tmp\/student-portal\.db/);
  assert.match(render,/PLANNER_CATALOGUE_TIMEOUT_MS[\s\S]*value: "30000"/);

  console.log('Student web routes, privacy boundary, central planner adapter and staging configuration passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
