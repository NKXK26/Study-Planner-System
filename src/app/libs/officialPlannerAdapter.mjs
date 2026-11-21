export function adaptPublishedPlanningPool(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(planner => planner?.courseCode === 'BA-CS').map(planner => ({
    ...planner,
    units: (planner.units || []).map(unit => ({
      ...unit,
      UnitTermOffered: (unit.offeredTerms || []).map(TermType => ({ TermType, UnitID: unit.ID })),
      UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: (unit.requisites || []).map(requisite => ({
        UnitID: unit.ID,
        UnitRelationship: requisite.relationship,
        LogicalOperators: requisite.logicalOperator,
        MinCP: requisite.minCredits,
        RequisiteUnitID: requisite.unit?.ID,
        Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: requisite.unit,
      })),
    })),
  }));
}
