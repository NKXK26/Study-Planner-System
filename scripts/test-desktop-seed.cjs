const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { setupDatabase } = require('../electron/setup-db')

const root = path.resolve(__dirname, '..')
const working = path.join(root, 'prisma', 'app.db')
const manifest = require('../build-resources/desktop-reference.json')
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function python(code, ...args) {
  return execFileSync('python', ['-B', '-c', code, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
}
function seed(action, target) {
  return JSON.parse(python(
    'import json,sys; from pathlib import Path; from scripts.desktop_seed import process_seed; print(json.dumps(process_seed(sys.argv[1],Path(sys.argv[2]))))',
    action, target))
}
function sql(file, statement) {
  return python('import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); print(db.execute(sys.argv[2]).fetchall()); db.commit(); db.close()', file, statement)
}

test('packaging filters exclude private files from every copy path', () => {
  const yaml = require('js-yaml')
  const { FileMatcher } = require('app-builder-lib/out/fileMatcher')
  const config = yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'))
  const candidates = [
    'prisma/app.db', 'prisma/app.db-wal', 'prisma/backup.sqlite', 'supabase_dump.sql',
    '.env', 'public/uploads/document.xlsx', 'public/images/transcript.png',
    'electron/backup.db', 'scripts/seed-demo-admin.mjs',
    '.next-electron/standalone/.env', '.next-electron/standalone/prisma/app.db',
    '.next-electron/standalone/.next-electron/server/cache.db',
    '.next-electron/static/backup.db',
  ]
  const sources = [{ from: '.', filter: config.files }, ...config.extraResources]
  function included(file) {
    return sources.some(({ from, filter }) => {
      const base = path.resolve(root, from)
      const absolute = path.join(root, file)
      if (absolute === base) return true
      if (!absolute.startsWith(base + path.sep)) return false
      return new FileMatcher(base, base, value => value, filter ?? ['**/*'])
        .createFilter()(absolute, { isDirectory: () => false })
    })
  }
  for (const file of candidates) assert.equal(included(file), false, file)
  for (const file of ['build-resources/seed/planner-seed.db', 'public/images/favicon.png',
    '.next-electron/standalone/server.js', '.next-electron/standalone/node_modules/.prisma/client/index.js']) {
    assert.equal(included(file), true, file)
  }
  assert.equal(config.beforePack, './scripts/verify-desktop-seed.js')
})

test('desktop seed and upgrade privacy', async t => {
  const before = fs.existsSync(working) ? hash(working) : null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-seed-test-'))
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    assert.equal(fs.existsSync(working) ? hash(working) : null, before, 'working database changed')
  })
  const file = path.join(dir, 'reference.db')
  const counts = seed('generate', file)

  await t.test('seed has reference data and every other table is empty', () => {
    for (const [table, rows] of Object.entries(manifest)) {
      assert.ok(rows.length > 0)
      assert.equal(counts[table], rows.length)
    }
    for (const table of ['Student', 'UnitHistory', 'users', 'user_roles', 'user_profiles', 'audit_logs',
      'StudentStudyPlannerAmmendments', 'MasterStudyPlanner', 'StudyPlanner', 'PlannerTemplate']) {
      assert.equal(counts[table], 0, table)
    }
    for (const [table, count] of Object.entries(counts)) {
      if (!(table in manifest)) assert.equal(count, 0, table)
    }
    assert.equal(sql(file, 'SELECT Name FROM roles'), "[('Viewer',)]")
  })

  await t.test('independent generation is byte-identical and passes validation', () => {
    const second = path.join(dir, 'second.db')
    seed('generate', second)
    assert.equal(hash(file), hash(second))
    assert.deepEqual(seed('validate', file), counts)
  })

  await t.test('validator rejects a private row and changed content with unchanged counts', () => {
    const dirty = path.join(dir, 'dirty.db')
    fs.copyFileSync(file, dirty)
    sql(dirty, "INSERT INTO audit_logs(Action,Module,UpdatedAt) VALUES ('fixture','test',0)")
    assert.throws(() => seed('validate', dirty), /Unexpected row count in audit_logs: 1/)
    fs.copyFileSync(file, dirty)
    sql(dirty, "UPDATE UnitType SET Name='fixture' WHERE ID=(SELECT MIN(ID) FROM UnitType)")
    assert.throws(() => seed('validate', dirty), /differs from the clean reference build/)
  })

  await t.test('fresh install copies seed and an older installation retains its data and backup', async () => {
    const profile = path.join(dir, 'user')
    const db = path.join(profile, 'planner.db')
    const version = path.join(profile, 'db_version.txt')
    await setupDatabase(profile, file, root)
    assert.equal(hash(db), hash(file))
    sql(db, "INSERT INTO audit_logs(Action,Module,UpdatedAt) VALUES ('fixture','test',0)")
    sql(db, 'ALTER TABLE StudyPlannerUnit DROP COLUMN plannedYear')
    fs.writeFileSync(version, '5')
    const original = hash(db)
    const absent = path.join(dir, 'no-bundled-seed.db')
    await setupDatabase(profile, absent, root)
    assert.equal(hash(path.join(profile, 'planner.backup.v5.db')), original)
    assert.equal(fs.readFileSync(version, 'utf8'), '6')
    assert.equal(sql(db, 'SELECT count(*) FROM audit_logs'), '[(1,)]')
    assert.equal(sql(db, "SELECT count(*) FROM pragma_table_info('StudyPlannerUnit') WHERE name='plannedYear'"), '[(1,)]')
    const upgraded = hash(db)
    await setupDatabase(profile, absent, root)
    assert.equal(hash(db), upgraded)
  })
})
