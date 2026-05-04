const net = require('net')
const path = require('path')
const fs = require('fs')

let nextProcess = null

/**
 * Poll localhost:3000 until it accepts a connection or timeout.
 */
function waitForPort(port, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    const attempt = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' })
      socket.once('connect', () => { socket.destroy(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) {
          reject(new Error(`Port ${port} not ready after ${timeout}ms`))
        } else {
          setTimeout(attempt, 600)
        }
      })
    }
    attempt()
  })
}

async function startNextServer() {
  const { app } = require('electron')
  const isProd = app.isPackaged

  const nodeBin = isProd
    ? path.join(process.resourcesPath, 'node', 'node.exe')
    : process.execPath

  const serverEntry = isProd
    ? path.join(process.resourcesPath, 'app', 'server.js')
    : path.join(__dirname, '..', '.next', 'standalone', 'server.js')

  const appCwd = isProd
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..', '.next', 'standalone')

  const dbPath = path.join(app.getPath('userData'), 'planner.db')


  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '3000',
    HOSTNAME: '127.0.0.1',
    NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
    DATABASE_URL: `file:${dbPath}`,
    DIRECT_URL: `file:${dbPath}`,
    NEXT_PUBLIC_MODE: 'DEV',   // ← this enables the dev override bypass in all API routes
    SESSION_SECRET: 'local-desktop-secret-32-chars-xx',
    WHITELIST_MODE: 'false',
    DEFAULT_USER_GROUP_ID: '1',
    DEFAULT_USER_ROLE: 'Viewer',
    // ... rest of your env vars
  }

  const { spawn } = require('child_process')
  nextProcess = spawn(nodeBin, [serverEntry], {
    cwd: appCwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  nextProcess.stdout.on('data', d => console.log('[next]', d.toString().trim()))
  nextProcess.stderr.on('data', d => console.error('[next:err]', d.toString().trim()))

  await waitForPort(3000)
}

async function stopNextServer() {
  if (nextProcess) {
    nextProcess.kill('SIGTERM')
    nextProcess = null
  }
}

module.exports = { startNextServer, stopNextServer }