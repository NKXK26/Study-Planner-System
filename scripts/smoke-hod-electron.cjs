// Optional Windows Electron smoke test. The two HTTP fixtures bind only to loopback.
const { app, BrowserWindow, Menu } = require('electron');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'hod-smoke-')));
const password = randomUUID();
const expected = 'Basic ' + Buffer.from('fixture:' + password).toString('base64');
let externalRequests = 0;
const writes = [];
const unitType = { ID:1, Name:'Core' };
const basePlanner = { courseCode:'BA-CS', intakeYear:2025, intakeMonth:3, wilCode:'ICT20016', wilEquivalents:['ICT20026'],
  plannerTemplate:{name:'Review fixture',requirements:[{unitTypeId:1,unitType,requiredCount:1}]},
  units:[{ID:1,UnitCode:'COS10001',Name:'Computing',CreditPoints:12.5,unitTypeId:1,unitType,offeredTerms:[],requisites:[]}] };
const fixtures = [
  ['25-Mar-CSCS','Cybersecurity','Published',2], ['25-Mar-CSSD','Software Development','Draft',2],
  ['25-Mar-CSAI','Artificial Intelligence','Published',1], ['25-Mar-CSCS','Cybersecurity','Superseded',1],
  ['25-Mar-CSSD','Software Development','Archived',1],
].map(([name,major,status,version],i) => ({
  id:i+1, edit:3, series:name, version, status, snapshot:{...basePlanner,name,major},
  events:[{id:i+1,at:'2026-11-'+(20-i)+'T02:00:00Z',actor:'Faculty <review>',action:['publish','save','publish','create','archive'][i]}],
}));
let management;
const external = http.createServer((_req, res) => { externalRequests++; res.end(); });
const catalogue = http.createServer(async (req, res) => {
  if (req.method === 'GET') return management.emit('request',req,res);
  // Capture the UI request and return a synthetic receipt. No database is connected.
  if (req.url !== '/revisions' || req.headers.authorization !== expected || req.headers['x-catalogue-write'] !== '1') {
    return res.writeHead(403).end();
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  writes.push(body);
  if (body.action !== 'create') return res.writeHead(409).end(JSON.stringify({message:'Revision changed.'}));
  const row = {id:99,edit:1,series:'review-fixture',version:1,status:'Draft',snapshot:body.snapshot,events:[]};
  fixtures.unshift(row);
  res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(row));
});

