import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

export async function GET(req) {
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
            // Require actor email for auditability
            const sessionEmail = req.headers.get('x-session-email');
            if (!sessionEmail) {
                return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
            }
        }

        const searchParams = req.nextUrl.searchParams;
        const unit_id = searchParams.get("unit_id");
        const term_type = searchParams.get("term_type");
        const order_by = searchParams.get("order_by");
        const exclude_raw = searchParams.get("exclude");
        const return_fields = searchParams.get("return");

        // Parse exclude parameter
        let exclude = {};
        const allowed_attributes = ["ID", "UnitID", "TermType"];
        if (exclude_raw) {
            try {
                exclude = JSON.parse(exclude_raw);
            } catch (err) {
                console.warn("Invalid exclude format:", err.message);
            }
        }

        // Build where clause
        const where = {};
        if (unit_id) where.UnitID = parseInt(unit_id);
        if (term_type) where.TermType = term_type;

        // Add exclusions
        if (exclude.UnitID?.length) {
            where.UnitID = {
                ...(typeof where.UnitID === "object"
                    ? where.UnitID
                    : where.UnitID
                        ? { equals: where.UnitID }
                        : {}),
                notIn: exclude.UnitID,
            };
        }

        if (exclude.TermType?.length) {
            where.TermType = {
                ...(typeof where.TermType === "object"
                    ? where.TermType
                    : where.TermType
                        ? { equals: where.TermType }
                        : {}),
                notIn: exclude.TermType,
            };
        }

        // Build select clause
        let select = {
            ID: true,
            UnitID: true,
            TermType: true,
            Unit: true, // include relation
        };

        if (return_fields) {
            const fields = return_fields.split(",").map(f => f.trim());
            const filtered = fields.filter(f => allowed_attributes.includes(f));
            if (filtered.length > 0) {
                select = {};
                filtered.forEach(field => {
                    select[field] = true;
                });
            }
        }

        // Build orderBy clause
        let orderBy;
        if (order_by) {
            try {
                const orderParams = JSON.parse(order_by); // expecting array of { column, ascending }
                orderBy = orderParams
                    .filter(o => allowed_attributes.includes(o.column))
                    .map(o => ({ [o.column]: o.ascending ? "asc" : "desc" }));
            } catch (err) {
                console.warn("Invalid order_by format:", err.message);
            }
        }

        // Execute query
        const terms = await prisma.UnitTermOffered.findMany({
            where,
            select,
            ...(orderBy && { orderBy }),
        });

        return NextResponse.json(terms);
    } catch (error) {
        console.error("Error in GET /UnitTermOffered:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}