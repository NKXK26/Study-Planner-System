import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

//GET SEMESTER IN STUDY PLANNER YEAR
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
		const params_master_study_planner_id = params.get('master_study_planner_id');
		const params_year = params.get('year');
		const params_sem_type = params.get('sem_type');
		const return_attributes = params.get('return');
		const order_by = params.get('order_by');
		const exclude_raw = params.get('exclude');

		// Parse exclude if exists
		let exclude = {};
		if (exclude_raw) {
			try {
				exclude = JSON.parse(exclude_raw);
			} catch (err) {
				console.warn("Invalid exclude format:", err.message);
			}
		}

		// Convert stringified order_by into Prisma format
		let orderBy = undefined;
		const allowed_columns = ['ID', 'MasterStudyPlannerID', 'Year', 'SemType'];
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

		// Select fields
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

		// Build Prisma filter query
		const where = {
			...(params_id ? {
				ID: {
					equals: parseInt(params_id),
					...(exclude.ID?.length ? { notIn: exclude.ID } : {})
				}
			} : (exclude.ID?.length ? { ID: { notIn: exclude.ID } } : {})),

			...(params_master_study_planner_id ? {
				MasterStudyPlannerID: {
					equals: parseInt(params_master_study_planner_id),
					...(exclude.MasterStudyPlannerID?.length ? { notIn: exclude.MasterStudyPlannerID } : {})
				}
			} : (exclude.MasterStudyPlannerID?.length ? { MasterStudyPlannerID: { notIn: exclude.MasterStudyPlannerID } } : {})),

			...(params_year ? {
				Year: {
					equals: parseInt(params_year),
					...(exclude.Year?.length ? { notIn: exclude.Year } : {})
				}
			} : (exclude.Year?.length ? { Year: { notIn: exclude.Year } } : {})),

			...(params_sem_type ? {
				SemType: {
					equals: params_sem_type,
					...(exclude.SemType?.length ? { notIn: exclude.SemType } : {})
				}
			} : (exclude.SemType?.length ? { SemType: { notIn: exclude.SemType } } : {}))
		};

		// Final query
		const query = {
			where,
			...(orderBy && { orderBy }),
			...(select && { select })
		};

		console.log('query', query)

		// Fetch semester data from Prisma
		const semester_listing = await prisma.SemesterInStudyPlannerYear.findMany(query);

		if (semester_listing.length === 0) {
			return new NextResponse(JSON.stringify(semester_listing), {
				status: 200,
				message: "No semesters found",
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store',
				},
			})
		}

		return new NextResponse(JSON.stringify(semester_listing), {
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

//ADD SEMESTER IN STUDY PLANNER YEAR
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
			// Require actor email for auditability
			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const data = await req.json();
		const semesters = Array.isArray(data) ? data : [data];

		// Validate all entries in the array
		for (const semester of semesters) {
			// Validate required fields
			if (!semester.master_study_planner_id || !semester.year || !semester.sem_type) {
				return NextResponse.json(
					{
						success: false,
						message: 'Missing required fields: master_study_planner_id, year, and sem_type are required'
					},
					{ status: 400 }
				);
			}

			// Validate SemType
			const validSemTypes = ['Long Semester', 'Short Semester'];
			if (!validSemTypes.includes(semester.sem_type)) {
				return NextResponse.json(
					{
						success: false,
						message: 'Invalid semester type. Must be either "Long Semester" or "Short Semester"'
					},
					{ status: 400 }
				);
			}

			// Validate Year is a positive integer
			const year = parseInt(semester.year);
			if (isNaN(year) || year <= 0) {
				return NextResponse.json(
					{
						success: false,
						message: 'Year must be a positive integer'
					},
					{ status: 400 }
				);
			}

			// Check if MasterStudyPlanner exists
			const masterStudyPlanner = await prisma.MasterStudyPlanner.findUnique({
				where: {
					ID: semester.master_study_planner_id
				}
			});

			if (!masterStudyPlanner) {
				return NextResponse.json(
					{
						success: false,
						message: 'Master Study Planner does not exist'
					},
					{ status: 400 }
				);
			}

			// Check existing semesters for the same year and master study planner
			const existingSemesters = await prisma.SemesterInStudyPlannerYear.findMany({
				where: {
					MasterStudyPlannerID: semester.master_study_planner_id,
					Year: year
				}
			});

			// Count existing semesters of the same type
			const sameTypeCount = existingSemesters.filter(
				sem => sem.SemType === semester.sem_type
			).length;

			// Check if we already have 2 semesters of the same type for this year
			if (sameTypeCount >= 2) {
				return NextResponse.json(
					{
						success: false,
						message: `Cannot add more ${semester.sem_type}s. Maximum of 2 per year allowed.`
					},
					{ status: 400 }
				);
			}
		}

		// Create all semesters in a transaction
		const new_semesters = await prisma.$transaction(
			semesters.map(semester =>
				prisma.SemesterInStudyPlannerYear.create({
					data: {
						MasterStudyPlannerID: semester.master_study_planner_id,
						Year: parseInt(semester.year),
						SemType: semester.sem_type
					},
					select: {
						ID: true,
						MasterStudyPlannerID: true,
						Year: true,
						SemType: true
					}
				})
			)
		);

		return NextResponse.json({
			success: true,
			message: 'Semesters added successfully',
			data: new_semesters,
			ids: new_semesters.map(semester => semester.ID)
		});

	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to process the request',
				message: error.message
			},
			{ status: 500 }
		);
	}
}

