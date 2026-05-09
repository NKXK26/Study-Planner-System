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

// GET /api/study-planner/[id]
export async function GET(req, { params }) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

    const planner = await prisma.studyPlanner.findUnique({
        where: { id },
        include: {
            studyPlannerUnits: {
                include: { unit: true, unitType: true },
            },
        },
    });

    if (!planner) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    return NextResponse.json({
        success: true,
        data: {
            id: planner.id,
            name: planner.name,
            createdAt: planner.createdAt,
            units: planner.studyPlannerUnits.map(j => ({
                joinId: j.id,
                ID: j.unit.ID,
                UnitCode: j.unit.UnitCode,
                Name: j.unit.Name,
                CreditPoints: j.unit.CreditPoints,
                Availability: j.unit.Availability,
                unitTypeId: j.unitTypeId,
                unitType: j.unitType,
            })),
        },
    });
}

// PUT /api/study-planner/[id]  — update unit types in a planner
export async function PUT(req, { params }) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

    let body;
    try { body = await req.json(); } catch {
        return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    // units: [{ joinId, unitTypeId }]
    const units = Array.isArray(body.units) ? body.units : [];

    try {
        // Update each StudyPlannerUnit's unitTypeId
        await Promise.all(
            units.map(({ joinId, unitTypeId }) =>
                prisma.studyPlannerUnit.update({
                    where: { id: joinId },
                    data: { unitTypeId: unitTypeId || null },
                })
            )
        );

        // Return updated planner
        const updated = await prisma.studyPlanner.findUnique({
            where: { id },
            include: {
                studyPlannerUnits: {
                    include: { unit: true, unitType: true },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                id: updated.id,
                name: updated.name,
                units: updated.studyPlannerUnits.map(j => ({
                    joinId: j.id,
                    ID: j.unit.ID,
                    UnitCode: j.unit.UnitCode,
                    Name: j.unit.Name,
                    unitTypeId: j.unitTypeId,
                    unitType: j.unitType,
                })),
            },
        });
    } catch (error) {
        console.error('PUT study-planner error:', error);
        return NextResponse.json({ success: false, message: 'Update failed', details: error.message }, { status: 500 });
    }
}