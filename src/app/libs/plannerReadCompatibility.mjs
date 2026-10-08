// Older planner databases may predate optional scheduling metadata.
// Read existing fields without requiring a migration to list saved units.
export async function plannerUnitReadSelect(db) {
 const columns=await db.$queryRawUnsafe('PRAGMA table_info("StudyPlannerUnit")');
 const available=new Set(columns.map(c=>c.name));
 return {id:true,unitId:true,unitTypeId:true,unit:true,unitType:true,...Object.fromEntries(['plannedYear','plannedSemester','plannedDates','sortOrder'].filter(name=>available.has(name)).map(name=>[name,true]))};
}
