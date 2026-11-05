const path = require('path')
const fs = require('fs')

const SCHEMA_VERSION = 6

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

  // Existing v6 databases predate Maker's optional study-period columns.
  // Upgrade in place instead of bumping the version and replacing user data.
  const clientRoot = isProd ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..')
  const { PrismaClient } = require(path.join(clientRoot, 'node_modules', '@prisma', 'client'))
  const { upgradePlannerSchema } = require('./planner-schema')
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } } })
  try {
    const upgraded = await upgradePlannerSchema(db, async () => {
      const backupPath = path.join(userData, `planner.before-study-periods.${Date.now()}.db`)
      fs.copyFileSync(dbPath, backupPath)
      console.log('Planner database backed up to:', backupPath)
    })
    if (upgraded) console.log('Planner study-period columns added; existing records retained.')
  } finally {
    await db.$disconnect()
  }
}

module.exports = { runDbSetup }
