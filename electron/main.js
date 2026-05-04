const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const path = require('path')
const { startNextServer, stopNextServer } = require('./server')
const { initUpdater } = require('./updater')
const { runDbSetup, stopDb } = require('./setup-db')
const { exec } = require('child_process')

let mainWindow

// ── helpers ───────────────────────────────────────────────────────────────────

function loadingStep(step, state, message, percent) {
    mainWindow?.webContents.send('loading-step', { step, state, message, percent })
}

function isOllamaInstalled() {
    return new Promise((resolve) => {
        exec('ollama --version', (err) => resolve(!err))
    })
}

function isModelInstalled(modelName) {
    return new Promise((resolve) => {
        exec('ollama list', (err, stdout) => {
            if (err) return resolve(false)
            resolve(stdout.includes(modelName))
        })
    })
}

function pullOllamaModel() {
    return new Promise((resolve, reject) => {
        console.log('[Ollama] Pulling llama3.2:1b...')

        const child = exec('ollama pull llama3.2:1b', (err) => {
            if (err) {
                console.error('[Ollama] Pull failed:', err.message)
                return reject(err)
            }
            resolve()
        })

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(Boolean)
            for (const line of lines) {
                try {
                    const json = JSON.parse(line)
                    if (json.total && json.completed) {
                        const percent = Math.round((json.completed / json.total) * 100)
                        mainWindow?.webContents.send('ollama-install-progress', {
                            message: `Downloading model… ${percent}%`,
                            percent,
                        })
                    } else if (json.status) {
                        mainWindow?.webContents.send('ollama-install-progress', {
                            message: json.status,
                            percent: 0,
                        })
                    }
                } catch {}
            }
        })

        child.stderr.on('data', (data) => {
            console.log('[Ollama] stderr:', data.toString())
        })
    })
}

// ── window ────────────────────────────────────────────────────────────────────

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
        icon: path.join(__dirname, '..', 'build-resources', 'icon.ico'),
    })

    await mainWindow.loadFile(path.join(__dirname, 'loading.html'))
    mainWindow.show()

    try {
        // ── Step 1: Database ──────────────────────────────────────────
        loadingStep('db', 'active', 'Migrating schema…')
        await runDbSetup()
        loadingStep('db', 'done', 'Ready')

        // ── Step 2: Next.js server ────────────────────────────────────
        loadingStep('srv', 'active', 'Compiling routes…')
        await startNextServer()
        await new Promise(r => setTimeout(r, 1500))
        loadingStep('srv', 'done', 'Listening on :3000')

        // ── Step 3: Ollama — status check only, no pull ───────────────
        loadingStep('ai', 'active', 'Checking…')
        const ollamaInstalled = await isOllamaInstalled()

        if (!ollamaInstalled) {
            loadingStep('ai', 'failed', 'Not installed — download from ollama.com')
        } else {
            const modelReady = await isModelInstalled('llama3.2')
            loadingStep('ai', 'done', modelReady ? 'Ready' : 'Installed — model will load on first use')
        }

        await new Promise(r => setTimeout(r, 800))
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

// ── IPC handlers ──────────────────────────────────────────────────────────────

// Check if Ollama + model are installed
ipcMain.handle('check-ollama', async () => {
    const installed = await isOllamaInstalled()
    return { installed }
})

// Pull model only — called from AI Assistant page when user visits it
ipcMain.handle('setup-ollama', async () => {
    try {
        const ollamaRunning = await isOllamaInstalled()
        if (!ollamaRunning) {
            return { success: false, error: 'Ollama not installed' }
        }

        const modelReady = await isModelInstalled('llama3.2')
        if (modelReady) {
            mainWindow?.webContents.send('ollama-install-progress', {
                message: 'Model already installed',
                percent: 100,
            })
            return { success: true }
        }

        await pullOllamaModel()
        mainWindow?.webContents.send('ollama-install-progress', {
            message: 'Model ready!',
            percent: 100,
        })
        return { success: true }

    } catch (err) {
        console.error('[Ollama] setup-ollama failed:', err)
        return { success: false, error: err.message }
    }
})

// Open ollama.com in browser for manual install
ipcMain.handle('open-ollama-download', () => {
    shell.openExternal('https://ollama.com/download')
})

ipcMain.handle('get-version', () => app.getVersion())

// ── app lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
    await createWindow()
    initUpdater(mainWindow)
})

app.on('window-all-closed', async () => {
    await stopNextServer()
    await stopDb()
    app.quit()
})

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