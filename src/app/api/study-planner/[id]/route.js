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
// Returns planner + units + plannerTemplateId + all available templates (for selector)
export async function GET(req, { params }) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

    const [planner, templates, unitTypes] = await Promise.all([
        prisma.studyPlanner.findUnique({
            where: { id },
            include: {
                studyPlannerUnits: {
                    include: { unit: true, unitType: true },
                    orderBy: { id: 'asc' },
                },
            },
        }),
        // Fetch all templates with their unit types so the page can build the dropdown
        prisma.plannerTemplate.findMany({
            include: {
                requirements: {
                    include: { unitType: true },
                    orderBy: { id: 'asc' },
                },
            },
            orderBy: { name: 'asc' },
        }),
        prisma.unitType.findMany({
            select: { ID: true, Name: true, Colour: true },
            orderBy: { Name: 'asc' },
        }),
    ]);

    if (!planner) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    return NextResponse.json({
        success: true,
        data: {
            id: planner.id,
            name: planner.name,
            createdAt: planner.createdAt,
            plannerTemplateId: planner.plannerTemplateId ?? null,
            unitTypes,
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
            // All templates available for the selector
            templates: templates.map(t => ({
                id: t.id,
                name: t.name,
                // The unit types defined in this template's requirements
                unitTypes: t.requirements.map(r => ({
                    ID: r.unitType.ID,
                    Name: r.unitType.Name,
                    Colour: r.unitType.Colour,
                    requiredCount: r.requiredCount,
                })),
            })),
        },
    });
}

// PUT /api/study-planner/[id]
// Body: { units: [{ joinId, unitTypeId }], plannerTemplateId?: number | null }
export async function PUT(req, { params }) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

    let body;
    try { body = await req.json(); } catch {
        return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    const units = Array.isArray(body.units) ? body.units : [];
    // undefined means "don't touch it"; null means "clear it"; a number means "set it"
    const templateIdProvided = Object.prototype.hasOwnProperty.call(body, 'plannerTemplateId');
    const plannerTemplateId = templateIdProvided
        ? (body.plannerTemplateId ? parseInt(body.plannerTemplateId) : null)
        : undefined;

    try {
        // Validate ownership and apply the reviewed changes together, or roll back all of them.
        const updated = await prisma.$transaction(async tx => {
            const current = await tx.studyPlanner.findUnique({where:{id},include:{studyPlannerUnits:{orderBy:{id:'asc'}}}});
            const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
            if (!current) fail('Planner not found',404);
            if (body.expectedVersion && body.expectedVersion !== JSON.stringify({templateId:current.plannerTemplateId,units:current.studyPlannerUnits.map(u=>[u.id,u.unitTypeId])})) fail('This planner changed. Reload its details before saving.',409);
            if (new Set(units.map(u=>u.joinId)).size!==units.length || units.some(u=>!Number.isInteger(u.joinId)||!current.studyPlannerUnits.some(v=>v.id===u.joinId))) fail('A unit row does not belong to this planner. Reload its details.');
            if (units.some(u=>u.unitTypeId!=null && u.unitTypeId!=='' && (!Number.isInteger(Number(u.unitTypeId))||Number(u.unitTypeId)<=0))) fail('Invalid unit category.');
            const types = await tx.unitType.findMany({select:{ID:true}});
            if (units.some(u=>u.unitTypeId && !types.some(t=>t.ID===Number(u.unitTypeId)))) fail('Unit category no longer exists.');
            if (templateIdProvided && plannerTemplateId!==null && (!Number.isInteger(plannerTemplateId)||!(await tx.plannerTemplate.findUnique({where:{id:plannerTemplateId}})))) fail('Template not found.');
            if (templateIdProvided) await tx.studyPlanner.update({where:{id},data:{plannerTemplateId}});
            for (const u of units) await tx.studyPlannerUnit.update({where:{id:u.joinId},data:{unitTypeId:u.unitTypeId?Number(u.unitTypeId):null}});
            return tx.studyPlanner.findUnique({where:{id},include:{studyPlannerUnits:{include:{unit:true,unitType:true},orderBy:{id:'asc'}}}});
        });

        return NextResponse.json({
            success: true,
            data: {
                id: updated.id,
                name: updated.name,
                plannerTemplateId: updated.plannerTemplateId ?? null,
                units: updated.studyPlannerUnits.map(j => ({
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
    } catch (error) {
        console.error('PUT study-planner error:', error);
        return NextResponse.json({ success: false, message: error.status ? error.message : 'Update failed. Please retry.' }, { status: error.status || 500 });
    }
}
