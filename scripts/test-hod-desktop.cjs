const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const yaml = require('js-yaml');

const directory = path.resolve(__dirname, '../electron');
const read = name => readFileSync(path.join(directory, name), 'utf8');
const main = read('hod-main.js');
const staging = 'https://official-planner-catalogue-staging.onrender.com/manage';
const credentials = { username: 'fixture', password: randomUUID() };

function request(handler, details) {
  let response;
  handler(details, result => { response = result; });
  assert.ok(response);
  return response;
}

// Exercise the production main-process handlers with an in-memory Electron transport.
async function boot(override, packaged = false) {
  const app = Object.assign(new EventEmitter(), { isPackaged: packaged, whenReady: async () => {} });
  const windows = [], sessions = new Map(), ipc = new Map();
  const state = { status: 200 };
  function fromPartition(name) {
    if (sessions.has(name)) return sessions.get(name);
    assert.ok(!name.startsWith('persist:'));
    const ses = Object.assign(new EventEmitter(), { hooks: {}, webRequest: {}, cleaned: [] });
    for (const key of ['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived']) {
      ses.webRequest[key] = fn => { assert.equal(ses.hooks[key], undefined); ses.hooks[key] = fn; };
    }
    for (const key of ['clearData', 'clearAuthCache', 'closeAllConnections']) {
      ses[key] = async () => { ses.cleaned.push(key); };
    }
    for (const key of ['setPermissionCheckHandler', 'setPermissionRequestHandler', 'setDevicePermissionHandler']) {
      ses[key] = fn => { ses[key + 'Callback'] = fn; };
    }
    sessions.set(name, ses);
    return ses;
  }
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.visible = options.show;
      this.webContents = Object.assign(new EventEmitter(), {
        id: windows.length + 1, mainFrame: {},
        setWindowOpenHandler: fn => { this.popup = fn; },
      });
      windows.push(this);
    }
    setMenu(menu) { this.menu = menu; }
    loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; }
    async loadURL(url) {
      this.url = url;
      const hooks = this.options.webPreferences.session.hooks;
      const details = { url, resourceType: 'mainFrame', method: 'GET', webContentsId: this.webContents.id };
      assert.equal(request(hooks.onBeforeRequest, details).cancel, false);
      const headers = request(hooks.onBeforeSendHeaders, { ...details, requestHeaders: {} }).requestHeaders;
      assert.equal(headers.Authorization, 'Basic ' + Buffer.from('fixture:' + credentials.password).toString('base64'));
      if (state.status === 'timeout') return new Promise(() => {});
      if (state.status === 'offline') throw Error();
      if (request(hooks.onHeadersReceived, { ...details, statusCode: state.status }).cancel) throw Error();
    }
    isDestroyed() { return Boolean(this.closed); }
    destroy() { this.closed = true; this.emit('closed'); }
    hide() { this.visible = false; }
    show() { this.visible = true; }
  }
  const electron = { app, BrowserWindow, session: { fromPartition },
    Menu: { buildFromTemplate: template => template }, ipcMain: { handle: (key, fn) => ipc.set(key, fn) } };
  vm.runInNewContext(main, { __dirname: directory, URL, Buffer,
    process: { env: { HOD_CATALOGUE_MANAGE_URL: override }, platform: 'win32' },
    require: name => name === 'electron' ? electron : require(name),
    setTimeout: fn => { state.timeout = fn; }, clearTimeout() {},
  });
  await Promise.resolve();
  const win = windows[0];
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  return { app, windows, state, sessions, login: (caller = event) => ipc.get('hod:login')(caller, credentials) };
}

