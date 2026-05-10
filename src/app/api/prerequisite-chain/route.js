import prisma from '@utils/db/db';
import { NextResponse } from 'next/server';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';

async function validateAuthenticatedRequest(req) {
    const isDevOverride = req.headers.get('x-dev-override') === 'true' && process.env.NEXT_PUBLIC_MODE === 'DEV';
    if (isDevOverride) return { user: { email: 'developer@dev.local', roles: ['Developer'], isActive: true } };

    const sessionEmail = req.headers.get('x-session-email');
    if (!sessionEmail) return { error: NextResponse.json({ success: false, message: 'Missing authentication header' }, { status: 401 }) };

    const user = await SecureSessionManager.authenticateUser(req);
    if (!user) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };

    return { user };
}

// Recursively build prerequisite tree
async function buildTree(unitId, visited = new Set()) {
    if (visited.has(unitId)) return null;
    visited.add(unitId);

    const unit = await prisma.unit.findUnique({
        where: { ID: unitId },
        select: { ID: true, UnitCode: true, Name: true, CreditPoints: true, Availability: true },
    });

    if (!unit) return null;

    // Find all prerequisites for this unit — no UnitRelationship filter
    const prereqRelations = await prisma.unitRequisiteRelationship.findMany({
        where: { UnitID: unitId },
        include: {
            Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: {
                select: { ID: true, UnitCode: true, Name: true, CreditPoints: true },
            },
        },
    });

    // Separate min CP requirements from actual unit prerequisites
    const minCPRequirement = prereqRelations.find(r => r.UnitRelationship === 'min');
    const unitPrereqs = prereqRelations.filter(r => r.UnitRelationship !== 'min' && r.RequisiteUnitID !== null);

    const prerequisites = [];
    for (const rel of unitPrereqs) {
        const prereqUnit = rel.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit;
        if (prereqUnit) {
            const child = await buildTree(prereqUnit.ID, new Set(visited));
            if (child) {
                prerequisites.push({
                    ...child,
                    relationship: rel.UnitRelationship,
                    logicalOperator: rel.LogicalOperators,
                    minCP: rel.MinCP,
                });
            }
        }
    }

    return {
        ID: unit.ID,
        UnitCode: unit.UnitCode,
        Name: unit.Name,
        CreditPoints: unit.CreditPoints,
        Availability: unit.Availability,
        minCPRequired: minCPRequirement?.MinCP ?? null,  // ← global min CP to enroll
        prerequisites,
    };
}
export async function GET(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const url = new URL(req.url);
    const code = url.searchParams.get('code')?.trim().toUpperCase();

    // No code — return all units for dropdown
    if (!code) {
        const units = await prisma.unit.findMany({
            orderBy: { UnitCode: 'asc' },
            select: { ID: true, UnitCode: true, Name: true },
        });
        return NextResponse.json({ success: true, data: units });
    }

    const unit = await prisma.unit.findFirst({
        where: { UnitCode: code },
        select: { ID: true },
    });

    if (!unit) {
        return NextResponse.json({ success: false, message: `Unit "${code}" not found` }, { status: 404 });
    }

    const tree = await buildTree(unit.ID);

    // Also find units that require THIS unit (dependents)
    const dependentRelations = await prisma.unitRequisiteRelationship.findMany({
        where: { RequisiteUnitID: unit.ID },
        include: {
            Unit_UnitRequisiteRelationship_UnitIDToUnit: {
                select: { ID: true, UnitCode: true, Name: true },
            },
        },
    });

    const requiredBy = dependentRelations
        .map(r => r.Unit_UnitRequisiteRelationship_UnitIDToUnit)
        .filter(Boolean);

    return NextResponse.json({
        success: true,
        data: {
            tree,
            requiredBy, // units that need this unit as a prerequisite
        },
    });
}