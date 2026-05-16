import prisma from '@utils/db/db';
import { NextResponse } from 'next/server';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';

async function validateAuthenticatedRequest(req) {
    const isDevOverride = req.headers.get('x-dev-override') === 'true' && process.env.NEXT_PUBLIC_MODE === 'DEV';
    if (isDevOverride) {
        return {
            user: {
                email: 'developer@dev.local',
                roles: ['Developer'],
                isActive: true,
            },
        };
    }

    const sessionEmail = req.headers.get('x-session-email');
    if (!sessionEmail) {
        return { error: NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 }) };
    }

    const user = await SecureSessionManager.authenticateUser(req);
    if (!user) {
        return { error: NextResponse.json({ success: false, message: 'Unauthorized user session' }, { status: 401 }) };
    }

    return { user };
}

export async function GET(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const url = new URL(req.url);
    const plannerId = url.searchParams.get('id');

    const id = plannerId ? parseInt(plannerId, 10) : null;

    if (plannerId && isNaN(id)) {
        return NextResponse.json(
            { success: false, message: 'Invalid planner ID' },
            { status: 400 }
        );
    }

    // Use the explicit join table StudyPlannerUnit
    const studyPlanners = await prisma.studyPlanner.findMany({
        where: id ? { id } : {},
        orderBy: { createdAt: 'desc' },
        include: {
            studyPlannerUnits: {
                include: {
                    unit: true,
                    unitType: true,
                },
            },
        },
    });

    if (id && studyPlanners.length === 0) {
        return NextResponse.json(
            { success: false, message: 'Study planner not found' },
            { status: 404 }
        );
    }

    // Transform to the old `units` structure for frontend compatibility
    const transformed = studyPlanners.map(planner => ({
        id: planner.id,
        name: planner.name,
        createdAt: planner.createdAt,
        units: planner.studyPlannerUnits.map(j => ({
            ID: j.unit.ID,
            UnitCode: j.unit.UnitCode,
            Name: j.unit.Name,
            CreditPoints: j.unit.CreditPoints,
            Availability: j.unit.Availability,
            unitTypeId: j.unitTypeId,
            unitType: j.unitType,
        })),
    }));

    return NextResponse.json({
        success: true,
        count: studyPlanners.length,
        data: transformed,
    });
}
export async function DELETE(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const url = new URL(req.url);
    const plannerId = url.searchParams.get('id');

    if (!plannerId) {
        return NextResponse.json(
            { success: false, message: 'Missing planner ID query parameter' },
            { status: 400 }
        );
    }

    const id = parseInt(plannerId, 10);
    if (isNaN(id)) {
        return NextResponse.json(
            { success: false, message: 'Invalid planner ID' },
            { status: 400 }
        );
    }

    try {
        // Check if planner exists
        const existing = await prisma.studyPlanner.findUnique({
            where: { id },
        });

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Study planner not found' },
                { status: 404 }
            );
        }

        // Delete the planner (cascade delete should remove associated StudyPlannerUnit records)
        await prisma.studyPlanner.delete({
            where: { id },
        });

        return NextResponse.json({
            success: true,
            message: 'Study planner deleted successfully',
        });
    } catch (error) {
        console.error('❌ DELETE error:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Failed to delete study planner',
                details: error.message,
            },
            { status: 500 }
        );
    }
}
export async function POST(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) {
        return authResult.error;
    }

    try {
        let body;
        try {
            body = await req.json();
        } catch (error) {
            return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
        }

        const name = typeof body.name === 'string' ? body.name.trim() : '';
        // New payload: { name, units: [{ unitId, unitTypeId }] }
        const units = Array.isArray(body.units) ? body.units : [];

        if (!name) {
            return NextResponse.json({ success: false, message: 'Study planner name is required' }, { status: 400 });
        }

        const existingPlanner = await prisma.studyPlanner.findFirst({
            where: { name },
        });

        if (existingPlanner) {
            return NextResponse.json({
                success: false,
                message: 'A study planner with this name already exists. Please choose a different name.',
            }, { status: 400 });
        }

        if (units.length === 0) {
            return NextResponse.json({ success: false, message: 'At least one unit is required' }, { status: 400 });
        }

        // Validate that all unitIds exist
        const unitIds = units.map(u => u.unitId).filter(id => Number.isInteger(id) && id > 0);
        const validUnits = await prisma.unit.findMany({
            where: { ID: { in: unitIds } },
            select: { ID: true },
        });
        const validUnitIds = new Set(validUnits.map(u => u.ID));
        const missingUnitIds = unitIds.filter(id => !validUnitIds.has(id));
        if (missingUnitIds.length > 0) {
            return NextResponse.json(
                { success: false, message: `Invalid unit IDs: ${missingUnitIds.join(', ')}` },
                { status: 400 }
            );
        }

        // Create the planner and its join records
        const studyPlannerWithUnits = await prisma.studyPlanner.create({
            data: {
                name,
                studyPlannerUnits: {
                    create: units.map(({ unitId, unitTypeId }) => ({
                        unitId,
                        unitTypeId: unitTypeId || null, // default to null if not provided
                    })),
                },
            },
            include: {
                studyPlannerUnits: {
                    include: {
                        unit: true,
                        unitType: true,
                    },
                },
            },
        });

        // Transform the response to the old format for consistency
        const responseData = {
            id: studyPlannerWithUnits.id,
            name: studyPlannerWithUnits.name,
            createdAt: studyPlannerWithUnits.createdAt,
            units: studyPlannerWithUnits.studyPlannerUnits.map(j => ({
                ID: j.unit.ID,
                UnitCode: j.unit.UnitCode,
                Name: j.unit.Name,
                CreditPoints: j.unit.CreditPoints,
                Availability: j.unit.Availability,
                unitTypeId: j.unitTypeId,
                unitType: j.unitType,
            })),
        };

        return NextResponse.json({
            success: true,
            data: responseData,
        }, { status: 201 });
    } catch (error) {
        console.error('❌ Study planner POST error:', error.message || error);
        console.error('Full error:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Failed to create study planner',
                details: error.message || 'Unknown error',
                error: error.code
            },
            { status: 500 }
        );
    }
}