import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import AuditLogger from '@app/class/Audit/AuditLogger';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { TokenValidation } from "@app/api/api_helper";

// GET STUDENT STUDY PLANNER AMENDMENTS
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

		// Get query parameters
		const params_id = params.get('id');
		const params_student_id = params.get('student_id');
		const params_unit_id = params.get('unit_id');
		const params_new_unit_id = params.get('new_unit_id');
		const params_action = params.get('action');
		const params_new_unit_type_id = params.get('new_unit_type_id');
		const params_old_unit_type_id = params.get('old_unit_type_id');
		const params_year = params.get('year');
		const params_sem_index = params.get('sem_index');
		const params_sem_id = params.get('sem_id');
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
		const allowed_columns = ['ID', 'StudentID', 'UnitID', 'NewUnitID', 'OldUnitTypeID', 'Action', 'TimeofAction', 'NewUnitTypeID', 'Year', 'SemIndex', 'SemID'];
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

			...(params_student_id ? {
				StudentID: {
					equals: parseFloat(params_student_id),
					...(exclude.StudentID?.length ? { notIn: exclude.StudentID } : {})
				}
			} : (exclude.StudentID?.length ? { StudentID: { notIn: exclude.StudentID } } : {})),

			...(params_unit_id ? {
				UnitID: {
					in: params_unit_id.split(','),
					...(exclude.UnitID?.length ? { notIn: exclude.UnitID } : {})
				}
			} : (exclude.UnitID?.length ? { UnitID: { notIn: exclude.UnitID } } : {})),

			...(params_new_unit_id ? {
				NewUnitID: {
					in: params_new_unit_id.split(','),
					...(exclude.NewUnitID?.length ? { notIn: exclude.NewUnitID } : {})
				}
			} : (exclude.NewUnitID?.length ? { NewUnitID: { notIn: exclude.NewUnitID } } : {})),

			...(params_action ? {
				Action: {
					in: params_action.split(','),
					...(exclude.Action?.length ? { notIn: exclude.Action } : {})
				}
			} : (exclude.Action?.length ? { Action: { notIn: exclude.Action } } : {})),

			...(params_new_unit_type_id ? {
				NewUnitTypeID: {
					in: params_new_unit_type_id.split(',').map(id => parseInt(id)),
					...(exclude.NewUnitTypeID?.length ? { notIn: exclude.NewUnitTypeID } : {})
				}
			} : (exclude.NewUnitTypeID?.length ? { NewUnitTypeID: { notIn: exclude.NewUnitTypeID } } : {})),

			...(params_old_unit_type_id ? {
				OldUnitTypeID: {
					in: params_old_unit_type_id.split(',').map(id => parseInt(id)),
					...(exclude.OldUnitTypeID?.length ? { notIn: exclude.OldUnitTypeID } : {})
				}
			} : (exclude.OldUnitTypeID?.length ? { OldUnitTypeID: { notIn: exclude.OldUnitTypeID } } : {})),

			...(params_year ? {
				Year: {
					in: params_year.split(',').map(y => parseInt(y)),
					...(exclude.Year?.length ? { notIn: exclude.Year } : {})
				}
			} : (exclude.Year?.length ? { Year: { notIn: exclude.Year } } : {})),

			...(params_sem_index ? {
				SemIndex: {
					in: params_sem_index.split(',').map(s => parseInt(s)),
					...(exclude.SemIndex?.length ? { notIn: exclude.SemIndex } : {})
				}
			} : (exclude.SemIndex?.length ? { SemIndex: { notIn: exclude.SemIndex } } : {})),

			...(params_sem_id ? {
				SemID: {
					in: params_sem_id.split(',').map(s => parseInt(s)),
					...(exclude.SemID?.length ? { notIn: exclude.SemID } : {})
				}
			} : (exclude.SemID?.length ? { SemID: { notIn: exclude.SemID } } : {})),
		};

		// Final query
		const query = {
			where,
			...(orderBy && { orderBy }),
			...(select && { select })
		};

		// Execute query
		const results = await prisma.StudentStudyPlannerAmmendments.findMany(query);

		return NextResponse.json(results, {
			status: 200,
			headers: { 'Cache-Control': 'no-store' }
		});
	} catch (error) {
		console.error("GET error:", error);
		return NextResponse.json(
			{ success: false, error: error.message },
			{ status: 500 }
		);
	}
}

