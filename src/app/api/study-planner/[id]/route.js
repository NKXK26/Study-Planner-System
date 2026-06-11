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

    const [planner, templates] = await Promise.all([
        prisma.studyPlanner.findUnique({
            where: { id },
            include: {
                studyPlannerUnits: {
                    include: { unit: true, unitType: true },
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
    ]);

    if (!planner) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    return NextResponse.json({
        success: true,
        data: {
            id: planner.id,
            name: planner.name,
            createdAt: planner.createdAt,
            plannerTemplateId: planner.plannerTemplateId ?? null,
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
        // Optionally update the planner's linked template
        if (templateIdProvided) {
            await prisma.studyPlanner.update({
                where: { id },
                data: { plannerTemplateId },
            });
        }

        // Update each StudyPlannerUnit's unitTypeId
        if (units.length > 0) {
            await Promise.all(
                units.map(({ joinId, unitTypeId }) =>
                    prisma.studyPlannerUnit.update({
                        where: { id: joinId },
                        data: { unitTypeId: unitTypeId ? parseInt(unitTypeId) : null },
                    })
                )
            );
        }

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
                plannerTemplateId: updated.plannerTemplateId ?? null,
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