import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
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

			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const params = req.nextUrl.searchParams;

		const params_id = params.get('id');
		const params_status = params.get('status');
		const params_term_id = params.get('term_id');
		const params_major_id = params.get('major_id');
		const order_by = params.get('order_by');
		const return_attributes = params.get('return');
		const exclude_raw = params.get('exclude');

		// Parse exclude
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
				const allowed_columns = ['ID', 'Status', 'TermID', 'MajorID'];

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

		// Handle return attributes
		let select = undefined;
		if (return_attributes) {
			const allowed_attributes = ['ID', 'Status', 'TermID', 'MajorID', 'Term', 'Major'];
			const fields = return_attributes
				.split(',')
				.map(f => f.trim())
				.filter(f => allowed_attributes.includes(f));

			if (fields.length > 0) {
				select = {};
				fields.forEach(field => {
					if (field === 'Term') {
						select.Term = {
							select: {
								ID: true,
								Name: true,
								Year: true,
								Month: true,
								Status: true,
								SemType: true,
							},
						};
					} else if (field === 'Major') {
						select.Major = {
							select: {
								ID: true,
								CourseID: true,
								CourseCode: true,
								Name: true,
								Status: true,
							},
						};
					} else {
						// Scalar fields
						select[field] = true;
					}
				});
			}
		}

		// Build where query with exclude logic
		const where = {
			...(params_id ? {
				ID: {
					equals: Number(params_id),
					...(exclude.ID?.length ? { notIn: exclude.ID } : {})
				}
			} : (exclude.ID?.length ? { ID: { notIn: exclude.ID } } : {})),

			...(params_status && params_status !== 'all' ? {
				Status: {
					equals: params_status,
					...(exclude.Status?.length ? { notIn: exclude.Status } : {})
				}
			} : (exclude.Status?.length ? { Status: { notIn: exclude.Status } } : {})),

			...(params_term_id ? {
				TermID: {
					in: params_term_id.split(',').map(id => Number(id.trim())),
					...(exclude.TermID?.length ? { notIn: exclude.TermID } : {})
				}
			} : (exclude.TermID?.length ? { TermID: { notIn: exclude.TermID } } : {})),

			...(params_major_id ? {
				MajorID: {
					equals: Number(params_major_id),
					...(exclude.MajorID?.length ? { notIn: exclude.MajorID } : {})
				}
			} : (exclude.MajorID?.length ? { MajorID: { notIn: exclude.MajorID } } : {})),
		};

		const query = {
			where,
			...(select && { select }),
			...(orderBy && { orderBy }),
		};

		const courseIntakeListing = await prisma.CourseIntake.findMany(query);

		if (courseIntakeListing.length === 0) {
			return NextResponse.json({ message: 'No course intakes found' }, { status: 404 });
		}

		return new NextResponse(JSON.stringify(courseIntakeListing), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		});
	} catch (error) {
		console.error('Error: ', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
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

			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const data = await req.json();

		// Prepare an array to store the records to be inserted
		const recordsToInsert = [];

		// Loop through each item in the data array
		for (const item of data) {
			const { major_id, term_id, status } = item;

			// Ensure major_id and term_id are integers
			const majorIdInt = parseInt(major_id, 10);
			const termIdInt = parseInt(term_id, 10);

			if (isNaN(majorIdInt) || isNaN(termIdInt)) {
				return NextResponse.json(
					{ message: 'Invalid MajorID or TermID.' },
					{ status: 400 }
				);
			}

			// Check if MajorID and TermID combination already exists
			const existingCourseIntake = await prisma.CourseIntake.findFirst({
				where: {
					MajorID: majorIdInt,
					TermID: termIdInt,
				},
			});

			if (existingCourseIntake) {
				return NextResponse.json(
					{ message: `Some of the terms already exist within this major.` },
					{ status: 400 }
				);
			}

			// Add the record to the array
			recordsToInsert.push({
				MajorID: majorIdInt,
				TermID: termIdInt,
				Status: status,
			});
		}

		// If there are records to insert, use createMany
		if (recordsToInsert.length > 0) {
			const res = await prisma.$transaction(async (tx) => {
				const created_intakes = await tx.CourseIntake.createMany({
					data: recordsToInsert,
					skipDuplicates: true,
				});

				const created_intakes_ID = await tx.CourseIntake.findMany({
					where: {
						OR: recordsToInsert.map(r => ({
							MajorID: r.MajorID,
							TermID: r.TermID,
						})),
					},
					include: {
						Term: true
					}
				});

				const data_to_insert_master_study_planner = created_intakes_ID.map((intake) => ({
					CourseIntakeID: intake.ID,
					Status: 'Empty',
				}));

				const add_master_study_planner_res = await Promise.all(
					data_to_insert_master_study_planner.map((planner) =>
						tx.masterStudyPlanner.create({ data: planner })
					)
				);

				const semester_data_to_add = add_master_study_planner_res.map((planner) => {
					// find the matching intake by CourseIntakeID
					const intake = created_intakes_ID.find(i => i.ID === planner.CourseIntakeID);

					return {
						MasterStudyPlannerID: planner.ID,
						Year: 1,
						SemType: intake?.Term.SemType || null, // safe access
					};
				});

				const add_semester_data_res = await tx.semesterInStudyPlannerYear.createMany({
					data: semester_data_to_add,
				});

				return {
					status: 200,
					success: true,
					message: "Intakes added successfully",
					created_intakes: created_intakes_ID,
				};
			});

			const createdIntakes = res.created_intakes;
			// AUDIT CREATE
			try {
				const user = await SecureSessionManager.authenticateUser(req);
				const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
				await AuditLogger.logCreate({
					userId: user?.id || null,
					email: actorEmail,
					module: 'course_management',
					entity: 'CourseIntake',
					entityId: `Batch of ${recordsToInsert.length}`,
					after: recordsToInsert,
					metadata: { count: recordsToInsert.length }
				});
			} catch (e) {
				console.warn('Audit CREATE CourseIntake failed:', e?.message);
			}

			return NextResponse.json(createdIntakes, {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store',
				},
			});
		} else {
			return NextResponse.json(
				{ message: 'No valid records to insert.' },
				{ status: 400 }
			);
		}
	} catch (error) {
		console.error('Error: ', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}

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

			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const data = await req.json();

		if (!data) {
			return NextResponse.json(
				{ error: 'Invalid data format' },
				{ status: 400 }
			);
		}

		// Check if this is a batch update request
		if (data.intakes && Array.isArray(data.intakes)) {
			// Get existing intakes before update for audit
			const intakeIds = data.intakes.filter(i => i.is_existing && i.is_modified).map(i => i._id);
			const existingIntakes = await prisma.CourseIntake.findMany({
				where: { ID: { in: intakeIds } }
			});

			// Use transaction for batch updates
			const result = await prisma.$transaction(async (tx) => {
				const updates = [];
				for (const intake of data.intakes) {
					const { _id, status, is_existing, is_modified } = intake;
					if (is_existing && is_modified) {
						const update = tx.courseIntake.update({
							where: { ID: _id },
							data: { Status: status.toLowerCase() },
						});
						updates.push(update);
					}
				}
				return await Promise.all(updates);
			});

			// AUDIT UPDATE
			try {
				const user = await SecureSessionManager.authenticateUser(req);
				const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
				await AuditLogger.logUpdate({
					userId: user?.id || null,
					email: actorEmail,
					module: 'course_management',
					entity: 'CourseIntake',
					entityId: `Batch of ${result.length}`,
					before: existingIntakes,
					after: result,
					metadata: { count: result.length }
				});
			} catch (e) {
				console.warn('Audit UPDATE CourseIntake failed:', e?.message);
			}

			return NextResponse.json(
				{ message: 'Course Intakes updated successfully', updatedCount: result.length },
				{ status: 200 }
			);
		} else if (data.intake && Array.isArray(data.intake)) {
			// Get existing intakes before update for audit
			const intakeIds = data.intake.filter(i => i.is_existing && i.is_modified).map(i => i._id);
			const existingIntakes = await prisma.CourseIntake.findMany({
				where: { ID: { in: intakeIds } }
			});

			// Handle single update (backward compatibility)
			const result = await prisma.$transaction(async (tx) => {
				const updates = [];
				for (const intake of data.intake) {
					const { _id, status, is_existing, is_modified } = intake;
					if (is_existing && is_modified) {
						const update = tx.courseIntake.update({
							where: { ID: _id },
							data: { Status: status.toLowerCase() },
						});
						updates.push(update);
					}
				}
				return await Promise.all(updates);
			});

			// AUDIT UPDATE
			try {
				const user = await SecureSessionManager.authenticateUser(req);
				const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
				await AuditLogger.logUpdate({
					userId: user?.id || null,
					email: actorEmail,
					module: 'course_management',
					entity: 'CourseIntake',
					entityId: `Batch of ${result.length}`,
					before: existingIntakes,
					after: result,
					metadata: { count: result.length }
				});
			} catch (e) {
				console.warn('Audit UPDATE CourseIntake failed:', e?.message);
			}

			return NextResponse.json(
				{ message: 'Course Intakes updated successfully', updatedCount: result.length },
				{ status: 200 }
			);
		} else {
			return NextResponse.json(
				{ error: 'Invalid data format' },
				{ status: 400 }
			);
		}
	} catch (error) {
		console.error('Error: ', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}

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

			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const data = await req.json();

		if (!data || !Array.isArray(data.ids)) {
			return NextResponse.json(
				{ error: 'Invalid data format' },
				{ status: 400 }
			);
		}

		// First check if there are any students associated with these intakes
		const studentsWithIntakes = await prisma.Student.findMany({
			where: {
				IntakeID: {
					in: data.ids
				}
			}
		});

		if (studentsWithIntakes.length > 0) {
			return NextResponse.json(
				{
					error: 'Cannot delete course intakes that have students enrolled',
					message: 'Please remove all students from these intakes first'
				},
				{ status: 400 }
			);
		}

		// Get existing intakes before delete for audit
		const existingIntakes = await prisma.CourseIntake.findMany({
			where: { ID: { in: data.ids } }
		});

		// If no students are associated, proceed with deletion
		await prisma.CourseIntake.deleteMany({
			where: {
				ID: {
					in: data.ids,
				},
			},
		});

		// AUDIT DELETE
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logDelete({
				userId: user?.id || null,
				email: actorEmail,
				module: 'course_management',
				entity: 'CourseIntake',
				entityId: `Batch of ${data.ids.length}`,
				before: existingIntakes,
				metadata: { count: data.ids.length, ids: data.ids }
			});
		} catch (e) {
			console.warn('Audit DELETE CourseIntake failed:', e?.message);
		}

		return NextResponse.json(
			{ message: 'Course Intakes deleted successfully' },
			{ status: 200 }
		);

	} catch (error) {
		console.error('Error: ', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}