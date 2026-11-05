// Add scheduling metadata without replacing any existing planner records.
async function upgradePlannerSchema(db, beforeUpgrade = async () => {}) {
  const definitions = {
    plannedYear: 'INTEGER',
    plannedSemester: 'TEXT',
    plannedDates: 'TEXT',
    sortOrder: 'INTEGER NOT NULL DEFAULT 0',
  }
  const columns = await db.$queryRawUnsafe('PRAGMA table_info("StudyPlannerUnit")')
  if (!columns.length) throw new Error('Planner database is missing StudyPlannerUnit.')
  const missing = Object.keys(definitions).filter(name => !columns.some(column => column.name === name))
  if (!missing.length) return false
  await beforeUpgrade()
  await db.$transaction(async tx => {
    for (const name of missing) {
      await tx.$executeRawUnsafe(`ALTER TABLE "StudyPlannerUnit" ADD COLUMN "${name}" ${definitions[name]}`)
    }
  })
  return true
}

module.exports = { upgradePlannerSchema }