test('only canonical /manage endpoints are accepted, packaged builds pin staging', async () => {
  for (const url of ['', 'bad', 'file:///manage', 'http://catalogue.invalid/manage',
    'https://a:b@catalogue.invalid/manage', 'https://@catalogue.invalid/manage',
    'https://catalogue.invalid/manage?', 'https://catalogue.invalid/manage#',
    'https://catalogue.invalid/revisions', 'http://localhost.evil.invalid/manage']) {
    const h = await boot(url);
    assert.match((await h.login()).message, /address is invalid/);
    assert.equal(h.windows.length, 1);
  }
  for (const url of ['http://127.0.0.1:4100/manage', 'http://[::1]:4100/manage', 'https://catalogue.invalid/manage']) {
    const h = await boot(url);
    assert.ok((await h.login()).ok);
    assert.equal(h.windows[1].url, url);
  }
  const installed = await boot('http://localhost/manage', true);
  assert.ok((await installed.login()).ok);
  assert.equal(installed.windows[1].url, staging);
});

test('only the local main frame can sign in, remote content has no bridge or navigation privileges', async () => {
  const h = await boot();
  const local = h.windows[0];
  assert.ok(!(await h.login({ sender: local.webContents, senderFrame: {} })).ok);
  assert.ok((await h.login()).ok);
  const remote = h.windows[1];
  assert.ok(!(await h.login({ sender: remote.webContents, senderFrame: remote.webContents.mainFrame })).ok);
  assert.ok(local.options.webPreferences.preload.endsWith('hod-preload.js'));
  assert.equal(remote.options.webPreferences.preload, undefined);
  for (const win of h.windows) {
    const p = win.options.webPreferences;
    assert.ok(p.contextIsolation && p.sandbox);
    assert.equal(p.nodeIntegration, false);
    assert.equal(p.devTools, false);
    assert.equal(win.popup().action, 'deny');
    for (const event of ['will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
      let denied = false;
      win.webContents.emit(event, { preventDefault() { denied = true; } });
      assert.ok(denied);
    }
  }
  for (const ses of h.sessions.values()) {
    let downloadDenied = false;
    ses.emit('will-download', { preventDefault() { downloadDenied = true; } });
    assert.ok(downloadDenied);
    assert.equal(ses.setPermissionCheckHandlerCallback(), false);
    assert.equal(ses.setDevicePermissionHandlerCallback(), false);
    ses.setPermissionRequestHandlerCallback(null, 'media', answer => assert.equal(answer, false));
  }
});

test('self-contained HOD screens use the local brand and safe DOM rendering', () => {
  const login = read('hod-login.html');
  const manage = read('../central/manage.html');
  const logo = readFileSync(path.join(directory, '../public/images/swinburne_logo.png')).toString('base64');
  for (const html of [login, manage]) {
    assert.ok(html.includes('data:image/png;base64,' + logo));
    assert.doesNotMatch(html, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b|\son\w+\s*=\s*["']|<(?:link|script)[^>]+(?:src|href)\s*=/i);
  }
  assert.match(login, /role="alert"/);
  assert.match(manage, /role="status"/);
});

if (process.env.HOD_VERIFY_ASAR) test('built HOD archive matches the reviewed application inputs', () => {
  const asar = require('@electron/asar');
  const archive = process.env.HOD_VERIFY_ASAR;
  const names = ['hod-login.html','hod-main.js','hod-preload.js','package.json'];
  assert.deepEqual(asar.listPackage(archive).map(name => name.slice(1)).sort(), names);
  for (const name of names) {
    const bytes = asar.extractFile(archive,name);
    if (name === 'package.json') assert.deepEqual(JSON.parse(bytes), JSON.parse(read(name)));
    else assert.deepEqual(bytes,readFileSync(path.join(directory,name)));
  }
});

test('credentials apply only to the active catalogue window and exact allowed origin and paths', async () => {
  const h = await boot();
  assert.ok((await h.login()).ok);
  const remote = h.windows[1];
  const ses = remote.options.webPreferences.session;
  const target = new URL('/revisions', staging);
  const d = { url: target.href, method: 'POST', resourceType: 'xhr', webContentsId: remote.webContents.id,
    requestHeaders: { authorization: 'obsolete' } };
  const headers = request(ses.hooks.onBeforeSendHeaders, d).requestHeaders;
  assert.deepEqual(Object.keys(headers), ['Authorization']);
  assert.ok(headers.Authorization.startsWith('Basic '));
  for (const change of [{ webContentsId: 1 }, { url: 'file:///manage' }, { url: target.origin + '/other' },
    { url: target.href.replace('https:', 'http:') }, { url: target.href.replace('/revisions', ':444/revisions') },
    { url: target.href.replace('/revisions', '.external.invalid/revisions') }]) {
    for (const key of ['onBeforeRequest', 'onBeforeSendHeaders']) {
      assert.ok(request(ses.hooks[key], { ...d, ...change }).cancel);
    }
  }
  assert.ok(request(ses.hooks.onHeadersReceived, { ...d, statusCode: 302 }).cancel);
  assert.equal(remote.menu[0].label, 'Sign out');
  remote.menu[0].click();
  assert.ok(remote.closed && h.windows[0].visible);
  assert.ok(request(ses.hooks.onBeforeSendHeaders, d).cancel);
  assert.ok((await h.login()).ok);
  assert.deepEqual(ses.cleaned, ['closeAllConnections', 'clearAuthCache', 'clearData']);
  assert.ok(request(ses.hooks.onBeforeSendHeaders, d).cancel);
  h.windows[2].destroy();
  assert.ok((await h.login()).ok);
  h.app.emit('before-quit');
  assert.ok(h.windows[3].closed);
  assert.ok(request(ses.hooks.onBeforeSendHeaders, { ...d, webContentsId: h.windows[3].webContents.id }).cancel);
});

test('bad credentials, unavailable service and timeout return safe messages and discard the attempt', async () => {
  const h = await boot();
  for (const status of [401, 403, 302, 503, 'offline', 'timeout']) {
    h.state.status = status;
    const pending = h.login();
    if (status === 'timeout') {
      await new Promise(resolve => setImmediate(resolve));
      h.state.timeout();
    }
    const result = await pending;
    assert.equal(result.ok, false);
    assert.match(result.message, status === 'timeout' ? /too long/ : [401, 403].includes(status) ? /incorrect/ : /unavailable/);
    assert.ok(h.windows.at(-1).closed && h.windows[0].visible);
  }
  h.state.status = 200;
  assert.ok((await h.login()).ok);
});

test('preload API and installer file allowlist', () => {
  let bridge;
  const calls = [];
  vm.runInNewContext(read('hod-preload.js'), { require: () => ({
    contextBridge: { exposeInMainWorld(name, api) { assert.equal(name, 'hodConsole'); bridge = api; } },
    ipcRenderer: { invoke: (...args) => calls.push(args) },
  }) });
  assert.deepEqual(Object.keys(bridge), ['login']);
  bridge.login(credentials);
  assert.deepEqual(calls, [['hod:login', credentials]]);
  const config = yaml.load(read('../electron-builder.hod.yml'));
  assert.equal(config.appId, 'my.edu.swinburne.studyplanner.hod');
  assert.equal(config.productName, 'HOD Study Planner Console');
  assert.deepEqual(config.directories.app, 'electron');
  assert.equal(config.directories.output, 'dist-hod');
  assert.equal(config.asar, true);
  assert.equal(config.publish, null);
  assert.deepEqual(config.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.allowElevation, false);
  assert.equal(config.nsis.packElevateHelper, false);
  assert.deepEqual(config.files.slice().sort(), ['hod-login.html', 'hod-main.js', 'hod-preload.js', 'package.json']);
  assert.equal(config.extraResources, undefined);
  assert.equal(config.extraFiles, undefined);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.main, 'hod-main.js');
  assert.equal(pkg.dependencies, undefined);
  for (const file of config.files) assert.doesNotMatch(read(file), /prisma|sqlite|app\.db|admin1234|shell\.openExternal/i);
});
