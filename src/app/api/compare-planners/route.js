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

export async function GET(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const url = new URL(req.url);
    const idA = parseInt(url.searchParams.get('a'), 10);
    const idB = parseInt(url.searchParams.get('b'), 10);

    // If no IDs, return all planners for the dropdown
    if (!idA && !idB) {
        const planners = await prisma.studyPlanner.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                studyPlannerUnits: {
                    include: { unit: true, unitType: true },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: planners.map(p => ({
                id: p.id,
                name: p.name,
                createdAt: p.createdAt,
                unitCount: p.studyPlannerUnits.length,
            })),
        });
    }

    if (isNaN(idA) || isNaN(idB)) {
        return NextResponse.json({ success: false, message: 'Invalid planner IDs' }, { status: 400 });
    }

    if (idA === idB) {
        return NextResponse.json({ success: false, message: 'Please select two different planners' }, { status: 400 });
    }

    // Fetch both planners
    const [plannerA, plannerB] = await Promise.all([
        prisma.studyPlanner.findUnique({
            where: { id: idA },
            include: {
                studyPlannerUnits: {
                    include: { unit: true, unitType: true },
                },
            },
        }),
        prisma.studyPlanner.findUnique({
            where: { id: idB },
            include: {
                studyPlannerUnits: {
                    include: { unit: true, unitType: true },
                },
            },
        }),
    ]);

    if (!plannerA) return NextResponse.json({ success: false, message: `Planner A (ID: ${idA}) not found` }, { status: 404 });
    if (!plannerB) return NextResponse.json({ success: false, message: `Planner B (ID: ${idB}) not found` }, { status: 404 });

    const formatUnits = (planner) =>
        planner.studyPlannerUnits.map(j => ({
            joinId: j.id,
            ID: j.unit.ID,
            UnitCode: j.unit.UnitCode,
            Name: j.unit.Name,
            CreditPoints: j.unit.CreditPoints,
            Availability: j.unit.Availability,
            unitTypeId: j.unitTypeId,
            unitType: j.unitType,
        }));

    const unitsA = formatUnits(plannerA);
    const unitsB = formatUnits(plannerB);

    const codesA = new Set(unitsA.map(u => u.UnitCode));
    const codesB = new Set(unitsB.map(u => u.UnitCode));

    // Diff logic
    const onlyInA = unitsA.filter(u => !codesB.has(u.UnitCode));       // removed in B
    const onlyInB = unitsB.filter(u => !codesA.has(u.UnitCode));       // added in B
    const inBoth = unitsA.filter(u => codesB.has(u.UnitCode));         // same in both

    // Check if unit type changed for shared units
    const unitTypeChanged = inBoth.filter(uA => {
        const uB = unitsB.find(u => u.UnitCode === uA.UnitCode);
        return uB && uA.unitTypeId !== uB.unitTypeId;
    }).map(uA => {
        const uB = unitsB.find(u => u.UnitCode === uA.UnitCode);
        return {
            ...uA,
            unitTypeIdB: uB.unitTypeId,
            unitTypeB: uB.unitType,
        };
    });

    return NextResponse.json({
        success: true,
        data: {
            plannerA: { id: plannerA.id, name: plannerA.name, createdAt: plannerA.createdAt, totalUnits: unitsA.length },
            plannerB: { id: plannerB.id, name: plannerB.name, createdAt: plannerB.createdAt, totalUnits: unitsB.length },
            summary: {
                totalA: unitsA.length,
                totalB: unitsB.length,
                onlyInA: onlyInA.length,
                onlyInB: onlyInB.length,
                inBoth: inBoth.length,
                unitTypeChanged: unitTypeChanged.length,
            },
            diff: {
                onlyInA,       // units removed in B
                onlyInB,       // units added in B
                inBoth,        // unchanged
                unitTypeChanged,
            },
        },
    });
}