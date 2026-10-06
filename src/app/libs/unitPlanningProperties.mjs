// Shared by the Units API and semester planning. Server-side planning reads the
// same records directly, without a loopback HTTP request or client-supplied rules.
export const unitPlanningInclude = {
  unitType: true,
  UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: {
    include: {
      Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: {
        select: { ID: true, UnitCode: true, Name: true, CreditPoints: true },
      },
    },
    orderBy: { ID: 'asc' },
  },
  UnitTermOffered: {
    select: { ID: true, UnitID: true, TermType: true },
  },
};
