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
		const params = req.nextUrl.searchParams;
		const params_id = params.get('id');
		const params_unit_id = params.get('unit_id');
		const params_requisite_unit_id = params.get('requisite_unit_id');
		const params_code = params.get('unit_code');
		const params_requisites_code = params.get('requisite_codes');
		const params_requisites_relationship = params.get('relationship');
		const params_operator = params.get('operator');
		const return_attributes = params.get('return');
		const order_by = params.get('order_by');
		const exclude_raw = params.get('exclude');

		let unit_codes = [];
		if (params_code) {
			try {
				unit_codes = JSON.parse(params_code); // try JSON array
				if (!Array.isArray(unit_codes)) {
					unit_codes = params_code.split(',').map(code => code.trim()); // fallback to CSV
				}
			} catch (err) {
				unit_codes = params_code.split(',').map(code => code.trim()); // fallback to CSV if JSON parsing fails
			}
		}

		let exclude = {};
		if (exclude_raw) {
			try {
				exclude = JSON.parse(exclude_raw);
			} catch (err) {
				console.warn("Invalid exclude format:", err.message);
			}
		}
		let orderBy = undefined;
		const allowed_columns = ['ID', 'UnitRelationship', 'LogicalOperators', 'MinCP', 'UnitID', 'RequisiteUnitID'];

		if (order_by) {
			try {
				const parsed = JSON.parse(order_by);
				orderBy = parsed
					.filter(entry =>
						entry.column &&
						allowed_columns.includes(entry.column) &&
						typeof entry.ascending === 'boolean'
					)
					.map(entry => ({
						[entry.column]: entry.ascending ? 'asc' : 'desc'
					}));
			} catch (err) {
				console.warn("Invalid order_by format:", err.message);
			}
		}

		let select = undefined;
		if (return_attributes) {
			const fields = return_attributes
				.split(',')
				.map(f => f.trim())
				.filter(f => allowed_columns.includes(f));

			if (fields.length > 0) {
				select = {};
				fields.forEach(field => {
					select[field] = true;
				});
			}
		}

		const where = {
			...(params_id
				? {
					ID: {
						...(params_id.includes(',')
							? { in: params_id.split(',').map(id => parseInt(id.trim())) }
							: { equals: parseInt(params_id) }),
						...(exclude.ID?.length ? { notIn: exclude.ID } : {}),
					},
				}
				: exclude.ID?.length
					? { ID: { notIn: exclude.ID } }
					: {}),

			...(params_unit_id
				? {
					UnitID: {
						equals: parseInt(params_unit_id),
						...(exclude.UnitID?.length ? { notIn: exclude.UnitID } : {}),
					},
				}
				: exclude.UnitID?.length
					? { UnitID: { notIn: exclude.UnitID } }
					: {}),

			...(params_requisite_unit_id
				? {
					RequisiteUnitID: {
						equals: parseInt(params_requisite_unit_id),
						...(exclude.RequisiteUnitID?.length ? { notIn: exclude.RequisiteUnitID } : {}),
					},
				}
				: exclude.RequisiteUnitID?.length
					? { RequisiteUnitID: { notIn: exclude.RequisiteUnitID } }
					: {}),

			...(params_requisites_relationship
				? {
					UnitRelationship: {
						equals: params_requisites_relationship,
						...(exclude.UnitRelationship?.length ? { notIn: exclude.UnitRelationship } : {}),
					},
				}
				: exclude.UnitRelationship?.length
					? { UnitRelationship: { notIn: exclude.UnitRelationship } }
					: {}),

			...(params_operator
				? {
					LogicalOperators: {
						equals: params_operator,
						...(exclude.LogicalOperators?.length ? { notIn: exclude.LogicalOperators } : {}),
					},
				}
				: exclude.LogicalOperators?.length
					? { LogicalOperators: { notIn: exclude.LogicalOperators } }
					: {}),
		};

		// Final query
		const query = {
			where,
			...(select && { select }),
			...(orderBy && { orderBy }),
			include: {
				Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: {
					select: { ID: true, UnitCode: true, Name: true },
				},
			},
		};

		const requisite_listing = await prisma.UnitRequisiteRelationship.findMany(query);
		if (requisite_listing.length === 0) {
			return NextResponse.json({ message: 'No Unit Requisite Relationship found', data: [] }, { status: 200 });
		}

		return new NextResponse(JSON.stringify(requisite_listing), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		});
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}