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
			// Require actor email for auditability
			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const { searchParams } = new URL(req.url);
		const params_stuID = searchParams.get('StudentID');
		const params_stuName = searchParams.get('FirstName');
		const params_courseid = Number(searchParams.get('CourseID'));
		const params_majorid = Number(searchParams.get('MajorID'));
		const params_stuIntake = parseInt(searchParams.get('IntakeID'));
		const params_creditsComplete = searchParams.get('CreditCompleted');
		const params_status = searchParams.get('status');
		const return_attributes = searchParams.get('return');
		const order_by = searchParams.get('order_by');

		const params_includeAllInfo = searchParams.get('includeAllInfo')
		const params_includeBasicInfo = searchParams.get('includeBasicInfo')

		//Include all information, unit history, amendments, course details, major details, intake details
		const isIncludeAllInfo = String(params_includeAllInfo).toLowerCase() === "true";

		//Include Basic Information, student details, course details, major details, intake details
		const isIncludeBasicInfo = String(params_includeBasicInfo).toLowerCase() === "true";

		let orderBy = undefined;
		if (order_by) {
			try {
				const parsed = JSON.parse(order_by);
				const allowed_columns = ['StudentID', 'CourseID', 'MajorID', 'IntakeID', 'FirstName', 'CreditCompleted', 'MPUCreditCompleted', 'Status'];
				orderBy = parsed
					.filter(entry =>
						entry.column &&
						allowed_columns.includes(entry.column) &&
						typeof entry.ascending == 'boolean'
					)
					.map(entry => ({
						[entry.column]: entry.ascending ? 'asc' : 'desc'
					}));
			} catch (err) {
				console.warn("Invalid order_by format, please reformat:", err.message);
			}
		}

		let select = undefined;
		if (return_attributes) {
			const allowed_attributes = ['StudentID', 'CourseID', 'MajorID', 'IntakeID', 'FirstName', 'CreditCompleted', 'MPUCreditCompleted', 'Status'];
			const fields = return_attributes
				.split(',')
				.map(field => field.trim())
				.filter(field => allowed_attributes.includes(field));

			if (fields.length > 0) {
				select = {};
				fields.forEach(field => {
					select[field] = true;
				});
			}
		}

		const query = {
			where: {
				...(params_stuID && { StudentID: params_stuID }),
				...(params_stuIntake && !isNaN(params_stuIntake) && { IntakeID: params_stuIntake }),
				...(params_stuName && { FirstName: { contains: params_stuName } }),
				...(params_courseid && !isNaN(params_courseid) && { CourseID: params_courseid }),
				...(params_majorid && !isNaN(params_majorid) && { MajorID: params_majorid }),
				...(params_creditsComplete && { CreditCompleted: params_creditsComplete }),
				...(params_status && params_status !== "all" && { Status: { contains: params_status } }),
			},
			...(orderBy && { orderBy }),
			...ReturnIncludeSelectQuery(isIncludeAllInfo, isIncludeBasicInfo, select),
		};

		// Fetch students without transaction - Prisma handles the includes efficiently
		const student_listing = await prisma.Student.findMany(query);

		// if (student_listing.length === 0) {
		// 	return NextResponse.json({ message: 'No students found' }, { status: 200 });
		// }

		return new NextResponse(JSON.stringify(student_listing), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no store',
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
		const { StudentID, FirstName, CourseID, MajorID, IntakeID, CreditCompleted, Status } = await req.json();

		if (!StudentID || StudentID.trim() === '') {
			return NextResponse.json(
				{ success: false, message: 'Student ID is required and cannot be empty' },
				{ status: 400 }
			);
		}

		if (!FirstName || FirstName.trim() === '') {
			return NextResponse.json(
				{ success: false, message: 'Student name is required and cannot be empty' },
				{ status: 400 }
			);
		}

		if (!CourseID || isNaN(CourseID)) {
			return NextResponse.json(
				{ success: false, message: 'Course ID must be a valid number' },
				{ status: 400 }
			);
		}

		if (!MajorID || isNaN(MajorID)) {
			return NextResponse.json(
				{ success: false, message: 'Major ID must be a valid number' },
				{ status: 400 }
			);
		}

		if (IntakeID === undefined || IntakeID === null || isNaN(Number(IntakeID))) {
			return NextResponse.json(
				{ success: false, message: 'Intake ID must be a valid number' },
				{ status: 400 }
			);
		}

		if (CreditCompleted === undefined || CreditCompleted === null || isNaN(Number(CreditCompleted))) {
			return NextResponse.json(
				{ success: false, message: 'Credits completed must be a valid number' },
				{ status: 400 }
			);
		}

		const courseExists = await prisma.Course.findUnique({
			where: { ID: Number(CourseID) }
		});

		if (!courseExists) {
			return NextResponse.json(
				{
					success: false,
					message: `Course with ID ${CourseID} does not exist`,
					availableCourses: await prisma.Course.findMany({
						select: { ID: true, Code: true, Name: true }
					})
				},
				{ status: 400 }
			);
		}

		const majorExists = await prisma.Major.findUnique({
			where: { ID: Number(MajorID) }
		});

		if (!majorExists) {
			return NextResponse.json(
				{
					success: false,
					message: `Major with ID ${MajorID} does not exist`,
					availableMajors: await prisma.Major.findMany({
						where: { CourseID: Number(CourseID) },
						select: { ID: true, Name: true }
					})
				},
				{ status: 400 }
			);
		}

		const existingStudent = await prisma.Student.findFirst({
			where: {
				StudentID: StudentID
			},
		});

		if (existingStudent) {
			return NextResponse.json(
				{
					success: false,
					message: 'A student with this ID already exists',
					student: existingStudent,
				},
				{ status: 400 }
			);
		}

		const newStudent = await prisma.Student.create({
			data: {
				StudentID: StudentID,
				FirstName: FirstName,
				CourseID: Number(CourseID),
				MajorID: Number(MajorID),
				IntakeID: Number(IntakeID),
				CreditCompleted: Number(CreditCompleted),
				MPUCreditCompleted: 0,  // Initialize MPU credits to 0 for new students
				Status: Status || 'Active',
			},
		});

		// AUDIT CREATE
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logCreate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'student_management',
				entity: 'Student',
				entityId: StudentID,
				after: newStudent
			}, req);
		} catch (e) {
			console.warn('Audit CREATE Student failed:', e?.message);
		}

		return NextResponse.json(
			{
				success: true,
				message: 'Student created successfully',
				student: newStudent,
			},
			{ status: 201 }
		);

	} catch (error) {
		console.error('Error creating student:', error);

		let errorMessage = 'Failed to create student';
		if (error.message.includes('Foreign key constraint')) {
			errorMessage = `Database error: The course or major doesn't exist or is invalid.`;
		}

		return NextResponse.json(
			{
				success: false,
				message: errorMessage,
				error: process.env.NEXT_PUBLIC_MODE === 'DEV' ? error.message : undefined,
			},
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
			// Require actor email for auditability
			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const { originalStudentID, StudentID, FirstName, CourseID, MajorID, IntakeID, CreditCompleted, Status } = await req.json();

		if (originalStudentID !== StudentID) {
			const idExists = await prisma.Student.findUnique({
				where: { StudentID: StudentID }
			});
			if (idExists) {
				return NextResponse.json(
					{ success: false, message: 'New Student ID already exists' },
					{ status: 400 }
				);
			}
		}

		const courseExists = await prisma.Course.findUnique({
			where: { ID: Number(CourseID) }
		});

		if (!courseExists) {
			return NextResponse.json(
				{
					success: false,
					message: `Course with ID ${CourseID} does not exist`
				},
				{ status: 400 }
			);
		}

		const majorExists = await prisma.Major.findUnique({
			where: { ID: Number(MajorID) }
		});

		if (!majorExists) {
			return NextResponse.json(
				{
					success: false,
					message: `Major with ID ${MajorID} does not exist`
				},
				{ status: 400 }
			);
		}

		// Get existing student before update
		const existingStudent = await prisma.Student.findUnique({
			where: { StudentID: originalStudentID }
		});

		const updatedStudent = await prisma.Student.update({
			where: { StudentID: originalStudentID },
			data: {
				StudentID: StudentID,
				FirstName: FirstName,
				CourseID: Number(CourseID),
				MajorID: Number(MajorID),
				IntakeID: Number(IntakeID),
				CreditCompleted: Number(CreditCompleted),
				Status: Status
			}
		});

		// AUDIT UPDATE
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'student_management',
				entity: 'Student',
				entityId: StudentID,
				before: existingStudent,
				after: updatedStudent
			}, req);
		} catch (e) {
			console.warn('Audit UPDATE Student failed:', e?.message);
		}

		return NextResponse.json({
			success: true,
			message: 'Student updated successfully',
			student: updatedStudent
		}, { status: 200 });

	} catch (error) {
		console.error('Error updating student:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to update student' },
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
			// Require actor email for auditability
			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}

		const { studentID } = await req.json();

		if (!studentID) {
			return NextResponse.json({
				success: false,
				message: 'Student ID is required',
			}, { status: 400 });
		}

		// Get existing student before delete
		const existingStudent = await prisma.Student.findUnique({
			where: { StudentID: studentID }
		});

		if (!existingStudent) {
			return NextResponse.json({
				success: false,
				message: 'Student not found'
			}, { status: 404 });
		}

		const deletedStudent = await prisma.Student.delete({
			where: {
				StudentID: studentID
			}
		});

		// AUDIT DELETE
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logDelete({
				userId: user?.id || null,
				email: actorEmail,
				module: 'student_management',
				entity: 'Student',
				entityId: studentID,
				before: existingStudent
			}, req);
		} catch (e) {
			console.warn('Audit DELETE Student failed:', e?.message);
		}

		return NextResponse.json({
			success: true,
			message: 'Deleted successfully',
			data: deletedStudent
		});

	} catch (error) {
		console.error('DELETE error:', error);
		return NextResponse.json({
			success: false,
			message: error.message.includes('RecordNotFound')
				? 'Student not found'
				: 'Deletion failed',
			error: process.env.NEXT_PUBLIC_MODE === 'DEV'
				? error.message
				: undefined
		}, { status: 500 });
	}
}

