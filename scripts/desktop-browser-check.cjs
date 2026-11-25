const assert=require('node:assert/strict');
module.exports=async function browserCheck(base,temp,bytes,token){
  const {chromium}=require(process.env.DESKTOP_PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  const failures=[],requests=[];let active;
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*',route=>{const request=route.request(),u=request.url();if(/^https?:/.test(u)&&!u.startsWith(base+'/'))return route.abort();return route.continue({headers:{...request.headers(),'x-desktop-token':token}});});
    const page=await context.newPage();active=page;page.on('pageerror',e=>failures.push(e.message));page.on('request',r=>requests.push(r.url()));
    await page.goto(base+'/',{waitUntil:'networkidle'});
    assert.equal(new URL(page.url()).pathname,'/view/dashboard');
    await page.getByRole('link',{name:'Graduation Eligibility & Double Major'}).waitFor();
    await page.getByRole('button',{name:'Toggle menu'}).click();
    assert.equal(await page.getByText('DEV Role:',{exact:true}).count(),0);
    assert.equal(await page.getByRole('combobox',{name:'View as role'}).count(),0);
    assert.equal(await page.getByText('Logout',{exact:true}).count(),0);
    assert.equal(await page.getByText('Student Management',{exact:true}).count(),0);
    assert.equal(await page.getByText('User Management',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Toggle menu'}).click();
    await page.getByRole('link',{name:'Upload Study Planner'}).click();
    await page.locator('input[type=file]').first().setInputFiles({name:'offline-colours.pdf',mimeType:'application/pdf',buffer:bytes});
    await page.getByRole('heading',{name:'Map Colours → Unit Types',exact:true}).waitFor();
    const mappings=page.locator('select').filter({has:page.locator('option').filter({hasText:'— ignore —'})});
    assert.equal(await mappings.count(),2,'Both PDF colours appear in the actual mapping UI');
    for(const select of await mappings.all())await select.selectOption({label:'Core'});
    await page.getByRole('button',{name:/Apply Mapping.*Extract/}).click();
    await page.locator('input[value="COS10003"]').first().waitFor({timeout:30000});
    await page.locator('input[value="COS20019"]').first().waitFor({timeout:30000});
    assert(requests.some(u=>u.includes('/pdfjs/')&&u.includes('pdf.worker.min.js')),'Browser loaded the packaged local worker');
    assert(!requests.some(u=>/cdnjs.*pdf\.worker/.test(u)),'No CDN PDF worker');
    assert(!requests.some(u=>u.startsWith('http://localhost:3000/')),'No frontend API traffic leaked to the development server');
    assert.deepEqual(failures,[],'Upload workflow has no uncaught browser errors');
    await page.screenshot({path:temp+'/offline-pdf-upload.png',fullPage:true});
    console.log('Browser passed: offline colour mapping, local worker, extraction of both pages, same-origin requests and no uncaught page errors.');
  }catch(error){
    if(active){await active.screenshot({path:temp+'/browser-failure.png',fullPage:true});require('node:fs').writeFileSync(temp+'/browser-failure.txt',await active.locator('body').innerText());}
    throw error;
  }finally{await browser.close();}
};
