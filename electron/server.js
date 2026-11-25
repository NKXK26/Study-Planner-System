const net = require('node:net')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
let nextProcess = null
let starting = null

function availablePort(preferred = 3000) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', error => error.code === 'EADDRINUSE' && preferred ? availablePort(0).then(resolve, reject) : reject(error))
    probe.listen(preferred, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)) })
  })
}
function waitForServer(url, child, token, timeout = 60000) {
  return new Promise((resolve, reject) => {
    let done = false, timer, request
    const finish = error => {
      if (done) return
      done = true; clearTimeout(timer); request?.destroy()
      child.removeListener('error', onError); child.removeListener('exit', onExit)
      error ? reject(error) : resolve()
    }
    const onError = error => finish(new Error(`Could not launch the desktop server: ${error.message}`))
    const onExit = (code, signal) => finish(new Error(`Desktop server stopped before startup (code ${code}, signal ${signal || 'none'}).`))
    child.once('error', onError); child.once('exit', onExit)
    const deadline = Date.now() + timeout
    const retry = () => {
      if (done) return
      clearTimeout(timer)
      if (Date.now() >= deadline) return finish(new Error('The desktop server did not become ready within 60 seconds.'))
      timer = setTimeout(attempt, 250)
    }
    const attempt = () => {
      if (done) return
      request = http.get(url + '/api/desktop-health', { headers: { 'x-desktop-token': token, Connection: 'close' } }, res => {
        let data = ''; res.on('data', chunk => { data += chunk; if (data.length > 4096) request.destroy() })
        res.on('end', () => { let result; try { result = JSON.parse(data) } catch {};
          res.statusCode === 200 && result?.ready && result.token === token ? finish() : retry() })
        res.on('error', retry)
      })
      request.setTimeout(2000, () => request.destroy(new Error('Readiness request timed out')))
      request.on('error', retry)
    }
    if (child.exitCode != null) return onExit(child.exitCode)
    attempt()
  })
}
async function startNextServer() {
  if (starting) return starting
  starting = (async () => {
    const { app } = require('electron')
    const isProd = app.isPackaged
    const nodeBin = isProd ? path.join(process.resourcesPath, 'node', 'node.exe') : process.execPath
    const appCwd = isProd ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..', '.next', 'standalone')
    const serverEntry = path.join(appCwd, 'server.js')
    if (!fs.existsSync(serverEntry)) throw new Error('The desktop server build is missing. Run npm run build before starting Electron.')
    if (!fs.existsSync(nodeBin)) throw new Error('The bundled Node runtime is missing. Reinstall the application.')
    const port = await availablePort(), url = `http://127.0.0.1:${port}`, token = randomUUID()
    const dbPath = path.join(app.getPath('userData'), 'planner.db').replace(/\\/g, '/')
    const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1',
      ELECTRON_RUN_AS_NODE: '1', DESKTOP_SERVER_TOKEN: token, NEXT_PUBLIC_SERVER_URL: url,
      DATABASE_URL: `file:${dbPath}`, DIRECT_URL: `file:${dbPath}`, NEXT_PUBLIC_MODE: 'DEV',
      SESSION_SECRET: process.env.SESSION_SECRET || 'local-desktop-secret-32-chars-xx', WHITELIST_MODE: 'false',
      DEFAULT_USER_GROUP_ID: '1', DEFAULT_USER_ROLE: 'Viewer' }
    const child = nextProcess = spawn(nodeBin, [serverEntry], { cwd: appCwd, env, stdio: ['ignore','pipe','pipe'], windowsHide: true })
    child.stdout.on('data', d => console.log('[next]', d.toString().trim()))
    child.stderr.on('data', d => console.error('[next:err]', d.toString().trim()))
    try { await waitForServer(url, child, token) } catch (error) { child.kill(); nextProcess = null; throw error }
    return url
  })()
  try { return await starting } catch (error) { starting = null; throw error }
}
async function stopNextServer() {
  if (nextProcess) { nextProcess.kill('SIGTERM'); nextProcess = null }
  starting = null
}
module.exports = { startNextServer, stopNextServer, availablePort, waitForServer }
