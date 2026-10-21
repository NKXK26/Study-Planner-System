const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const {PDFParse}=require('pdf-parse');
 const {jsPDF}=require('jspdf');
 const {extractUploadedPlanner,signPlannerDocument,readPlannerDocument}=await import('../src/app/libs/uploadedPlanner.server.mjs');
 const {planUploadedDocument}=await import('../src/app/libs/uploadedPlannerPlan.server.mjs');
 const {studyPlanRequest}=await import('../src/app/libs/studyPlanWorkflow.mjs');
 const {pdfRequisite}=await import('../src/app/libs/uploadedPlannerRules.mjs');
 const fixture=new jsPDF({unit:'pt',format:'a4'});fixture.setFontSize(10);
 const colours={Core:[198,217,241],'Test Major':[253,233,217],Elective:[214,227,188]};
 fixture.text('Bachelor of Testing - Newly uploaded planner',30,30);
 let y=65;for(const [name,count]of Object.entries({Core:2,'Test Major':2,Elective:2})){fixture.setFillColor(...colours[name]);fixture.rect(28,y-12,220,30,'F');fixture.text(count+' '+name+' Units',30,y);fixture.text('25 credit points',30,y+12);y+=40;}
 y=220;fixture.text('Unit Code',30,y);fixture.text('Unit Name',115,y);fixture.text('Pre-requisites',240,y);fixture.text('CP',365,y);fixture.text('Offered in',420,y);
 const rows=[['ZZZ10001','First core','Nil','Core'],['ZZZ10002','Second core','ZZZ10001','Core'],['ZZZ20001','First major','ZZZ10001','Test Major'],['ZZZ20002','Second major','ZZZ20001','Test Major'],['ZZZ30001','First option','Nil','Elective'],['ZZZ30002','Second option','Nil','Elective'],['ZZZ30003','Unused option','Nil','Elective']];
 for(const [code,name,rule,cat]of rows){y+=25;fixture.setFillColor(...colours[cat]);fixture.rect(28,y-12,530,24,'F');fixture.text(code,30,y);fixture.text(name,115,y);fixture.text(rule,240,y);fixture.text('12.5',365,y);fixture.text('Semester 1 & 2',420,y);}
 if(process.env.PLANNER_TEST_FIXTURE)await fs.writeFile(process.env.PLANNER_TEST_FIXTURE,Buffer.from(fixture.output('arraybuffer')));
 const parser=new PDFParse({data:new Uint8Array(fixture.output('arraybuffer'))});let data;try{data=await extractUploadedPlanner(parser,'brand-new.pdf');}finally{await parser.destroy();}
 assert.equal(data.units.length,7);assert.equal(data.requirements.length,3);assert.equal(data.units[1].requisite,'ZZZ10001');assert.equal(data.units[1].credits,12.5);assert.equal(data.units[0].name,'First core');
 // A monochrome planner must use explicit categories rather than guessed colour matches.
 const mono=new jsPDF({unit:'pt',format:'a4'});mono.setFontSize(10);let my=40;
 for(const [category,count]of Object.entries({Core:2,'Test Major':2,Elective:2})){mono.text(count+' '+category+' Units',30,my);my+=20;}
 my=150;mono.text('Unit Code',30,my);mono.text('Unit Name',110,my);mono.text('Pre-requisites',230,my);mono.text('CP',365,my);mono.text('Category',425,my);
 for(const [code,name,rule,cat]of rows){my+=25;mono.text(code,30,my);mono.text(name,110,my);mono.text(rule,230,my);mono.text('12.5',365,my);mono.text(cat,425,my);}
 const mp=new PDFParse({data:new Uint8Array(mono.output('arraybuffer'))});try{const mdata=await extractUploadedPlanner(mp,'monochrome.pdf');assert.equal(mdata.units.length,7);assert.equal(mdata.units[0].category,'Core');assert.equal(mdata.units.at(-1).category,'Elective');}finally{await mp.destroy();}
 await assert.rejects(extractUploadedPlanner({getInfo:async()=>({total:11}),getText:()=>{throw Error('Page limit must run before extraction');}},'too-long.pdf'),/at most 10/);
 const attachment=signPlannerDocument(data);assert.deepEqual(readPlannerDocument(attachment),data);
 const tampered=JSON.parse(Buffer.from(attachment.token.split('.')[0],'base64url'));tampered.requirements[0].count=0;
 assert.throws(()=>readPlannerDocument({...attachment,token:Buffer.from(JSON.stringify(tampered)).toString('base64url')+'.'+attachment.token.split('.')[1]}),/verify|verified/);
 for(const n of [3,4]){
  const prompt='plan '+n+' unit per semester for me until finish';const intent=studyPlanRequest(prompt);assert.equal(intent.name,'plan_remaining_studies');assert.equal(intent.arguments.maxUnits,String(n));
  const result=planUploadedDocument(attachment,null,[],{full:true,maxUnits:String(n),term:'Semester 1',year:'2027'});
  assert.equal(result.data.plannerSource,'upload');assert.equal(result.data.pathway.completeDraft,true);assert.ok(result.data.pathway.semesters.every(s=>s.selected.length<=n));
  const semesters=result.data.pathway.semesters;assert.ok(semesters.findIndex(s=>s.selected.some(u=>u.code==='ZZZ10001'))<semesters.findIndex(s=>s.selected.some(u=>u.code==='ZZZ10002')));
  assert.equal(semesters.flatMap(s=>s.selected).length,6);assert.equal(semesters.flatMap(s=>s.selected).filter(u=>u.category==='Elective').length,2);
 }
 assert.equal(studyPlanRequest('3 units per semester until finish').arguments.maxUnits,'3');
 const document={name:'results.xlsx',rows:[['Course','Course Title','Status','Grade','Earned'],['ZZZ10001','First core','Complete','EXM',12.5],['ZZZ20001','First major','Complete','N',12.5]],text:'DPA'};
 const continued=planUploadedDocument(attachment,document,[],{full:true,maxUnits:'3',term:'Semester 1',year:'2027'});
 const codes=continued.data.pathway.semesters.flatMap(s=>s.selected).map(u=>u.code);assert.ok(!codes.includes('ZZZ10001'));assert.ok(codes.includes('ZZZ20001'));
 assert.ok(pdfRequisite('ZZZ10001','ZZZ10001').error);assert.equal(pdfRequisite('100 Credit Points & ZZZ10001/ZZZ10002','ZZZ99999').groups[1].length,2);
 const broken=structuredClone(data);broken.units.find(u=>u.code==='ZZZ20001').requisite='ZZZ20001';const partial=planUploadedDocument(signPlannerDocument(broken),null,[],{full:true,term:'Semester 1',year:'2027'});assert.equal(partial.data.pathway.completeDraft,false);assert.ok(partial.answer.includes('own prerequisite'));assert.ok(partial.data.pathway.semesters.at(-1).selected.length);
 if(process.argv[2]){const sample=new PDFParse({data:new Uint8Array(await fs.readFile(process.argv[2]))});try{const extracted=await extractUploadedPlanner(sample,'22-S1-CSCS.pdf');assert.equal(extracted.units.length,25);assert.equal(extracted.units.filter(u=>u.category==='Core').length,8);assert.equal(extracted.units.filter(u=>/Major/.test(u.category)).length,8);assert.equal(extracted.units.filter(u=>u.category==='Elective').length,9);assert.ok(!extracted.units.some(u=>u.code==='INF10003'));assert.equal(extracted.units.find(u=>u.code==='COS20028').requisite,'COS10022 & COS20007');console.log('Supplied planner PDF: 25 options, 8 core / 8 major / 9 elective options.');}finally{await sample.destroy();}}
 console.log('Uploaded planner extraction, signature validation, 3/4 workloads, prerequisites, elective choice counts, optional DPA and partial-path checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
