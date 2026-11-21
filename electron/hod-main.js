const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');

const defaultManageUrl = 'https://official-planner-catalogue-staging.onrender.com/manage';
const manageUrl = new URL(process.env.HOD_CATALOGUE_MANAGE_URL || defaultManageUrl);
if (manageUrl.protocol !== 'https:' && !(manageUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(manageUrl.hostname))) {
  throw new Error('HOD_CATALOGUE_MANAGE_URL must use HTTPS (or localhost for development).');
}
const allowedOrigin = manageUrl.origin;
let publisherAuthorization = '';
let mainWindow;

function createWindow() {
  const partition = 'hod-catalogue';
  const hodSession = session.fromPartition(partition);
  hodSession.webRequest.onBeforeSendHeaders({ urls: [`${allowedOrigin}/*`] }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    if (publisherAuthorization) requestHeaders.Authorization = publisherAuthorization;
    callback({ requestHeaders });
  });

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 820,
    minHeight: 620,
    title: 'HOD Study Planner Console',
    webPreferences: {
      partition,
      preload: path.join(__dirname, 'hod-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    let destination;
    try { destination = new URL(target); } catch { event.preventDefault(); return; }
    if (destination.origin !== allowedOrigin && destination.protocol !== 'file:') event.preventDefault();
  });
  mainWindow.on('closed', () => { publisherAuthorization = ''; mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, 'hod-login.html'));
}

ipcMain.handle('hod:login', async (_event, credentials) => {
  const username = typeof credentials?.username === 'string' ? credentials.username.trim() : '';
  const password = typeof credentials?.password === 'string' ? credentials.password : '';
  if (!username || !password || username.length > 100 || password.length > 500) return { ok: false, message: 'Enter the HOD username and password.' };
  const authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
  try {
    const response = await fetch(manageUrl, { headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (response.status === 401 || response.status === 403) return { ok: false, message: 'The HOD username or password is incorrect.' };
    if (!response.ok) return { ok: false, message: 'The publishing service is unavailable. Try again shortly.' };
    publisherAuthorization = authorization;
    await mainWindow.loadURL(manageUrl.href);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not reach the central publishing service.' };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
