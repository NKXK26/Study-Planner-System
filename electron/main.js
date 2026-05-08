const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const { startNextServer, stopNextServer } = require('./server')
const { initUpdater } = require('./updater')
const { runDbSetup } = require('./setup-db')

let mainWindow

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Student Study Planner',
    show: false,
    // Use your own icon in build-resources/
    icon: path.join(__dirname, '..', 'build-resources', 'icon.ico'),
  })

  // Show loading screen immediately
  mainWindow.loadFile(path.join(__dirname, 'loading.html'))
  mainWindow.show()

  try {
    console.log('Running DB setup...')
    await runDbSetup()

    console.log('Starting Next.js server...')
    await startNextServer()

    console.log('Loading app...')
    await mainWindow.loadURL('http://localhost:3000')
  } catch (err) {
    console.error('Startup failed:', err)
    dialog.showErrorBox(
      'Failed to start Student Study Planner',
      `Error: ${err.message}\n\nPlease restart the app or contact support.`
    )
    app.quit()
  }
}

app.whenReady().then(async () => {
  await createWindow()
  // Check for updates after window is ready (non-blocking)
  initUpdater(mainWindow)
})

app.on('window-all-closed', async () => {
  await stopNextServer()
  app.quit()
})

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// IPC handler for app version
ipcMain.handle('get-version', () => app.getVersion())