function ReturnIncludeSelectQuery(
	isIncludeAllInfo = false,
	isIncludeBasicInfo = false,
	select = null
) {
	if (select) {
		// build a `select` object
		return {
			select: {
				...select,

				// Basic info
				...((isIncludeAllInfo || isIncludeBasicInfo) && {
					Course: { select: { ID: true, Name: true, Code: true } },
					CourseIntake: {
						select: {
							ID: true,
							Major: { select: { ID: true, Name: true } },
							Term: {
								select: {
									ID: true,
									Name: true,
									Year: true,
									Month: true,
									SemType: true,
								},
							},
							MasterStudyPlanner: {
								select: {
									ID: true,
									Status: true
								},
							},
						},
					},
					Major: { select: { ID: true, Name: true } },
				}),

				// Extra info
				...(isIncludeAllInfo && {
					UnitHistory: {
						include: {
							Term: {
								select: {
									ID: true,
									Name: true,
									Year: true,
									SemType: true,
									Month: true,
								},
							},
							Unit: {
								select: {
									ID: true,
									UnitCode: true,
									Name: true,
									CreditPoints: true,
									UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: {
										include: {
											Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: {
												select: {
													ID: true,
													UnitCode: true,
													Name: true,
												},
											},
										},
									},
								},
							},
						},
					},
					StudentStudyPlannerAmmendments: {
						include: {
							Unit_StudentStudyPlannerAmmendments_UnitIDToUnit: true,
							Unit_StudentStudyPlannerAmmendments_NewUnitIDToUnit: true,
							UnitType_OldUnitType: true,
							UnitType_NewUnitType: true
						}
					},
				}),
			},
		};
	}

	// build an `include` object
	return {
		include: {
			...((isIncludeAllInfo || isIncludeBasicInfo) && {
				Course: { select: { ID: true, Name: true } },
				CourseIntake: {
					select: {
						ID: true,
						Major: { select: { ID: true, Name: true } },
						Term: {
							select: {
								ID: true,
								Name: true,
								Year: true,
								Month: true,
								SemType: true,
							},
						},
						MasterStudyPlanner: {
							select: {
								ID: true,
								Status: true
							},
						},
					},
				},
				Major: { select: { ID: true, Name: true } },
			}),
			...(isIncludeAllInfo && {
				UnitHistory: {
					include: {
						Term: {
							select: {
								ID: true,
								Name: true,
								Year: true,
								SemType: true,
								Month: true,
							},
						},
						Unit: {
							select: {
								UnitCode: true,
								Name: true,
								CreditPoints: true,
								UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: {
									include: {
										Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: {
											select: {
												ID: true,
												UnitCode: true,
												Name: true,
											},
										},
									},
								},
							},
						},
					},
				},
				StudentStudyPlannerAmmendments: {
					include: {
						Unit_StudentStudyPlannerAmmendments_UnitIDToUnit: true,
						Unit_StudentStudyPlannerAmmendments_NewUnitIDToUnit: true,
						UnitType_OldUnitType: true,
						UnitType_NewUnitType: true
					}
				},
			}),
		},
	};
}