async function capture(win,name) {
  if (!process.env.HOD_SCREENSHOT_DIR) return;
  mkdirSync(process.env.HOD_SCREENSHOT_DIR,{recursive:true});
  await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const image = await win.webContents.capturePage();
  assert.ok(!image.isEmpty());
  writeFileSync(path.join(process.env.HOD_SCREENSHOT_DIR,name+'.png'), image.toPNG());
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

async function waitUntil(check, description) {
  const deadline = Date.now() + 10000;
  while (!await check()) {
    if (Date.now() >= deadline) throw Error(description);
    await delay(50);
  }
}

async function run() {
  const {createCatalogueServer} = await import('../central/server.mjs');
  const {hashPassword} = await import('../central/passwordHash.mjs');
  management = createCatalogueServer({revision:{findMany:async()=>fixtures}}, {fixture:{role:'HOD',hash:await hashPassword(password)}});
  const outside = await listen(external);
  const base = await listen(catalogue);
  process.env.HOD_CATALOGUE_MANAGE_URL = base + '/manage';
  await app.whenReady();
  let signOut;
  const makeMenu = Menu.buildFromTemplate.bind(Menu);
  Menu.buildFromTemplate = template => {
    const menu = makeMenu(template);
    const item = menu.items.find(entry => entry.label === 'Sign out');
    if (item) signOut = item;
    return menu;
  };
  const created = once(app, 'browser-window-created');
  require('../electron/hod-main.js');
  const [, login] = await created;
  await once(login.webContents, 'did-finish-load');
  const local = js => login.webContents.executeJavaScript(js);
  await capture(login,'login');
  assert.equal(await local("document.querySelector('#toggle').click(); document.querySelector('#password').type"), 'text');
  assert.equal(await local("document.querySelector('#toggle').click(); document.querySelector('#password').type"), 'password');
  async function submit(value) {
    const pending = await local("document.querySelector('#username').value='fixture';document.querySelector('#password').value=" +
      JSON.stringify(value) + ";document.querySelector('form').requestSubmit(); document.querySelector('#submit').disabled && document.querySelector('form').getAttribute('aria-busy') === 'true'");
    assert.ok(pending);
  }
  await submit('invalid');
  await waitUntil(() => local("document.querySelector('#error').textContent.includes('incorrect')"), 'Missing sign-in error');
  assert.equal(await local("document.querySelector('#password').value"), '');
  await submit(password);
  await waitUntil(() => signOut && !login.isVisible(), 'Management window did not open');
  const remote = BrowserWindow.getAllWindows().find(win => win !== login);
  const runRemote = js => remote.webContents.executeJavaScript(js);
  assert.equal(await runRemote("typeof window.hodConsole + '/' + typeof require"), 'undefined/undefined');
  await waitUntil(() => runRemote("document.querySelector('#count-series').textContent === '3'"),'Dashboard counts did not load');
  assert.deepEqual(await runRemote("Array.from(document.querySelectorAll('.metric strong'),e=>e.textContent)"),['3','2','1','1']);
  await capture(remote,'dashboard');
  const click = selector => runRemote('document.querySelector('+JSON.stringify(selector)+').click()');
  await click('[data-page=catalogue]');
  await capture(remote,'catalogue');
  assert.equal(await runRemote("byId('search').value='software'; byId('search').dispatchEvent(new Event('input')); byId('status').value='Draft'; byId('status').dispatchEvent(new Event('change')); byId('planners').children.length"),1);
  await click('#planners button');
  assert.equal(await runRemote("byId('edit-title').textContent"),'25-Mar-CSSD · v2');
  await click('[data-page=history]');
  assert.ok(await runRemote("byId('events').textContent.includes('Faculty <review>') && !byId('events').querySelector('review')"));
  await click('[data-page=editor]');
  await runRemote("window.prompts=[]; window.confirm=s=>{prompts.push(s);return false}; byId('name').value='Unsaved'; byId('name').dispatchEvent(new Event('input'))");
  assert.ok(await runRemote("document.querySelector('[data-action=publish]').disabled"));
  await click('[data-action=publish]');
  await runRemote("byId('name').value='25-Mar-CSSD'; byId('name').dispatchEvent(new Event('input'))");
  await click('[data-action=publish]');
  await click('[data-action=archive]');
  assert.equal(await runRemote('prompts.length'),2);
  assert.equal(writes.length,0);
  await click('[data-page=upload]');
  await runRemote("const large=new DataTransfer();large.items.add(new File([new Uint8Array(1048577)],'large.json'));byId('file').files=large.files;byId('file').dispatchEvent(new Event('change'))");
  assert.ok(await runRemote("byId('upload-error').textContent.includes('1 MiB') && byId('preview-card').hidden"));
  async function pick(filename,content) {
    await runRemote("void async function(){const dt=new DataTransfer();dt.items.add(new File(["+JSON.stringify(content)+"],"+
      JSON.stringify(filename)+"));byId('file').files=dt.files;byId('file').dispatchEvent(new Event('change'))}()");
  }
  for (const [filename,content] of [['review.pdf','{}'],['review.json','[{}]'],['review.json','invalid']]) {
    await pick(filename,content);
    await waitUntil(()=>runRemote("!!byId('upload-error').textContent && byId('preview-card').hidden"),'Invalid upload accepted');
  }
  const upload = {...basePlanner,name:'September software review',major:'Software Development',intakeMonth:9};
  await pick('reviewed.json',JSON.stringify(upload));
  await waitUntil(()=>runRemote("!byId('preview-card').hidden"),'Upload preview missing');
  assert.ok(await runRemote("['September software review','BA-CS','September 2025','Software Development','ICT20016','ICT20026'].every(s=>byId('preview').textContent.includes(s))"));
  await capture(remote,'upload');
  await click('#create');
  assert.equal(writes.length,0);
  await runRemote('void (window.confirm=()=>true)');
  await click('#create');
  await waitUntil(()=>runRemote("byId('edit-title').textContent === 'September software review · v1'"),'Missing new draft receipt');
  assert.deepEqual(writes,[{action:'create',snapshot:upload}]);
  await runRemote("byId('name').value='Renamed';byId('name').dispatchEvent(new Event('input'))");
  await click('[data-action=save]');
  await waitUntil(()=>runRemote("byId('message').textContent.includes('Refresh')"),'Concurrent edit should require refresh');
  assert.equal(writes[1].id,99);
  assert.equal(writes[1].edit,1);
  assert.equal(writes[1].snapshot.name,'Renamed');
  remote.setSize(830,700);
  await waitUntil(()=>runRemote("getComputedStyle(byId('menu')).display !== 'none'"),'Small-window navigation missing');
  await click('#menu');
  assert.equal(await runRemote("byId('menu').getAttribute('aria-expanded')"),'true');
  await click('[data-page=dashboard]');
  assert.equal(await runRemote("byId('menu').getAttribute('aria-expanded')"),'false');
  assert.equal(await runRemote('fetch(' + JSON.stringify(outside) + ').then(()=>false,()=>true)'), true);
  assert.equal(externalRequests, 0);
  await runRemote("sessionStorage.setItem('marker','test'); localStorage.setItem('marker','test'); document.cookie='marker=test'");
  signOut.click(undefined, remote);
  await waitUntil(() => remote.isDestroyed() && login.isVisible(), 'Sign out did not return to sign-in');
  await submit(password);
  await waitUntil(() => !login.isVisible(), 'Second sign-in failed');
  const reopened = BrowserWindow.getAllWindows().find(win => win !== login);
  assert.equal(await reopened.webContents.executeJavaScript(
    "localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === ''"), true);
  reopened.close();
  await waitUntil(() => login.isVisible(), 'Closing management did not end the session');
  console.log('Electron loopback smoke passed: form, Basic challenge, management API, renderer isolation, external request denial, sign out, storage cleanup and re-login.');
}

setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1); }, 45_000).unref();
run().then(() => app.exit(0), error => {
  console.error(error.message);
  app.exit(1);
});
