const { autoUpdater } = require('electron-updater')
const { dialog } = require('electron')
const log = require('electron-log')

autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'
// Log file location: C:\Users\<name>\AppData\Roaming\student-study-planner\logs\main.log

autoUpdater.autoDownload = true          // silently download in background
autoUpdater.autoInstallOnAppQuit = false // we control when to install

function initUpdater(mainWindow) {
  // Wait 8 seconds after launch — don't compete with server startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      log.warn('Update check failed (no internet?):', err.message)
    })
  }, 8000)

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version)
    // Notify the renderer (optional toast/banner in your UI)
    mainWindow.webContents.send('update-status', {
      type: 'downloading',
      version: info.version,
    })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('App is up to date.')
  })

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent)
    log.info(`Download progress: ${pct}%`)
    mainWindow.webContents.send('update-status', {
      type: 'progress',
      percent: pct,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version)
    mainWindow.webContents.send('update-status', {
      type: 'ready',
      version: info.version,
    })

    // Show native dialog asking user to restart
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready to install',
      message: `Version ${info.version} is ready.`,
      detail: 'The app will restart and install the update now.',
      buttons: ['Restart & Update', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true)
      }
    })
  })

  autoUpdater.on('error', (err) => {
    log.error('Updater error:', err)
    // Don't bother the user — just log it
  })
}

module.exports = { initUpdater }