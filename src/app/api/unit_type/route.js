import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";

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
 * GET /api/unit_type
 * Returns all unit types (id, name, colour)
 */
export async function GET(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    try {
        const unitTypes = await prisma.unitType.findMany({
            select: { id: true, name: true, colour: true },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({
            success: true,
            data: unitTypes,
        });
    } catch (error) {
        console.error('GET /api/unit_type error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch unit types', error: error.message },
            { status: 500 }
        );
    }
}

/**
 * POST /api/unit_type
 * Creates a new unit type
 * Body: { name: string, colour?: string }
 */
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

        const { name, colour } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ success: false, message: 'Unit type name is required' }, { status: 400 });
        }

        // Check for duplicate (case‑insensitive)
        const existing = await prisma.unitType.findFirst({
            where: { name: { equals: name.trim(), mode: 'insensitive' } },
        });
        if (existing) {
            return NextResponse.json(
                { success: false, message: `Unit type "${name}" already exists` },
                { status: 409 }
            );
        }

        const newType = await prisma.unitType.create({
            data: {
                name: name.trim(),
                colour: colour || '#cccccc',
            },
            select: { id: true, name: true, colour: true },
        });

        return NextResponse.json({
            success: true,
            data: { id: newType.id, name: newType.name, colour: newType.colour },
        }, { status: 201 });
    } catch (error) {
        console.error('POST /api/unit_type error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to create unit type', error: error.message },
            { status: 500 }
        );
    }
}