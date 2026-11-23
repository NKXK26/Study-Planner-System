const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const stagingEndpoint = 'https://official-planner-catalogue-staging.onrender.com/manage';
const loginFile = path.join(__dirname, 'hod-login.html');
const loginUrl = pathToFileURL(loginFile).href;
const unavailable = 'The catalogue service is unavailable. Try again shortly.';
const incorrect = 'The publisher username or password is incorrect.';
const timedOut = 'The catalogue took too long to respond. Please try again.';
const invalidConfig = 'The catalogue address is invalid. Contact the console administrator.';
const revisionPaths = new Set(['/revisions', '/revisions/bulk/plan', '/revisions/bulk/apply']);

function managementEndpoint() {
  const override = process.env.HOD_CATALOGUE_MANAGE_URL;
  const raw = !app.isPackaged && override !== undefined ? override : stagingEndpoint;
  if (!/^https?:\/\/[^\s@/?#\\]+\/manage$/.test(raw)) return null;
  try {
    const url = new URL(raw);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return url.protocol === 'https:' || (!app.isPackaged && loopback) ? url : null;
  } catch {
    return null;
  }
}

const endpoint = managementEndpoint();
let loginWindow;
let catalogueSession;
let active;
let quitting = false;
let cleanSession = Promise.resolve(true);

function denyPermissions(ses) {
  ses.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', event => event.preventDefault());
}

function allowedRequest(details) {
  if (!active || active.contentsId !== details.webContentsId) return false;
  if (details.resourceType === 'mainFrame') return details.url === endpoint.href && details.method === 'GET';
  if (!active.accepted || details.resourceType !== 'xhr') return false;
  const url = new URL(details.url);
  return url.origin === endpoint.origin && revisionPaths.has(url.pathname) && url.href === endpoint.origin + url.pathname;
}

function configureCatalogueSession() {
  catalogueSession = session.fromPartition('hod-catalogue', { cache: false });
  denyPermissions(catalogueSession);
  const requests = catalogueSession.webRequest;
  requests.onBeforeRequest((details, respond) => respond({ cancel: !allowedRequest(details) }));
  requests.onBeforeSendHeaders((details, respond) => {
    if (!allowedRequest(details)) return respond({ cancel: true });
    const requestHeaders = { ...details.requestHeaders };
    for (const key of Object.keys(requestHeaders)) {
      if (key.toLowerCase() === 'authorization') delete requestHeaders[key];
    }
    requestHeaders.Authorization = active.authorization;
    respond({ requestHeaders });
  });
  requests.onHeadersReceived((details, respond) => {
    if (!allowedRequest(details)) return respond({ cancel: true });
    if (details.resourceType === 'mainFrame') {
      active.accepted = details.statusCode === 200;
      active.failure = [401, 403].includes(details.statusCode) ? incorrect : unavailable;
      return respond({ cancel: !active.accepted });
    }
    respond({ cancel: details.statusCode >= 300 && details.statusCode < 400 });
  });
}

function createWindow(webPreferences, show) {
  const win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 820, minHeight: 620, show,
    title: 'HOD Study Planner Console',
    webPreferences: {
      ...webPreferences, contextIsolation: true, nodeIntegration: false,
      sandbox: true, devTools: false, webviewTag: false,
    },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Main-process loadFile/loadURL do not emit will-frame-navigate.
  for (const event of ['will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
    win.webContents.on(event, navigation => navigation.preventDefault());
  }
  return win;
}

function endSession(attempt) {
  if (!attempt || active !== attempt) return;
  active = null;
  attempt.authorization = '';
  attempt.onEnd();
  if (!attempt.window.isDestroyed()) attempt.window.destroy();
  // A new publisher cannot sign in until this in-memory partition is clean.
  cleanSession = (async () => {
    await catalogueSession.closeAllConnections();
    await Promise.all([catalogueSession.clearAuthCache(), catalogueSession.clearData()]);
    return true;
  })().catch(() => false);
  if (!quitting && loginWindow && !loginWindow.isDestroyed()) loginWindow.show();
}

function createLoginWindow() {
  loginWindow = createWindow({ partition: 'hod-sign-in', preload: path.join(__dirname, 'hod-preload.js') }, true);
  loginWindow.on('closed', () => {
    loginWindow = null;
    endSession(active);
  });
  loginWindow.loadFile(loginFile);
}

function trustedLogin(event) {
  return !quitting && loginWindow && event.sender === loginWindow.webContents &&
    event.senderFrame === event.sender.mainFrame && event.senderFrame?.url === loginUrl;
}

ipcMain.handle('hod:login', async (event, credentials) => {
  if (!trustedLogin(event)) return { ok: false, message: unavailable };
  if (!endpoint) return { ok: false, message: invalidConfig };
  const username = typeof credentials?.username === 'string' ? credentials.username.trim() : '';
  const password = credentials?.password;
  if (!username || username.includes(':') || username.length > 100 ||
      typeof password !== 'string' || !password || password.length > 500) {
    return { ok: false, message: 'Enter a valid publisher username and password.' };
  }
  if (!await cleanSession) return { ok: false, message: 'Please close and reopen the console before signing in.' };
  if (!trustedLogin(event) || active) return { ok: false, message: unavailable };

  const win = createWindow({ session: catalogueSession }, false);
  const attempt = { window: win, contentsId: win.webContents.id, accepted: false, failure: unavailable,
    authorization: 'Basic ' + Buffer.from(username + ':' + password, 'utf8').toString('base64') };
  const ended = new Promise(resolve => { attempt.onEnd = resolve; });
  active = attempt;
  win.on('closed', () => endSession(attempt));
  win.webContents.on('render-process-gone', () => endSession(attempt));
  const timer = setTimeout(() => {
    attempt.failure = timedOut;
    endSession(attempt);
  }, 60_000);
  try {
    // This single authenticated GET both validates the publisher and loads the console.
    await Promise.race([win.loadURL(endpoint.href), ended]);
    if (!attempt.accepted || active !== attempt) throw new Error();
    win.setMenu(Menu.buildFromTemplate([{ label: 'Sign out', click: () => endSession(attempt) }]));
    loginWindow.hide();
    win.show();
    return { ok: true };
  } catch {
    endSession(attempt);
    return { ok: false, message: attempt.failure };
  } finally {
    clearTimeout(timer);
  }
});

app.on('login', (event, _contents, _requestDetails, _authInfo, callback) => {
  event.preventDefault();
  callback();
});
app.on('before-quit', () => { quitting = true; endSession(active); });
app.whenReady().then(() => {
  configureCatalogueSession();
  const localSession = session.fromPartition('hod-sign-in', { cache: false });
  denyPermissions(localSession);
  localSession.webRequest.onBeforeRequest((details, respond) => respond({ cancel: details.url !== loginUrl }));
  createLoginWindow();
  app.on('activate', () => { if (!loginWindow && !quitting) createLoginWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
