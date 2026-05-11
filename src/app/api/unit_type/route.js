import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { TokenValidation } from "@app/api/api_helper";

// GET Unit Types
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

        const { searchParams } = new URL(req.url);
        const params_name = searchParams.get('name');
        const params_ids = searchParams.get('ids');
        const order_by = searchParams.get('order_by');

        // Build orderBy
        let orderBy = undefined;
        if (order_by) {
            try {
                const parsed = JSON.parse(order_by);
                const allowed_columns = ['Name', 'Colour'];
                orderBy = parsed
                    .filter(entry =>
                        entry.column &&
                        allowed_columns.includes(entry.column) &&
                        typeof entry.ascending === 'boolean'
                    )
                    .map(entry => ({ [entry.column]: entry.ascending ? 'asc' : 'desc' }));
            } catch (err) {
                console.warn("Invalid order_by format:", err.message);
            }
        }

        // Parse IDs
        let ids = [];
        if (params_ids) {
            try {
                const parsed = JSON.parse(params_ids);
                ids = Array.isArray(parsed) ? parsed.map(id => Number(id)) : [Number(parsed)];
            } catch (err) {
                return NextResponse.json({ error: 'Invalid IDs format' }, { status: 400 });
            }
        }

        // Build where clause
        const where = {
            ...(params_name && { Name: { contains: params_name } }),
            ...(ids.length > 0 && { ID: { in: ids } })
        };

        // Query with include – do NOT use select, otherwise include is ignored
        const unitTypes = await prisma.UnitType.findMany({
            where,
            orderBy,
            include: { colors: true }   // include alternative colors relation
        });

        const totalCount = await prisma.UnitType.count({ where });

        // Transform to frontend‑friendly format
        const transformedData = unitTypes.map(u => ({
            ID: u.ID,
            Name: u.Name,
            Colour: u.Colour,
            colors: u.colors.map(c => c.color)   // array of hex strings
        }));

        return NextResponse.json({
            data: transformedData,
            pagination: {
                total: totalCount,
                page: 1,
                limit: totalCount,
                totalPages: 1
            }
        }, { status: 200 });
    } catch (error) {
        console.error('GET unit_type error:', error);
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
}

// ADD Unit Type
export async function POST(req) {
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

        let body;
        try {
            body = await req.json();
        } catch (err) {
            return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
        }

        const { Name, Colour, colors } = body;

        if (!Name) {
            return NextResponse.json({ message: 'Name is required' }, { status: 400 });
        }

        const existingUnitType = await prisma.UnitType.findFirst({
            where: { Name: { equals: Name } }
        });
        if (existingUnitType) {
            return NextResponse.json({ message: 'Unit type with this name already exists' }, { status: 409 });
        }

        if (Colour) {
            const colourExist = await prisma.UnitType.findFirst({ where: { Colour } });
            if (colourExist) {
                return NextResponse.json({ message: 'A unit with the same colour already exists' }, { status: 409 });
            }
        }

        // Create the unit type
        const newUnitType = await prisma.UnitType.create({
            data: {
                Name,
                Colour: Colour || '#000000'
            }
        });

        // Add alternative colors
        if (Array.isArray(colors) && colors.length > 0) {
            await prisma.unitTypeColor.createMany({
                data: colors.map(color => ({
                    unitTypeId: newUnitType.ID,
                    color: color
                }))
            });
        }

        // Fetch complete data with colors
        const unitTypeWithColors = await prisma.UnitType.findUnique({
            where: { ID: newUnitType.ID },
            include: { colors: true }
        });

        // Audit
        try {
            const user = await SecureSessionManager.authenticateUser(req);
            const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
            await AuditLogger.logCreate({
                userId: user?.id || null,
                email: actorEmail,
                module: 'unit_management',
                entity: 'UnitType',
                entityId: newUnitType.ID,
                after: unitTypeWithColors
            }, req);
        } catch (e) { console.warn('Audit failed:', e?.message); }

        return NextResponse.json({
            message: 'Unit type created successfully',
            unitType: {
                ID: unitTypeWithColors.ID,
                Name: unitTypeWithColors.Name,
                Colour: unitTypeWithColors.Colour,
                colors: unitTypeWithColors.colors.map(c => c.color)
            }
        }, { status: 201 });
    } catch (error) {
        console.error('POST unit_type error:', error);
        return NextResponse.json({ error: 'Failed to create unit type', details: error.message }, { status: 500 });
    }
}

