const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const {reviewedChatDocument,explainSemesterDraft}=await import('../src/app/libs/reviewedChat.mjs');
  let planningCalls=0;
  const generateReviewedPlan=async req=>{planningCalls++;const body=await req.json();return {ok:true,status:200,json:async()=>({success:true,programme:'Confirmed course',plannerName:'Confirmed planner',year:body.year,term:body.term,maxUnits:body.maxUnits,maxCredits:body.maxCredits,plan:{selected:[],candidates:[],credits:0,warnings:['Provisional']}})};};
  const answerability=await import('../src/app/libs/plannerAnswerability.mjs');
  const knowledge = await import('../src/app/libs/plannerKnowledge.mjs');
  const dpa = await import('../src/app/libs/chatDpa.mjs');
  const checker = await import('../src/app/libs/doubleMajorChecker.mjs');
  const { replacementCandidates } = await import('../src/app/libs/unitReplacement.mjs');
  assert.equal(knowledge.retrievePlannerKnowledge('can i do 2 majors')[0].id, 'double-major');
  assert.equal(knowledge.retrievePlannerKnowledge('dual major pls')[0].id, 'double-major');
  assert(knowledge.retrievePlannerKnowledge('reccomend what i take next semester').some(d => d.id === 'transcript'));
  assert.equal(knowledge.normalizePlannerPrompt('COS 20031 pre-req'), 'cos20031 prerequisite');
  assert.throws(() => dpa.validateDocument({ name: 'a', text: 'x'.repeat(60001) }));
  assert.throws(() => dpa.validateDocument({ name: 'a', text: 'x', rows: [{}] }));
  const document = { name: 'DPA.pdf', text: 'Course\tStatus\tEarned\tGrade\nCOS10001\tComplete\t12.5\tHD\nCOS10001\tComplete\t12.5\tHD\nCOS10002\tFuture\t0\t\nCOS10003\tComplete\t12.5\tN' };
  const evidence = dpa.documentEvidence(document);
  assert.equal(evidence.transcript.completed.length, 1);
  assert.equal(evidence.transcript.excluded.length, 2);
  assert.equal(evidence.transcript.duplicates, 1);
  const gradeRows = [['Course', 'Status', 'Earned', 'Grade'], ['COS40005', 'Complete', 12.5, 'N'], ['AE1', 'Complete', 12.5, 'EXM'], ['AE2', '', 12.5, ' exm '], ['AE3', 'EXM', 12.5, ''], ['COS10002', 'Current', 0, ''], ['COS10003', 'Complete', 0, 'EXM']];
  const gradeEvidence = dpa.documentEvidence({ name: 'DPA.xlsx', rows: gradeRows, text: gradeRows.map(row => row.join('\t')).join('\n') });
  assert.deepEqual(gradeEvidence.transcript.completed.map(u => u.code), ['AE1', 'AE2', 'AE3']);
  assert.match(gradeEvidence.transcript.excluded.find(u => u.code === 'COS40005').reason, /Failed grade/);
  assert.equal(dpa.documentEvidence({ name: 'DPA.pdf', text: 'I might take COS10001 for 12.5 credits' }).transcript, null);

  // Run the actual route with controlled database, authentication and AI failures.
  const source = fs.readFileSync('src/app/api/planner-assistant/route.js', 'utf8').trimStart().replace(/^import .*;\r?\n/gm, '').replace(/export async function/g, 'async function');
  const unit = code => ({ UnitCode: code, Name: code, CreditPoints: 12.5, unitType: { Name: 'Major' } });
  const planner = (id, name, code) => ({ id, name, studyPlannerUnits: [unit('COS10001'), unit(code)].map(u => ({ unit: u, unitType: u.unitType })) });
  const prisma = { unit: { findMany: async () => [] }, studyPlanner: { findMany: async () => [planner(1, 'A', 'COS10002'), planner(2, 'B', 'COS10003')] } };
  const NextResponse = { json: (data, options) => ({ data, status: options?.status || 200 }) };
  const route = new Function('questionBoundary','generalEvidenceReply','refusal','prisma', 'SecureSessionManager', 'NextResponse', 'retrievePlannerKnowledge', 'normalizePlannerPrompt', 'documentEvidence', 'validateDocument', 'assessDpaDoubleMajor', 'normalizeCode', 'replacementCandidates', 'reviewedChatDocument', 'explainSemesterDraft', 'generateReviewedPlan', 'checkDoubleMajor', 'fetch', source + '\nreturn POST;')(
    answerability.questionBoundary,answerability.generalEvidenceReply,answerability.refusal,prisma, { authenticateUser: async req => req.authorized !== false }, NextResponse, knowledge.retrievePlannerKnowledge, knowledge.normalizePlannerPrompt, dpa.documentEvidence, dpa.validateDocument, checker.assessDpaDoubleMajor, checker.normalizeCode, replacementCandidates, reviewedChatDocument, explainSemesterDraft, generateReviewedPlan, checker.checkDoubleMajor, async () => { throw new Error('Model offline'); }
  );
  const request = body => ({ headers: new Headers(), json: async () => body });
  let result = await route(request({ question: 'explain this', document }));
  assert.equal(result.status, 200);
  assert.equal(result.data.source, 'guide');
  assert.equal(result.data.plannerChoices.length, 0);
  assert.match(result.data.answer, /1 completed units/);
  result = await route(request({ question: 'compare', document, primaryPlannerId: 1 }));
  assert.match(result.data.answer, /Second-major comparisons/);
  assert.match(result.data.answer, /COS10003/);
  result = await route(request({ question: 'can i do a dual major' }));
  assert.match(result.data.answer, /upload control in this chat/);
  assert.equal((await route({ ...request({ question: 'hello' }), authorized: false })).status, 401);
  assert.equal((await route(request({ question: '' }))).status, 400);
  assert.equal((await route(request({ question: 'hi', document: { text: 'bad' } }))).status, 400);
  const context={corrections:[{row:4,status:'Complete',grade:'EXM',earned:12.5,reason:'Verified exemption'}],dpaConfirmed:true,programmeConfirmed:true,intakeId:1,plannerId:2,year:2027,term:'Semester 1',maxUnits:2,maxCredits:25};
  result=await route(request({question:'How many units have I completed?',document,planningContext:context}));
  assert.match(result.data.answer,/2 completed units/);
  result=await route(request({question:'Why these units next semester?',document,planningContext:context}));
  assert.match(result.data.answer,/Confirmed planner/);assert.equal(planningCalls,1);assert.doesNotMatch(result.data.answer,/Use the .*card/);
  result=await route(request({question:'Can I do a double major?',document,planningContext:context}));
  assert.match(result.data.answer,/Using your confirmed planner: B/);
  result=await route(request({question:'How many completed?',document,planningContext:{...context,dpaConfirmed:false}}));assert.equal(result.status,400);
  prisma.studyPlanner.findMany = async () => { throw new Error('Database offline'); };
  result = await route(request({ question: 'explain', document }));
  assert.doesNotMatch(result.data.answer, /database is unavailable/);
  assert.match(result.data.answer, /1 completed units/);
  prisma.unit.findMany = async () => [{ ID: 7, UnitCode: 'COS20031', Name: 'Computing Project', CreditPoints: 12.5, Availability: 'Published', UnitTermOffered: [] }];
  prisma.unitRequisiteRelationship = { findMany: async () => [{ UnitID: 7, UnitRelationship: 'pre', LogicalOperators: 'AND', MinCP: 50, Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: { UnitCode: 'COS10001' } }] };
  result = await route(request({ question: 'pre-req for COS 20031' }));
  assert.match(result.data.answer, /COS10001/);
  assert.match(result.data.answer, /50 minimum CP/);
  result = await route(request({ question: 'replacement for COS20031' }));
  assert.match(result.data.answer, /not approved equivalence/);
  const uploadSource = fs.readFileSync('src/app/api/planner-assistant/document/route.js', 'utf8').trimStart().replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const upload = new Function('SecureSessionManager', 'NextResponse', 'MAX_DOCUMENT_TEXT', uploadSource + '\nreturn POST;')({ authenticateUser: async () => true }, NextResponse, dpa.MAX_DOCUMENT_TEXT);
  assert.equal((await upload(request({ name: 'fake.pdf', base64: Buffer.from('not pdf').toString('base64') }))).status, 400);
  // Small real PDF, built in memory so extraction is checked without student data.
  const stream = 'BT /F1 12 Tf 50 750 Td (DPA progress: COS10001 completed with 12.5 earned credits.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const uploaded = await upload(request({ name: 'DPA.pdf', base64: Buffer.from(pdf).toString('base64') }));
  assert.equal(uploaded.status, 200, uploaded.data.message);
  assert.match(uploaded.data.document.text, /COS10001/);
  if (process.env.CHAT_TEST_URL) {
    const response = await fetch(`${process.env.CHAT_TEST_URL}/api/planner-assistant/document`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-override': 'true' }, body: JSON.stringify({ name: 'DPA.pdf', base64: Buffer.from(pdf).toString('base64') }) });
    const data = await response.json();
    assert.equal(response.status, 200, data.message);
    assert.match(data.document.text, /COS10001/);
    const chat = await fetch(`${process.env.CHAT_TEST_URL}/api/planner-assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-override': 'true' }, body: JSON.stringify({ question: 'can i do 2 majors' }) });
    assert.equal(chat.status, 200);
    assert.match((await chat.json()).answer, /upload control in this chat/);
    console.log('Built HTTP document and chat routes passed.');
  }
  console.log('Chat attachment, prompt tolerance, authentication, ambiguity and outage tests passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });

