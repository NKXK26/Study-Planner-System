// setup-db.js
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn, exec } = require('child_process')
const { app } = require('electron')

// ── Helpers ──────────────────────────────────────────────────────────────────

function getOllamaExePath() {
  if (process.platform === 'win32') {
    // Standard Ollama Windows installation path
    return path.join('C:\\', 'Program Files', 'Ollama', 'ollama.exe')
  } else if (process.platform === 'darwin') {
    return '/usr/local/bin/ollama'
  } else {
    return '/usr/bin/ollama'
  }
}

async function isOllamaRunning() {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return res.ok
  } catch {
    return false
  }
}

async function waitForOllama(timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await isOllamaRunning()) return true
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

async function isModelDownloaded(modelName = 'llama3.2:1b') {
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    const data = await res.json()
    return data.models?.some(m => m.name.includes(modelName.split(':')[0]))
  } catch {
    return false
  }
}

async function pullModel(modelName = 'llama3.2:1b', onProgress) {
  const res = await fetch('http://localhost:11434/api/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true })
  })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const lines = decoder.decode(value).split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const json = JSON.parse(line)
        if (json.total && json.completed) {
          const percent = Math.round((json.completed / json.total) * 100)
          onProgress?.(percent, json.status)
        } else if (json.status) {
          onProgress?.(null, json.status)
        }
      } catch { }
    }
  }
}

// ── DB Setup ─────────────────────────────────────────────────────────────────

async function runDbSetup() {
  const isProd = app.isPackaged
  const userData = app.getPath('userData')
  const dbPath = path.join(userData, 'planner.db')

  const sourceDb = isProd
    ? path.join(process.resourcesPath, 'app', 'prisma', 'app.db')
    : path.join(__dirname, '..', 'prisma', 'app.db')

  console.log('sourceDb:', sourceDb)
  console.log('sourceDb exists:', fs.existsSync(sourceDb))
  console.log('dbPath:', dbPath)
  console.log('dbPath exists:', fs.existsSync(dbPath))

  if (!fs.existsSync(dbPath)) {
    console.log('First launch — copying bundled database...')
    fs.mkdirSync(userData, { recursive: true })
    fs.copyFileSync(sourceDb, dbPath)
    console.log('Done.')
  } else {
    console.log('Database already exists, skipping copy.')
  }
}

// ── Ollama Setup (Only start, no installation) ─────────────────────────────

async function runOllamaSetup(mainWindow) {
  const sendStatus = (message, percent = null) => {
    console.log('[Ollama]', message)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ollama-status', { message, percent })
    }
  }

  // Step 1 — Check if Ollama is already running
  sendStatus('Checking if Ollama is available...', 10)

  if (await isOllamaRunning()) {
    sendStatus('Ollama is already running', 20)

    // Check if model is downloaded
    if (!(await isModelDownloaded('llama3.2:1b'))) {
      sendStatus('Downloading AI model (1.3GB) — first time only...', 30)
      await pullModel('llama3.2:1b', (percent, status) => {
        if (percent) {
          sendStatus(`Downloading AI model... ${percent}%`, percent)
        } else {
          sendStatus(status || 'Preparing model...', null)
        }
      })
    }

    sendStatus('AI Assistant is ready!', 100)
    return
  }

  // Step 2 — Check if Ollama is installed (by NSIS installer)
  const ollamaExe = getOllamaExePath()
  const isInstalled = fs.existsSync(ollamaExe)

  if (!isInstalled) {
    sendStatus('Ollama is not installed. Please re-run the installer with Ollama option selected.', null)
    return
  }

  // Step 3 — Start Ollama server
  sendStatus('Starting Ollama server...', 50)

  try {
    const ollamaProcess = spawn(ollamaExe, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })

    ollamaProcess.unref()

    // Give it time to start
    await new Promise(r => setTimeout(r, 3000))

  } catch (err) {
    console.error('Failed to start Ollama:', err)
    sendStatus('Failed to start Ollama server', null)
    return
  }

  // Step 4 — Wait for Ollama to be ready
  sendStatus('Waiting for Ollama server to be ready...', 60)

  const ready = await waitForOllama(30000)
  if (!ready) {
    sendStatus('Ollama server did not start in time', null)
    return
  }

  sendStatus('Ollama server is ready', 75)

  // Step 5 — Pull model if not already downloaded
  if (!(await isModelDownloaded('llama3.2:1b'))) {
    sendStatus('Downloading AI model (1.3GB) — this only happens once...', 80)

    await pullModel('llama3.2:1b', (percent, status) => {
      if (percent) {
        sendStatus(`Downloading AI model... ${percent}%`, 80 + Math.round(percent * 0.2))
      } else {
        sendStatus(status || 'Preparing model...', null)
      }
    })
  }

  sendStatus('AI Assistant is ready!', 100)
}

async function stopDb() {
  // Nothing to stop for SQLite
}

module.exports = { runDbSetup, runOllamaSetup, stopDb }