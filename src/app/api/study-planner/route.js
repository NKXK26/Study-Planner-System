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
        return NextResponse.json({ success: false, message: 'Invalid planner ID' }, { status: 400 });
    }

    const studyPlanners = await prisma.studyPlanner.findMany({
        where: id ? { id } : {},
        orderBy: { createdAt: 'desc' },
        include: {
            studyPlannerUnits: {
                include: { unit: true, unitType: true },
            },
            plannerTemplate: {                      // ✅ added
                include: {
                    requirements: {
                        include: { unitType: true },
                    },
                },
            },
        },
    });

    if (id && studyPlanners.length === 0) {
        return NextResponse.json({ success: false, message: 'Study planner not found' }, { status: 404 });
    }

    const transformed = studyPlanners.map(planner => ({
        id: planner.id,
        name: planner.name,
        createdAt: planner.createdAt,
        plannerTemplateId: planner.plannerTemplateId ?? null,
        plannerTemplate: planner.plannerTemplate,   // ✅ added
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

    return NextResponse.json({ success: true, count: studyPlanners.length, data: transformed });
}

export async function DELETE(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const url = new URL(req.url);
    const plannerId = url.searchParams.get('id');

    if (!plannerId) {
        return NextResponse.json({ success: false, message: 'Missing planner ID query parameter' }, { status: 400 });
    }

    const id = parseInt(plannerId, 10);
    if (isNaN(id)) {
        return NextResponse.json({ success: false, message: 'Invalid planner ID' }, { status: 400 });
    }

    try {
        const existing = await prisma.studyPlanner.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ success: false, message: 'Study planner not found' }, { status: 404 });
        }

        await prisma.studyPlanner.delete({ where: { id } });
        return NextResponse.json({ success: true, message: 'Study planner deleted successfully' });
    } catch (error) {
        console.error('❌ DELETE error:', error);
        return NextResponse.json({ success: false, message: 'Failed to delete study planner', details: error.message }, { status: 500 });
    }
}

export async function POST(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    try {
        let body;
        try {
            body = await req.json();
        } catch (error) {
            return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
        }

        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const units = Array.isArray(body.units) ? body.units : [];

        // Resolve plannerTemplateId: accept number or null, ignore anything else
        const plannerTemplateId = Number.isInteger(body.plannerTemplateId) && body.plannerTemplateId > 0
            ? body.plannerTemplateId
            : null;

        if (!name) {
            return NextResponse.json({ success: false, message: 'Study planner name is required' }, { status: 400 });
        }

        const existingPlanner = await prisma.studyPlanner.findFirst({ where: { name } });
        if (existingPlanner) {
            return NextResponse.json({
                success: false,
                message: 'A study planner with this name already exists. Please choose a different name.',
            }, { status: 400 });
        }

        if (units.length === 0) {
            return NextResponse.json({ success: false, message: 'At least one unit is required' }, { status: 400 });
        }

        // Validate plannerTemplateId exists if provided
        if (plannerTemplateId !== null) {
            const tpl = await prisma.plannerTemplate.findUnique({ where: { id: plannerTemplateId }, select: { id: true } });
            if (!tpl) {
                return NextResponse.json(
                    { success: false, message: `Planner template ID ${plannerTemplateId} does not exist.` },
                    { status: 400 }
                );
            }
        }

        // ─── Detect payload format ─────────────────────────────────────────────
        const isOldFormat = units[0] && typeof units[0].unitId === 'number';
        const isNewFormat = units[0] && typeof units[0].unitCode === 'string';

        let unitLinkData = [];

        // ─── Old format: { unitId, unitTypeId } ───────────────────────────────
        if (isOldFormat) {
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
            unitLinkData = units.map(({ unitId, unitTypeId }) => ({ unitId, unitTypeId }));
        }
        // ─── New format: { unitCode, name?, creditPoints?, unitTypeName } ─────
        else if (isNewFormat) {
            const allUnitTypes = await prisma.unitType.findMany({
                select: { ID: true, Name: true },
            });
            const typeNameToId = new Map(allUnitTypes.map(t => [t.Name.toLowerCase(), t.ID]));

            for (const unit of units) {
                const unitCode = unit.unitCode?.trim();
                if (!unitCode) {
                    return NextResponse.json({ success: false, message: 'Missing unitCode in one of the units' }, { status: 400 });
                }

                let unitTypeId = null;
                if (unit.unitTypeName) {
                    const typeName = unit.unitTypeName.trim();
                    const typeId = typeNameToId.get(typeName.toLowerCase());
                    if (!typeId) {
                        return NextResponse.json(
                            { success: false, message: `Unknown unit type "${typeName}". Please create it first.` },
                            { status: 400 }
                        );
                    }
                    unitTypeId = typeId;
                } else if (typeof unit.unitTypeId === 'number') {
                    unitTypeId = unit.unitTypeId;
                }

                const unitName = unit.name?.trim() || `Unknown: ${unitCode}`;
                const creditPoints = unit.creditPoints ? parseFloat(unit.creditPoints) : 12.5;

                let dbUnit = await prisma.unit.findFirst({
                    where: { UnitCode: unitCode },
                    select: { ID: true },
                });

                if (!dbUnit) {
                    dbUnit = await prisma.unit.create({
                        data: {
                            UnitCode: unitCode,
                            Name: unitName,
                            CreditPoints: creditPoints,
                            Availability: 'unpublished',
                        },
                        select: { ID: true },
                    });
                }

                unitLinkData.push({
                    unitId: dbUnit.ID,
                    unitTypeId: unitTypeId || null,
                });
            }
        }
        // ─── Unknown format ──────────────────────────────────────────────────
        else {
            return NextResponse.json(
                { success: false, message: 'Invalid unit format. Provide either { unitId, unitTypeId } or { unitCode, unitTypeName }' },
                { status: 400 }
            );
        }

        // ─── Create planner and join records ─────────────────────────────────
        const studyPlannerWithUnits = await prisma.studyPlanner.create({
            data: {
                name,
                plannerTemplateId,
                studyPlannerUnits: {
                    create: unitLinkData.map(({ unitId, unitTypeId }) => ({
                        unitId,
                        unitTypeId: unitTypeId || null,
                    })),
                },
            },
            include: {
                studyPlannerUnits: {
                    include: { unit: true, unitType: true },
                },
                plannerTemplate: {                      // ✅ also include on create response
                    include: {
                        requirements: {
                            include: { unitType: true },
                        },
                    },
                },
            },
        });

        const responseData = {
            id: studyPlannerWithUnits.id,
            name: studyPlannerWithUnits.name,
            createdAt: studyPlannerWithUnits.createdAt,
            plannerTemplateId: studyPlannerWithUnits.plannerTemplateId ?? null,
            plannerTemplate: studyPlannerWithUnits.plannerTemplate,   // ✅ added
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

        return NextResponse.json({ success: true, data: responseData }, { status: 201 });
    } catch (error) {
        console.error('❌ Study planner POST error:', error.message || error);
        console.error('Full error:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Failed to create study planner',
                details: error.message || 'Unknown error',
                error: error.code,
            },
            { status: 500 }
        );
    }
}