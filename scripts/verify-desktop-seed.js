const { execFileSync } = require('node:child_process')
const path = require('node:path')

module.exports = function verifyDesktopSeed() {
  execFileSync('python', ['scripts/desktop_seed.py', 'validate'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  })
}
