import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";
export async function GET(req) {
    try {
        const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
            process.env.NEXT_PUBLIC_MODE === 'DEV';

        if (!isDevOverride) {
            const authHeader = req.headers.get('Authorization');
            const token_res = TokenValidation(authHeader);
            if (!token_res.success) {
                return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
            }
            const sessionEmail = req.headers.get('x-session-email');
            if (!sessionEmail) {
                return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
            }
        }

        const unitTypes = await prisma.unitType.findMany({
            include: { colors: true },
            orderBy: { Name: 'asc' }
        });

        const mappings = [];
        for (const ut of unitTypes) {
            if (ut.Colour) {
                mappings.push({
                    unitTypeId: ut.ID,
                    unitTypeName: ut.Name,
                    color: ut.Colour,
                    source: 'Primary'
                });
            }
            for (const alt of ut.colors) {
                mappings.push({
                    unitTypeId: ut.ID,
                    unitTypeName: ut.Name,
                    color: alt.color,
                    source: 'Alternative'
                });
            }
        }

        return NextResponse.json({ success: true, data: mappings }, { status: 200 });
    } catch (error) {
        console.error('GET /api/unit-type-color error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
export async function POST(req) {
    try {
        // Check for DEV override
        const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
            process.env.NEXT_PUBLIC_MODE === 'DEV';

        if (!isDevOverride) {
            const authHeader = req.headers.get('Authorization');
            const token_res = TokenValidation(authHeader);
            if (!token_res.success) {
                return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
            }
            // Also require session email for audit (optional but keep consistent)
            const sessionEmail = req.headers.get('x-session-email');
            if (!sessionEmail) {
                return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
            }
        }

        const { mappings } = await req.json();
        if (!Array.isArray(mappings) || mappings.length === 0) {
            return NextResponse.json({ success: false, message: 'Mappings array required' }, { status: 400 });
        }

        // Validate each mapping
        for (const m of mappings) {
            if (!m.color || !m.unitTypeId) {
                return NextResponse.json({ success: false, message: 'Each mapping must have color and unitTypeId' }, { status: 400 });
            }
            const unitType = await prisma.unitType.findUnique({ where: { ID: m.unitTypeId } });
            if (!unitType) {
                return NextResponse.json({ success: false, message: `Unit type ID ${m.unitTypeId} not found` }, { status: 400 });
            }
        }

        // Insert mappings, avoiding duplicates
        const results = [];
        for (const m of mappings) {
            try {
                const created = await prisma.unitTypeColor.create({
                    data: {
                        unitTypeId: m.unitTypeId,
                        color: m.color.toLowerCase()
                    }
                });
                results.push(created);
            } catch (err) {
                // Duplicate unique constraint (unitTypeId + color)
                if (err.code !== 'P2002') throw err;
            }
        }

        return NextResponse.json({ success: true, message: `${results.length} colors added` }, { status: 201 });
    } catch (error) {
        console.error('POST /api/unit-type-color error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}