//UPDATE SEMESTER IN STUDY PLANNER YEAR
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
			// Require actor email for auditability
			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const data = await req.json();
		const semesters = Array.isArray(data) ? data : [data];

		// Update each semester
		for (const semester of semesters) {
			const { id, year, sem_type } = semester;

			// Validate required fields
			if (!id || !year || !sem_type) {
				return NextResponse.json(
					{
						success: false,
						message: 'Missing required fields: id, year, and sem_type are required'
					},
					{ status: 400 }
				);
			}

			// Validate SemType
			const validSemTypes = ['Long Semester', 'Short Semester'];
			if (!validSemTypes.includes(sem_type)) {
				return NextResponse.json(
					{
						success: false,
						message: 'Invalid semester type. Must be either "Long Semester" or "Short Semester"'
					},
					{ status: 400 }
				);
			}

			// Validate Year is a positive integer
			const yearInt = parseInt(year);
			if (isNaN(yearInt) || yearInt <= 0) {
				return NextResponse.json(
					{
						success: false,
						message: 'Year must be a positive integer'
					},
					{ status: 400 }
				);
			}

			// Check if semester exists
			const existingSemester = await prisma.SemesterInStudyPlannerYear.findUnique({
				where: { ID: id }
			});

			if (!existingSemester) {
				return NextResponse.json(
					{
						success: false,
						message: `Semester with ID ${id} does not exist`
					},
					{ status: 404 }
				);
			}

			// Check existing semesters for the same year and master study planner
			const existingSemesters = await prisma.SemesterInStudyPlannerYear.findMany({
				where: {
					MasterStudyPlannerID: existingSemester.MasterStudyPlannerID,
					Year: yearInt,
					ID: { not: id } // Exclude current semester
				}
			});

			// Count existing semesters of the same type
			const sameTypeCount = existingSemesters.filter(
				sem => sem.SemType === sem_type
			).length;

			// Check if we already have 2 semesters of the same type for this year
			if (sameTypeCount >= 2) {
				return NextResponse.json(
					{
						success: false,
						message: `Cannot update to ${sem_type}. Maximum of 2 per year allowed.`
					},
					{ status: 400 }
				);
			}
		}

		// Update all semesters in a transaction
		await prisma.$transaction(
			semesters.map(semester =>
				prisma.SemesterInStudyPlannerYear.update({
					where: { ID: semester.id },
					data: {
						Year: parseInt(semester.year),
						SemType: semester.sem_type
					}
				})
			)
		);

		return NextResponse.json({
			success: true,
			message: 'Semesters updated successfully'
		});

	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to process the request',
				message: error.message
			},
			{ status: 500 }
		);
	}
}

//DELETE SEMESTER IN STUDY PLANNER YEAR
export async function DELETE(req) {
	try {
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
		const ids = params.get('ids');

		if (!ids) {
			return NextResponse.json(
				{
					success: false,
					message: 'IDs parameter is required'
				},
				{ status: 400 }
			);
		}

		// Parse the array of IDs
		const idArray = JSON.parse(ids);

		if (!Array.isArray(idArray) || idArray.length === 0) {
			return NextResponse.json(
				{
					success: false,
					message: 'Invalid IDs format. Must be a non-empty array.'
				},
				{ status: 400 }
			);
		}

		// Convert all IDs to numbers
		const numericIds = idArray.map(id => Number(id));

		// Check if all semesters exist
		const existingSemesters = await prisma.SemesterInStudyPlannerYear.findMany({
			where: { ID: { in: numericIds } }
		});

		if (existingSemesters.length !== numericIds.length) {
			return NextResponse.json(
				{
					success: false,
					message: 'One or more semesters not found'
				},
				{ status: 404 }
			);
		}

		// Delete all semesters
		await prisma.SemesterInStudyPlannerYear.deleteMany({
			where: { ID: { in: numericIds } }
		});

		return NextResponse.json({
			success: true,
			message: 'Semesters deleted successfully'
		});

	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to process the request',
				message: error.message
			},
			{ status: 500 }
		);
	}
}