// POST STUDENT STUDY PLANNER AMENDMENTS
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

		const amendment_data = await req.json();
		const amendmentArray = Array.isArray(amendment_data) ? amendment_data : [amendment_data];
		console.log('🔵 API received amendmentArray:', amendmentArray.map(a => ({
			action: a.action,
			year: a.year,
			sem_index: a.sem_index,
			sem_id: a.sem_id,
			old_unit_type_id: a.old_unit_type_id,
			new_unit_type_id: a.new_unit_type_id
		})))

		// Validate all entries in the array
		for (const amendment of amendmentArray) {
			// Validate required fields
			if (
				!amendment.student_id ||
				!amendment.action ||
				(
					(amendment.sem_id === undefined || amendment.sem_id === null) &&
					(amendment.year === undefined || amendment.year === null || amendment.sem_index === undefined || amendment.sem_index === null)
				)
			) {
				return NextResponse.json(
					{
						success: false,
						message: 'Missing required fields: student_id, action, (year, and sem_index) or (sem_id) are required'
					},
					{ status: 400 }
				);
			}


			// Check if Student exists
			const student = await prisma.Student.findUnique({
				where: {
					StudentID: parseFloat(amendment.student_id)
				}
			});

			if (!student) {
				return NextResponse.json(
					{
						success: false,
						message: `Student with ID ${amendment.student_id} does not exist`
					},
					{ status: 400 }
				);
			}

			// Validate New UnitType if provided
			if (amendment.new_unit_type_id) {
				const unitType = await prisma.UnitType.findUnique({
					where: {
						ID: parseInt(amendment.new_unit_type_id)
					}
				});

				if (!unitType) {
					return NextResponse.json(
						{
							success: false,
							message: `UnitType with ID ${amendment.new_unit_type_id} does not exist`
						},
						{ status: 400 }
					);
				}
			}

			// Validate Old UnitType if provided
			if (amendment.old_unit_type_id) {
				const oldUnitType = await prisma.UnitType.findUnique({
					where: {
						ID: parseInt(amendment.old_unit_type_id)
					}
				});

				if (!oldUnitType) {
					return NextResponse.json(
						{
							success: false,
							message: `Old UnitType with ID ${amendment.old_unit_type_id} does not exist`
						},
						{ status: 400 }
					);
				}
			}

			// Validate Units if provided
			if (amendment.unit_id) {
				const unit = await prisma.Unit.findUnique({
					where: {
						ID: amendment.unit_id
					}
				});

				if (!unit) {
					return NextResponse.json(
						{
							success: false,
							message: `Unit with code ${amendment.unit_code} does not exist`
						},
						{ status: 400 }
					);
				}
			}

			if (amendment.new_unit_id) {
				const newUnit = await prisma.Unit.findUnique({
					where: {
						ID: amendment.new_unit_id
					}
				});

				if (!newUnit) {
					return NextResponse.json(
						{
							success: false,
							message: `Unit with code ${amendment.new_unit_code} does not exist`
						},
						{ status: 400 }
					);
				}
			}

			// Validate SemID if provided
			if (amendment.sem_id) {
				const semester = await prisma.SemesterInStudyPlannerYear.findUnique({
					where: {
						ID: parseInt(amendment.sem_id)
					}
				});

				if (!semester) {
					return NextResponse.json(
						{
							success: false,
							message: `SemesterInStudyPlannerYear with ID ${amendment.sem_id} does not exist`
						},
						{ status: 400 }
					);
				}
			}
		}

		// Create all amendments in a transaction
		const new_amendments = await prisma.$transaction(
			amendmentArray.map(amendment => {
				const data = {
					StudentID: parseFloat(amendment.student_id),
					UnitID: amendment.unit_id || null,
					NewUnitID: amendment.new_unit_id || null,
					Action: amendment.action,
					OldUnitTypeID: amendment.old_unit_type_id ? parseInt(amendment.old_unit_type_id) : null,
					NewUnitTypeID: amendment.new_unit_type_id ? parseInt(amendment.new_unit_type_id) : null,
					SemType: amendment.sem_type
				};

				// Always save year and sem_index for fallback, even when sem_id is available
				data.Year = amendment.year ? parseInt(amendment.year) : null;
				data.SemIndex = amendment.sem_index !== undefined && amendment.sem_index !== null ? parseInt(amendment.sem_index) : null;

				// Also save sem_id if available
				if (amendment.sem_id) {
					data.SemID = parseInt(amendment.sem_id);
				} else {
					data.SemID = null;
				}

				console.log('🟢 API saving to DB:', {
					Year: data.Year,
					SemIndex: data.SemIndex,
					SemID: data.SemID,
					Action: data.Action,
					OldUnitTypeID: data.OldUnitTypeID,
					NewUnitTypeID: data.NewUnitTypeID
				});

				return prisma.StudentStudyPlannerAmmendments.create({
					data
				});
			})
		);

		// AUDIT LOG - UPDATE (amendments represent changes to existing student study planner)
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;

			// Fetch the existing amendments for the student to show before state
			const studentIds = [...new Set(amendmentArray.map(a => a.student_id))];
			const existingAmendments = await prisma.StudentStudyPlannerAmmendments.findMany({
				where: {
					StudentID: { in: studentIds.map(id => parseFloat(id)) }
				}
			});

			await AuditLogger.logUpdate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'student_management',
				entity: 'StudentStudyPlanner',
				entityId: `Student ${studentIds.join(', ')}`,
				before: existingAmendments,
				after: [...existingAmendments, ...new_amendments],
				metadata: {
					amendmentsAdded: new_amendments.length,
					studentIds: studentIds,
					actions: new_amendments.map(a => a.Action),
					unitChanges: new_amendments.map(a => ({
						oldUnit: a.UnitID,
						newUnit: a.NewUnitID,
						action: a.Action,
						year: a.Year,
						semIndex: a.SemIndex
					}))
				}
			}, req);
		} catch (e) {
			console.warn('Audit UPDATE StudentStudyPlanner (amendments) failed:', e?.message);
		}

		return NextResponse.json({
			success: true,
			message: 'Amendments added successfully',
			data: new_amendments,
			ids: new_amendments.map(amendment => amendment.ID)
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

// DELETE STUDENT STUDY PLANNER AMENDMENTS
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
		const params = req.nextUrl.searchParams;
		const id = params.get('id');
		const student_id = params.get('student_id');

		if (!id && !student_id) {
			return NextResponse.json(
				{
					success: false,
					message: 'Missing required parameter: id or student_id'
				},
				{ status: 400 }
			);
		}

		let deleteCount = 0;
		let deletedData = [];

		if (id) {
			// Fetch before deleting for audit
			const beforeDelete = await prisma.StudentStudyPlannerAmmendments.findUnique({
				where: { ID: parseInt(id) }
			});

			// Delete specific amendment by ID
			const result = await prisma.StudentStudyPlannerAmmendments.delete({
				where: {
					ID: parseInt(id)
				}
			});
			deleteCount = result ? 1 : 0;
			deletedData = beforeDelete ? [beforeDelete] : [];
		} else if (student_id) {
			// Fetch before deleting for audit
			const beforeDelete = await prisma.StudentStudyPlannerAmmendments.findMany({
				where: { StudentID: parseFloat(student_id) }
			});

			// Delete all amendments for a student
			const result = await prisma.StudentStudyPlannerAmmendments.deleteMany({
				where: {
					StudentID: parseFloat(student_id)
				}
			});
			deleteCount = result.count;
			deletedData = beforeDelete;
		}

		// AUDIT LOG - UPDATE (deleting amendments is updating the student study planner)
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;

			// Fetch remaining amendments after deletion for after state
			const remainingAmendments = student_id
				? []
				: await prisma.StudentStudyPlannerAmmendments.findMany({
					where: { StudentID: deletedData[0]?.StudentID }
				});

			await AuditLogger.logUpdate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'student_management',
				entity: 'StudentStudyPlanner',
				entityId: id ? `Student ${deletedData[0]?.StudentID}` : `Student ${student_id}`,
				before: deletedData,
				after: remainingAmendments,
				metadata: {
					operation: 'DELETE_AMENDMENTS',
					deletionType: id ? 'single' : 'bulk',
					amendmentsDeleted: deleteCount,
					studentId: student_id || deletedData[0]?.StudentID,
					amendmentId: id,
					deletedUnits: deletedData.map(d => ({
						oldUnit: d.UnitID,
						newUnit: d.NewUnitID,
						action: d.Action
					}))
				}
			}, req);
		} catch (e) {
			console.warn('Audit UPDATE StudentStudyPlanner (delete amendments) failed:', e?.message);
		}

		return NextResponse.json({
			success: true,
			message: `Successfully deleted ${deleteCount} amendment(s)`
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
