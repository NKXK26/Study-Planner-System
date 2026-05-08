const path = require('path')
const fs = require('fs')

async function runDbSetup() {
  const { app } = require('electron')

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

module.exports = { runDbSetup }