const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const nextBuild = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
const bundledNode = path.join(projectRoot, 'build-resources', 'node', 'node.exe')
const buildNode = process.platform === 'win32' && fs.existsSync(bundledNode) ? bundledNode : process.execPath
const seedPath = path.join(projectRoot, 'build-resources', 'seed', 'planner-seed.db')
const seed = spawnSync('python', ['scripts/desktop_seed.py', 'generate'], { cwd: projectRoot, stdio: 'inherit' })
if (seed.error) throw seed.error
if (seed.status !== 0) process.exit(seed.status ?? 1)
const databaseUrl = 'file:' + seedPath.split(path.sep).join('/')
const result = spawnSync(buildNode, ['--max-old-space-size=8196', nextBuild, 'build'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    NODE_ENV: 'production',
    ELECTRON_BUILD: '1',
    NEXT_PUBLIC_MODE: 'PROD',
    NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
  },
})

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

const requiredPaths = [
  '.next-electron/standalone/server.js',
  '.next-electron/standalone/package.json',
  '.next-electron/standalone/node_modules/@prisma/client',
  '.next-electron/standalone/node_modules/.prisma/client',
  '.next-electron/static',
  'public',
  'build-resources/seed/planner-seed.db',
  'build-resources/node/node.exe',
]
const missing = requiredPaths.filter(relativePath => !fs.existsSync(path.join(projectRoot, relativePath)))
if (missing.length) {
  console.error(`Electron packaging inputs are missing: ${missing.join(', ')}`)
  process.exit(1)
}
require('./verify-desktop-seed')()
