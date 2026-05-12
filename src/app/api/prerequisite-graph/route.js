import { NextResponse } from 'next/server';
import prisma from '@utils/db/db';
import { TokenValidation } from '@app/api/api_helper';

export async function GET(req) {
    try {
        const isDevOverride = req.headers.get('x-dev-override') === 'true' && process.env.NEXT_PUBLIC_MODE === 'DEV';
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

        const url = new URL(req.url);
        const highlightParam = url.searchParams.get('highlight'); // comma-separated unit codes to highlight

        // Fetch all units that are involved in any prerequisite relationship
        const involvedUnits = await prisma.$queryRaw`
            SELECT DISTINCT u.ID, u.UnitCode, u.Name, u.CreditPoints
            FROM Unit u
            WHERE u.ID IN (
                SELECT RequisiteUnitID FROM UnitRequisiteRelationship WHERE RequisiteUnitID IS NOT NULL
                UNION
                SELECT UnitID FROM UnitRequisiteRelationship WHERE UnitID IS NOT NULL
            )
        `;

        const units = involvedUnits.map(u => ({
            id: u.UnitCode,
            label: u.UnitCode,
            name: u.Name,
            creditPoints: u.CreditPoints,
        }));

        // Fetch all prerequisite relationships
        const relations = await prisma.unitRequisiteRelationship.findMany({
            where: {
                RequisiteUnitID: { not: null },
                UnitID: { not: null },
                UnitRelationship: { not: 'min' },
            },
            select: { RequisiteUnitID: true, UnitID: true },
        });

        const idToCode = new Map(involvedUnits.map(u => [u.ID, u.UnitCode]));
        const edges = [];
        for (const rel of relations) {
            const from = idToCode.get(rel.RequisiteUnitID);
            const to = idToCode.get(rel.UnitID);
            if (from && to) {
                edges.push({ source: from, target: to });
            }
        }

        const highlightSet = highlightParam ? new Set(highlightParam.split(',')) : new Set();

        return NextResponse.json({
            success: true,
            nodes: units,
            edges: edges,
            highlight: Array.from(highlightSet),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}