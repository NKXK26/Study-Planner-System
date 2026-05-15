const path = require('path')
const fs = require('fs')

const SCHEMA_VERSION = 4

async function runDbSetup() {
  const { app } = require('electron')

  const isProd = app.isPackaged
  const userData = app.getPath('userData')
  const dbPath = path.join(userData, 'planner.db')
  const versionPath = path.join(userData, 'db_version.txt')

  const sourceDb = isProd
    ? path.join(process.resourcesPath, 'app', 'prisma', 'app.db')
    : path.join(__dirname, '..', 'prisma', 'app.db')

  console.log('sourceDb:', sourceDb)
  console.log('sourceDb exists:', fs.existsSync(sourceDb))
  console.log('dbPath:', dbPath)
  console.log('dbPath exists:', fs.existsSync(dbPath))

  fs.mkdirSync(userData, { recursive: true })

  const currentVersion = fs.existsSync(versionPath)
    ? parseInt(fs.readFileSync(versionPath, 'utf8').trim())
    : 0

  const dbMissing = !fs.existsSync(dbPath)
  const schemaOutdated = currentVersion < SCHEMA_VERSION

  if (dbMissing || schemaOutdated) {
    if (dbMissing) {
      console.log('First launch — copying bundled database...')
    } else {
      console.log(`Schema updated (v${currentVersion} → v${SCHEMA_VERSION}) — replacing database...`)
      // Optional: back up the old DB before replacing
      const backupPath = path.join(userData, `planner.backup.v${currentVersion}.db`)
      fs.copyFileSync(dbPath, backupPath)
      console.log('Old DB backed up to:', backupPath)
    }

    fs.copyFileSync(sourceDb, dbPath)
    fs.writeFileSync(versionPath, String(SCHEMA_VERSION))
    console.log('Done.')
  } else {
    console.log(`Database up to date (v${SCHEMA_VERSION}), skipping copy.`)
  }
}

module.exports = { runDbSetup }