// Next standalone does not copy these assets automatically. Desktop development
// must serve exactly the same assets as the installer.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, '.next', 'standalone');
if (!fs.existsSync(path.join(dest, 'server.js'))) throw new Error('Build the standalone server before preparing the desktop app.');
fs.cpSync(path.join(root, '.next', 'static'), path.join(dest, '.next', 'static'), { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(dest, 'public'), { recursive: true });
console.log('Standalone desktop static files prepared.');
