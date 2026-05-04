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

    const studyPlanners = await prisma.studyPlanner.findMany({
        where: id ? { id } : {},
        orderBy: { createdAt: 'desc' },
        include: {
            units: {
                select: {
                    ID: true,
                    UnitCode: true,
                    Name: true,
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

    return NextResponse.json({
        success: true,
        count: studyPlanners.length,
        data: studyPlanners,
    });
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
        const unitIds = Array.isArray(body.unitIds)
            ? body.unitIds.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0)
            : [];
        const unitCodes = Array.isArray(body.unitCodes)
            ? body.unitCodes.map((code) => String(code).trim().toUpperCase()).filter(Boolean)
            : [];

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

        if (unitIds.length === 0 && unitCodes.length === 0) {
            return NextResponse.json({ success: false, message: 'At least one unitId or unitCode is required' }, { status: 400 });
        }

        const uniqueUnitIds = Array.from(new Set(unitIds));
        const uniqueUnitCodes = Array.from(new Set(unitCodes));

        let units = [];
        if (uniqueUnitIds.length > 0) {
            units = await prisma.Unit.findMany({
                where: { ID: { in: uniqueUnitIds } },
            });
        }

        if (units.length === 0 && uniqueUnitCodes.length > 0) {
            units = await prisma.Unit.findMany({
                where: { UnitCode: { in: uniqueUnitCodes } },
            });
        }

        if (units.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No matching units found for the provided IDs or codes' },
                { status: 400 }
            );
        }

        const validUnits = Array.from(
            new Map(units.map((unit) => [unit.ID, unit])).values()
        );
        const missingCodes = uniqueUnitCodes.filter(
            (code) => !units.some((unit) => unit.UnitCode.toUpperCase() === code)
        );

        console.log('📊 Creating study planner:', { name, unitCount: validUnits.length });

        const studyPlannerWithUnits = await prisma.studyPlanner.create({
            data: {
                name,
                units: {
                    connect: validUnits.map((unit) => ({
                        ID: unit.ID,
                    })),
                },
            },
            include: {
                units: true,
            },
        });

        return NextResponse.json({
            success: true,
            data: studyPlannerWithUnits,
            missingCodes,
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
