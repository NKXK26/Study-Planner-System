import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

// GET Units in Semester Study Planner
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
		const params = new URL(req.url).searchParams;

		const params_id = params.get('id');
		const params_semester_id = params.get('semester_in_study_planner_year_id');
		const params_unit_code = params.get('unit_code');
		const return_attributes = params.get('return');
		const order_by = params.get('order_by');
		const exclude_raw = params.get('exclude');

		// Handle exclude
		let exclude = {};
		if (exclude_raw) {
			try {
				exclude = JSON.parse(exclude_raw);
			} catch (err) {
				console.warn("Invalid exclude format:", err.message);
			}
		}

		// Handle order_by
		let orderBy = undefined;
		if (order_by) {
			try {
				const parsed = JSON.parse(order_by);
				const allowed_columns = ['ID', 'UnitTypeID', 'UnitCode', 'SemesterInStudyPlannerYearID'];

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

		// Handle return fields
		let select = undefined;
		if (return_attributes) {
			const allowed_attributes = ['ID', 'UnitTypeID', 'UnitCode', 'SemesterInStudyPlannerYearID'];
			const fields = return_attributes
				.split(',')
				.map(f => f.trim())
				.filter(f => allowed_attributes.includes(f));

			if (fields.length > 0) {
				select = {};
				fields.forEach(field => {
					select[field] = true;
				});
			}
		}

		// Parse semester_in_study_planner_year_id as single number or array
		let semesterFilter = {};
		if (params_semester_id) {
			try {
				const parsed = JSON.parse(params_semester_id);
				if (Array.isArray(parsed)) {
					semesterFilter = { SemesterInStudyPlannerYearID: { in: parsed.map(Number) } };
				} else {
					semesterFilter = { SemesterInStudyPlannerYearID: Number(parsed) };
				}
			} catch {
				// Treat as plain number string
				semesterFilter = { SemesterInStudyPlannerYearID: Number(params_semester_id) };
			}
		}

		// Build where filter
		const where = {
			...(params_id ? { ID: parseInt(params_id) } : {}),
			...semesterFilter,
			...(params_unit_code ? { UnitCode: { contains: params_unit_code } } : {}),
			...(exclude.ID?.length ? { ID: { notIn: exclude.ID } } : {}),
		};

		const units = await prisma.UnitInSemesterStudyPlanner.findMany({
			where,
			...(select && { select }),
			...(orderBy && { orderBy }),
		});

		return new NextResponse(JSON.stringify(units), {
			status: 200,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
		});
	} catch (error) {
		console.error('GET error:', error);
		return NextResponse.json({ error: 'Failed to fetch units', details: error.message }, { status: 500 });
	}
}

// POST - Create new UnitInSemesterStudyPlanner
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
			// Require actor email for auditability
			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const data = await req.json();
		console.log(data)
		const units = Array.isArray(data) ? data : [data];


		// Validate all entries in the array
		for (const unit of units) {
			if (unit.SemesterInStudyPlannerYearID === null || unit.SemesterInStudyPlannerYearID === undefined) {
				return NextResponse.json(
					{
						success: false,
						message: 'SemesterInStudyPlannerYearID is required for all units'
					},
					{ status: 400 }
				);
			}


			// Check if semester exists
			const semester = await prisma.SemesterInStudyPlannerYear.findUnique({
				where: { ID: unit.SemesterInStudyPlannerYearID }
			});

			if (!semester) {
				return NextResponse.json(
					{
						success: false,
						message: `Semester with ID ${unit.SemesterInStudyPlannerYearID} does not exist`
					},
					{ status: 400 }
				);
			}
		}


		// Create all units in a transaction
		const new_units = await prisma.$transaction(
			units.map(unit =>
				prisma.UnitInSemesterStudyPlanner.create({
					data: {
						UnitTypeID: unit.UnitTypeID,
						UnitCode: unit.UnitCode,
						SemesterInStudyPlannerYearID: unit.SemesterInStudyPlannerYearID
					},
					select: {
						ID: true,
						UnitTypeID: true,
						UnitCode: true,
						SemesterInStudyPlannerYearID: true
					}
				})
			)
		);

		return NextResponse.json({
			success: true,
			message: 'Units added successfully',
			data: new_units,
			ids: new_units.map(unit => unit.ID)
		}, { status: 201 });

	} catch (error) {
		console.error('POST error:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to add units',
				message: error.message
			},
			{ status: 500 }
		);
	}
}

// PUT - Update existing UnitInSemesterStudyPlanner
export async function PUT(req) {
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
		const data = await req.json();
		const units = Array.isArray(data) ? data : [data];

		// Validate all entries in the array
		for (const unit of units) {
			if (!unit.ID) {
				return NextResponse.json(
					{
						success: false,
						message: 'ID is required for all units'
					},
					{ status: 400 }
				);
			}

			// Check if unit exists
			const existingUnit = await prisma.UnitInSemesterStudyPlanner.findUnique({
				where: { ID: unit.ID }
			});

			if (!existingUnit) {
				return NextResponse.json(
					{
						success: false,
						message: `Unit with ID ${unit.ID} does not exist`
					},
					{ status: 404 }
				);
			}
		}

		// Update all units in a transaction
		await prisma.$transaction(
			units.map(unit =>
				prisma.UnitInSemesterStudyPlanner.update({
					where: { ID: unit.ID },
					data: {
						UnitTypeID: unit.UnitTypeID,
						UnitCode: unit.UnitCode,
					}
				})
			)
		);

		return NextResponse.json({
			success: true,
			message: 'Units updated successfully'
		});

	} catch (error) {
		console.error('PUT error:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to update units',
				message: error.message
			},
			{ status: 500 }
		);
	}
}

// DELETE - Delete a UnitInSemesterStudyPlanner
export async function DELETE(req) {
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
		const { id } = await req.json();

		if (!id) {
			return NextResponse.json({ message: 'ID is required to delete' }, { status: 400 });
		}

		await prisma.UnitInSemesterStudyPlanner.delete({
			where: { ID: id }
		});

		return NextResponse.json({ message: 'Unit deleted successfully' }, { status: 200 });
	} catch (error) {
		console.error('DELETE error:', error);
		return NextResponse.json({ error: 'Failed to delete unit', details: error.message }, { status: 500 });
	}
}
