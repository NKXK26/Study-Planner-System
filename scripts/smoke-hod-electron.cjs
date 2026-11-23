// Optional Windows Electron smoke test. The two HTTP fixtures bind only to loopback.
const { app, BrowserWindow, Menu } = require('electron');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { mkdtempSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'hod-smoke-')));
const password = randomUUID();
const expected = 'Basic ' + Buffer.from('fixture:' + password).toString('base64');
let externalRequests = 0;
let revisionReads = 0;
const external = http.createServer((_req, res) => { externalRequests++; res.end(); });
const catalogue = http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.headers.authorization !== expected) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Test"' }).end();
  } else if (req.url === '/manage') {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Fixture catalogue</title>');
  } else if (req.url === '/revisions') {
    revisionReads++;
    res.writeHead(200).end('[]');
  } else res.writeHead(404).end();
});

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
  async function submit(value) {
    await local("document.querySelector('#username').value='fixture';document.querySelector('#password').value=" +
      JSON.stringify(value) + ";document.querySelector('form').requestSubmit()");
  }
  await submit('invalid');
  await waitUntil(() => local("document.querySelector('#error').textContent.includes('incorrect')"), 'Missing sign-in error');
  assert.equal(await local("document.querySelector('#password').value"), '');
  await submit(password);
  await waitUntil(() => signOut && !login.isVisible(), 'Management window did not open');
  const remote = BrowserWindow.getAllWindows().find(win => win !== login);
  const runRemote = js => remote.webContents.executeJavaScript(js);
  assert.equal(await runRemote("typeof window.hodConsole + '/' + typeof require"), 'undefined/undefined');
  assert.equal(await runRemote("fetch('/revisions').then(r=>r.status)"), 200);
  assert.equal(revisionReads, 1);
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
