import { plannerUnitReadSelect } from './plannerReadCompatibility.mjs';

export async function readLocalCatalogue(prisma,id=null) {
    const unitSelect=await plannerUnitReadSelect(prisma);
    const studyPlanners = await prisma.studyPlanner.findMany({
        where: id ? { id } : {},
        orderBy: { createdAt: 'desc' },
        include: {
            studyPlannerUnits: {
                select: {
                    ...unitSelect,
                    unit: {
                        include: {
                            UnitTermOffered: { select: { TermType: true } },
                            UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: {
                                select: {
                                    UnitRelationship: true,
                                    LogicalOperators: true,
                                    MinCP: true,
                                    Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: {
                                        select: { ID: true, UnitCode: true, Name: true },
                                    },
                                },
                            },
                        },
                    },
                    unitType: true,
                },
            },
            plannerTemplate: {
                include: {
                    requirements: {
                        include: { unitType: true },
                    },
                },
            },
        },
    });
    return studyPlanners.map(planner => ({
        id: planner.id,
        name: planner.name,
        createdAt: planner.createdAt,
        plannerTemplateId: planner.plannerTemplateId ?? null,
        plannerTemplate: planner.plannerTemplate,
        units: planner.studyPlannerUnits.map(j => ({
            ID: j.unit.ID,
            UnitCode: j.unit.UnitCode,
            Name: j.unit.Name,
            CreditPoints: j.unit.CreditPoints,
            Availability: j.unit.Availability,
            unitTypeId: j.unitTypeId,
            unitType: j.unitType,
            plannedYear: j.plannedYear,
            plannedSemester: j.plannedSemester,
            plannedDates: j.plannedDates,
            sortOrder: j.sortOrder,
            offeredTerms: j.unit.UnitTermOffered.map(term => term.TermType),
            requisites: j.unit.UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit.map(requisite => ({
                relationship: requisite.UnitRelationship,
                logicalOperator: requisite.LogicalOperators,
                minCredits: requisite.MinCP,
                unit: requisite.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit,
            })),
        })),
    }));

}
