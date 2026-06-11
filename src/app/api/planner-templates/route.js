// app/api/planner-templates/route.js
import { NextResponse } from 'next/server';
import prisma from '@utils/db/db';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';

/**
 * Validate authenticated request (same as study-planner route)
 */
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

/**
 * Get or create a UnitType ID by name.
 * Handles case‑insensitive lookup and creates if missing.
 * Uses the actual database field names: Name, ID, Colour.
 */
async function getOrCreateUnitTypeIdByName(name) {
  // Use findFirst (not findUnique) because Name is not a unique index
  let unitType = await prisma.unitType.findFirst({
    where: { Name: name },
  });

  if (!unitType) {
    // Case‑insensitive fallback (SQLite doesn't support mode: 'insensitive')
    const all = await prisma.unitType.findMany();
    unitType = all.find(t => t.Name.toLowerCase() === name.toLowerCase());
  }

  if (unitType) return unitType.ID;

  // Create new UnitType
  const newUnitType = await prisma.unitType.create({
    data: { Name: name, Colour: null },
  });
  return newUnitType.ID;
}
// GET /api/planner-templates
export async function GET(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    try {
        const templates = await prisma.plannerTemplate.findMany({
            include: {
                requirements: {
                    include: { unitType: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Transform to frontend format: { id, name, createdAt, updatedAt, requirements: { "Core": 10, ... } }
        const formatted = templates.map(tpl => ({
            id: tpl.id,
            name: tpl.name,
            createdAt: tpl.createdAt,
            updatedAt: tpl.updatedAt,
            requirements: tpl.requirements.reduce((acc, req) => {
                acc[req.unitType.Name] = req.requiredCount;
                return acc;
            }, {}),
        }));

        return NextResponse.json({ success: true, data: formatted });
    } catch (error) {
        console.error('GET /api/planner-templates error:', error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

// POST /api/planner-templates
export async function POST(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    try {
        let body;
        try {
            body = await req.json();
        } catch (err) {
            return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
        }

        const { name, requirements } = body;

        if (!name || !requirements || typeof requirements !== 'object') {
            return NextResponse.json(
                { success: false, message: 'Missing name or requirements' },
                { status: 400 }
            );
        }

        // Resolve unit type IDs outside transaction
        const reqEntries = Object.entries(requirements);
        const unitTypeMap = new Map();
        for (const [unitTypeName] of reqEntries) {
            const id = await getOrCreateUnitTypeIdByName(unitTypeName);
            unitTypeMap.set(unitTypeName, id);
        }

        const result = await prisma.$transaction(async (tx) => {
            const template = await tx.plannerTemplate.create({
                data: { name },
            });

            const requirementData = reqEntries.map(([unitTypeName, requiredCount]) => ({
                plannerTemplateId: template.id,
                unitTypeId: unitTypeMap.get(unitTypeName),
                requiredCount: Number(requiredCount),
            }));

            if (requirementData.length) {
                await tx.plannerTemplateRequirement.createMany({ data: requirementData });
            }

            return template;
        }, { timeout: 10000 });

        return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (error) {
        console.error('POST /api/planner-templates error:', error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

// PUT /api/planner-templates
export async function PUT(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    try {
        let body;
        try {
            body = await req.json();
        } catch (err) {
            return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
        }

        const { id, name, requirements } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'Missing id' },
                { status: 400 }
            );
        }

        // Resolve unit type IDs outside transaction
        const reqEntries = Object.entries(requirements || {});
        const unitTypeMap = new Map();
        for (const [unitTypeName] of reqEntries) {
            const unitTypeId = await getOrCreateUnitTypeIdByName(unitTypeName);
            unitTypeMap.set(unitTypeName, unitTypeId);
        }

        const result = await prisma.$transaction(async (tx) => {
            const template = await tx.plannerTemplate.update({
                where: { id },
                data: { name, updatedAt: new Date() },
            });

            // Delete old requirements
            await tx.plannerTemplateRequirement.deleteMany({
                where: { plannerTemplateId: id },
            });

            // Insert new ones
            const requirementData = reqEntries.map(([unitTypeName, requiredCount]) => ({
                plannerTemplateId: id,
                unitTypeId: unitTypeMap.get(unitTypeName),
                requiredCount: Number(requiredCount),
            }));

            if (requirementData.length) {
                await tx.plannerTemplateRequirement.createMany({ data: requirementData });
            }

            return template;
        }, { timeout: 10000 });

        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        console.error('PUT /api/planner-templates error:', error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

// DELETE /api/planner-templates?id=1
export async function DELETE(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    try {
        const { searchParams } = new URL(req.url);
        const id = parseInt(searchParams.get('id'));
        if (!id) {
            return NextResponse.json(
                { success: false, message: 'Missing id' },
                { status: 400 }
            );
        }

        await prisma.plannerTemplate.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE /api/planner-templates error:', error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}