// Exercise the actual resource tree produced by electron-builder, using its own
// Node executable and a disposable database. Never starts or alters user data.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');const {jsPDF}=require('jspdf');
const {availablePort,waitForServer}=require('../electron/server');
(async()=>{
  const resources=path.resolve(process.argv[2]||'tmp/desktop-package/win-unpacked/resources');
  const app=path.join(resources,'app'),node=path.join(resources,'node','node.exe');
  assert(fs.existsSync(node),'Packaged Node runtime exists');assert(fs.existsSync(path.join(app,'server.js')),'Packaged server exists');
  const temp=fs.mkdtempSync(path.join(path.resolve('tmp'),'packaged-smoke-')),dbPath=path.join(temp,'planner.db');
  fs.copyFileSync(path.join(app,'prisma','app.db'),dbPath);
  const {PrismaClient}=require(path.join(app,'node_modules','@prisma','client'));
  const db=new PrismaClient({datasources:{db:{url:'file:'+dbPath.replaceAll('\\','/')}}});
  try{await require('../electron/planner-schema').upgradePlannerSchema(db);}finally{await db.$disconnect();}
  const port=await availablePort(0),url='http://127.0.0.1:'+port,token='packaged-smoke';let logs='';
  const child=spawn(node,[path.join(app,'server.js')],{cwd:app,windowsHide:true,env:{...process.env,PATH:'',NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1',DATABASE_URL:'file:'+dbPath.replaceAll('\\','/'),DIRECT_URL:'file:'+dbPath.replaceAll('\\','/'),DESKTOP_SERVER_TOKEN:token,OLLAMA_URL:'http://127.0.0.1:1'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const get=(route,opts={})=>fetch(url+route,{...opts,headers:{Connection:'close','x-desktop-token':token,...opts.headers}});
  try{
    await waitForServer(url,child,token);
    for(const route of ['/','/view/student_information','/view/user_management','/view/roles','/view/account']){
      const result=await get(route,{redirect:'manual'});assert.equal(result.status,307,route);assert.equal(new URL(result.headers.get('location'),url).pathname,'/view/dashboard');
    }
    for(const route of ['/api/students','/api/users','/api/roles'])assert.equal((await get(route)).status,404,route);
    for(const route of ['/view/dashboard','/view/upload_planner','/view/study-planner-maker','/view/study-planner','/view/planner-templates','/view/compare-planners','/view/compare_study_planner','/view/graduation-eligibility','/view/double-major-checker','/view/ai-assistant']){
      const r=await get(route);assert.equal(r.status,200,route);const html=await r.text();assert(!/NEXT_NOT_FOUND/.test(html),route+' is not a not-found page');
      const js=html.match(/src="([^\"]+\/_next\/static\/[^\"]+\.js|\/_next\/static\/[^\"]+\.js)"/);if(js)assert.equal((await get(js[1])).status,200,'JavaScript for '+route);
    }
    const version=require('pdfjs-dist/package.json').version;
    for(const asset of ['/pdfjs/'+version+'/pdf.worker.min.js','/pdfjs/'+version+'/standard_fonts/LiberationSans-Regular.ttf','/pdfjs/'+version+'/cmaps/Adobe-Japan1-UCS2.bcmap'])assert.equal((await get(asset)).status,200,asset);
    const catalogue=await get('/api/planner-assistant/tools');assert.equal(catalogue.status,200);const catalog=await catalogue.json();assert(catalog.planners.length);
    for(const endpoint of ['/api/unit','/api/study-planner','/api/planner-templates','/api/unit_type','/api/dashboard'])assert.equal((await get(endpoint)).status,200,endpoint);
    const status=await get('/api/planner-assistant');assert.equal(status.status,200);assert.equal((await status.json()).status,'offline');
    const denied=await fetch(url+'/api/planner-assistant/tools',{headers:{Connection:'close','x-dev-override':'true'}});assert.equal(denied.status,401);
    assert.equal((await get('/api/unit',{headers:{Origin:'https://example.com'}})).status,401);
    const pdf=new jsPDF({unit:'pt'});pdf.setFontSize(12);pdf.setFillColor(198,217,241);pdf.rect(25,40,400,30,'F');pdf.text('COS10003 Computer and Logic Essentials',30,60);pdf.addPage();pdf.setFillColor(214,227,188);pdf.rect(25,40,400,30,'F');pdf.text('COS20019 Cloud Computing Architecture',30,60);
    const bytes=Buffer.from(pdf.output('arraybuffer')),form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),'coloured.pdf');
    const colours=await get('/api/pdf-debug',{method:'POST',body:form});assert.equal(colours.status,200);const blocks=await colours.json();assert(blocks.some(b=>b.text.includes('COS10003')));assert(blocks.some(b=>b.page===2&&b.text.includes('COS20019')));
    const invalid=new FormData();invalid.append('file',new Blob(['invalid']),'bad.pdf');assert.equal((await get('/api/pdf-debug',{method:'POST',body:invalid})).status,400);
    const dpa=await get('/api/planner-assistant/document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'coloured.pdf',base64:bytes.toString('base64')})});assert.equal(dpa.status,200);assert((await dpa.json()).document.text.includes('COS10003'));
    const chat=await get('/api/planner-assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'show all planners in the database',enableTools:true,planningOnly:true})});assert.equal(chat.status,200);assert((await chat.json()).answer);
    if(process.env.DESKTOP_BROWSER_TEST==='1')await require('./desktop-browser-check.cjs')(url,temp,bytes,token);
    console.log('Packaged resources passed: pages and JS, local PDF worker/fonts, catalogue/database APIs, offline AI fallback, authentication, PDF colours on both pages, invalid uploads and DPA text extraction.');
  }finally{child.kill();fs.writeFileSync(path.join(temp,'server.log'),logs);console.log('Disposable test evidence: '+temp);}
})().catch(e=>{console.error(e);process.exitCode=1;});
