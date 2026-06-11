// app/api/unit_type/route.js
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
 * GET /api/unit_type
 * Returns all unit types (ID, Name, Colour) → transforms to { id, name, colour }
 */
export async function GET(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    try {
        // Use correct uppercase field names from the model
        const unitTypes = await prisma.unitType.findMany({
            select: {
                ID: true,
                Name: true,
                Colour: true,
            },
            orderBy: { Name: 'asc' },
        });

        // Transform to camelCase for the frontend
        const formatted = unitTypes.map(t => ({
            id: t.ID,
            name: t.Name,
            colour: t.Colour,
        }));

        return NextResponse.json({
            success: true,
            data: formatted,
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

        // Check for duplicate (case‑insensitive) – use Name field
        const existing = await prisma.unitType.findFirst({
            where: { Name: { equals: name.trim(), mode: 'insensitive' } },
        });
        if (existing) {
            return NextResponse.json(
                { success: false, message: `Unit type "${name}" already exists` },
                { status: 409 }
            );
        }

        const newType = await prisma.unitType.create({
            data: {
                Name: name.trim(),
                Colour: colour || '#cccccc',
            },
            select: { ID: true, Name: true, Colour: true },
        });

        return NextResponse.json({
            success: true,
            data: { id: newType.ID, name: newType.Name, colour: newType.Colour },
        }, { status: 201 });
    } catch (error) {
        console.error('POST /api/unit_type error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to create unit type', error: error.message },
            { status: 500 }
        );
    }
}