// UPDATE Unit Type
export async function PUT(req) {
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

        let body;
        try {
            body = await req.json();
        } catch (err) {
            return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
        }

        const { ID, Name, Colour, colors } = body;

        if (!ID) {
            return NextResponse.json({ message: 'Unit type ID is required' }, { status: 400 });
        }

        const existingUnitType = await prisma.UnitType.findUnique({ where: { ID } });
        if (!existingUnitType) {
            return NextResponse.json({ message: 'Unit type not found' }, { status: 404 });
        }

        if (Name && Name !== existingUnitType.Name) {
            const nameExists = await prisma.UnitType.findFirst({ where: { Name } });
            if (nameExists) {
                return NextResponse.json({ message: 'Another unit type with this name already exists' }, { status: 409 });
            }
        }

        if (Colour && Colour !== existingUnitType.Colour) {
            const colourExist = await prisma.UnitType.findFirst({
                where: { Colour, ID: { not: ID } }
            });
            if (colourExist) {
                return NextResponse.json({ message: 'Another unit type with the same colour already exists' }, { status: 409 });
            }
        }

        // Update basic fields
        await prisma.UnitType.update({
            where: { ID },
            data: { Name, Colour }
        });

        // Replace alternative colors if provided
        if (colors !== undefined) {
            await prisma.$transaction([
                prisma.unitTypeColor.deleteMany({ where: { unitTypeId: ID } }),
                prisma.unitTypeColor.createMany({
                    data: (Array.isArray(colors) ? colors : []).map(color => ({
                        unitTypeId: ID,
                        color: color
                    }))
                })
            ]);
        }

        // Fetch final data with colors
        const finalUnitType = await prisma.UnitType.findUnique({
            where: { ID },
            include: { colors: true }
        });

        // Audit
        try {
            const user = await SecureSessionManager.authenticateUser(req);
            const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
            await AuditLogger.logUpdate({
                userId: user?.id || null,
                email: actorEmail,
                module: 'unit_management',
                entity: 'UnitType',
                entityId: ID,
                before: existingUnitType,
                after: finalUnitType
            }, req);
        } catch (e) { console.warn('Audit failed:', e?.message); }

        return NextResponse.json({
            message: 'Unit type updated successfully',
            unitType: {
                ID: finalUnitType.ID,
                Name: finalUnitType.Name,
                Colour: finalUnitType.Colour,
                colors: finalUnitType.colors.map(c => c.color)
            }
        }, { status: 200 });
    } catch (error) {
        console.error('PUT unit_type error:', error);
        return NextResponse.json({ error: 'Failed to update unit type', details: error.message }, { status: 500 });
    }
}

// DELETE Unit Type
export async function DELETE(request) {
    try {
        const isDevOverride = request.headers.get('x-dev-override') === 'true' &&
            process.env.NEXT_PUBLIC_MODE === 'DEV';

        if (!isDevOverride) {
            const authHeader = request.headers.get('Authorization');
            const token_res = TokenValidation(authHeader);
            if (!token_res.success) {
                return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
            }
            const sessionEmail = request.headers.get('x-session-email');
            if (!sessionEmail) {
                return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
            }
        }

        let body;
        try {
            body = await request.json();
        } catch (err) {
            return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
        }

        const { ID } = body;
        if (!ID) {
            return NextResponse.json({ success: false, message: 'Unit type ID is required' }, { status: 400 });
        }

        const unitType = await prisma.UnitType.findUnique({ where: { ID } });
        if (!unitType) {
            return NextResponse.json({ success: false, message: 'Unit type not found' }, { status: 404 });
        }

        const protectedNames = ['core', 'major', 'elective', 'mpu'];
        if (protectedNames.includes((unitType.Name || '').toLowerCase())) {
            return NextResponse.json({ success: false, message: `"${unitType.Name}" is a system unit type and cannot be deleted` }, { status: 400 });
        }

        const isUsedInPlanner = await prisma.UnitInSemesterStudyPlanner.findFirst({
            where: { UnitTypeID: ID }
        });
        const isUsedInAmendment = await prisma.StudentStudyPlannerAmmendments.findFirst({
            where: { NewUnitTypeID: ID }
        });
        if (isUsedInPlanner || isUsedInAmendment) {
            return NextResponse.json({ success: false, message: 'This unit type is being used and cannot be deleted' }, { status: 400 });
        }

        await prisma.UnitType.delete({ where: { ID } });

        // Audit
        try {
            const user = await SecureSessionManager.authenticateUser(request);
            const actorEmail = user?.email || request.headers.get('x-session-email') || undefined;
            await AuditLogger.logDelete({
                userId: user?.id || null,
                email: actorEmail,
                module: 'unit_management',
                entity: 'UnitType',
                entityId: ID,
                before: unitType
            }, request);
        } catch (e) { console.warn('Audit failed:', e?.message); }

        return NextResponse.json({ success: true, message: 'Unit type deleted successfully' }, { status: 200 });
    } catch (error) {
        console.error('DELETE unit_type error:', error);
        return NextResponse.json({ success: false, message: 'Failed to delete unit type', error: error.message }, { status: 500 });
    }
}