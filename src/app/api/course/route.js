import prisma from "@utils/db/db";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

// GET COURSES - No changes needed here
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
		const params_id = searchParams.get('id');
		const params_code = searchParams.get('code');
		const params_name = searchParams.get('name');
		const return_attributes = searchParams.get('return');
		const order_by = searchParams.get('order_by');
		const params_include_majors = searchParams.get("include_majors");
		const is_include_majors = params_include_majors
			? params_include_majors.toLowerCase() === "true"
			: false;

		// Pagination parameters
		// REMOVE PAGINATION

		let orderBy = undefined;
		const default_attributes = ['ID', 'Code', 'Name', 'CreditsRequired', 'Status'];

		if (order_by) {
			try {
				const parsed = JSON.parse(order_by);
				orderBy = parsed
					.filter(entry =>
						entry.column &&
						default_attributes.includes(entry.column) &&
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
			const allowed_attributes = default_attributes;
			const fields = return_attributes
				.split(',')
				.map(f => f.trim())
				.filter(f => allowed_attributes.includes(f));

			if (fields.length > 0) {
				select = {};
				// Always include the basics
				default_attributes.forEach(field => {
					select[field] = true;
				});
				// Then include what user requested
				fields.forEach(field => {
					select[field] = true;
				});
			}
		}

		const query = {
			where: {
				...(params_id && { ID: parseInt(params_id) }),
				Code: {
					contains: params_code || '',
				},
				Name: {
					contains: params_name || '',
				},
			},
			...(select && { select }),
			...(orderBy && { orderBy })
		};

		const res = await prisma.$transaction(async (tx) => {
			if (is_include_majors) {
				// ensure we keep the defaults + majors
				query.select = {
					...(query.select ?? Object.fromEntries(default_attributes.map(f => [f, true]))),
					Major: {
						select: {
							ID: true,
							CourseID: true,
							CourseCode: true,
							Name: true,
							Status: true,
							CourseIntake: {
								select: {
									ID: true,
									Status: true,
									TermID: true,
									Term: {
										select: {
											ID: true,
											Name: true,
											Year: true,
											Month: true,
											Status: true,
											SemType: true,
										},
									},
								},
							},
						},
					},
				};
			}

			const courses = await tx.Course.findMany(query);
			const totalCount = await tx.Course.count({ where: query.where });

			return { courses, totalCount };
		});
		const courses = res.courses;
		const totalCount = res.totalCount;

		if (courses.length === 0) {
			return NextResponse.json({
				data: [],
				pagination: {
					total: totalCount,
					page: 1,
					limit: totalCount,
					totalPages: 1
				}
			}, { status: 200 });
		}

		return new NextResponse(JSON.stringify({
			data: courses,
			pagination: {
				total: totalCount,
				page: 1,
				limit: totalCount,
				totalPages: 1
			}
		}), {
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

// ADD COURSE - Updated to remove ID requirement
// ADD COURSE - Updated to create a default major
// ADD COURSE - Enhanced duplicate checking
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

		let { Code, Name, CreditsRequired, Status } = await req.json();
		Code = Code?.trim();
		Name = Name?.trim();

		// Remove id from required fields check
		if (!Code || !Name || CreditsRequired === undefined) {
			return NextResponse.json(
				{ message: 'Code, Name, and CreditsRequired are required' },
				{ status: 400 }
			);
		}

		// Check for any existing course with the same code OR name
		const existingCourses = await prisma.Course.findMany({
			where: {
				OR: [
					{ Code },
					{ Name }
				]
			}
		});

		// Check for duplicate code
		const duplicateCode = existingCourses.find(c => c.Code === Code);
		if (duplicateCode) {
			return NextResponse.json(
				{
					message: 'A course with this code already exists',
					field: 'code'
				},
				{ status: 409 }
			);
		}

		// Check for duplicate name
		const duplicateName = existingCourses.find(c => c.Name === Name);
		if (duplicateName) {
			return NextResponse.json(
				{
					message: 'A course with this name already exists',
					field: 'name'
				},
				{ status: 409 }
			);
		}

		// Create transaction to ensure both course and major are created or none
		const [newCourse, defaultMajor] = await prisma.$transaction([
			prisma.Course.create({
				data: {
					Code,
					Name,
					CreditsRequired: parseFloat(CreditsRequired),
					Status: Status || 'Draft'
				}
			}),
			prisma.Major.create({
				data: {
					Name: 'Default',
					Status: 'Active',
					Course: {
						connect: {
							Code: Code
						}
					}
				}
			})
		]);

		// AUDIT CREATE
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logCreate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'course_management',
				entity: 'Course',
				entityId: newCourse.ID,
				after: newCourse,
				metadata: { defaultMajorId: defaultMajor.ID }
			});
		} catch (e) {
			console.warn('Audit CREATE Course failed:', e?.message);
		}

		return NextResponse.json(
			{
				message: 'Course created successfully with default major',
				course: {
					id: newCourse.ID,
					code: newCourse.Code,
					name: newCourse.Name,
					credits_required: newCourse.CreditsRequired,
					status: newCourse.Status
				},
				defaultMajor: {
					id: defaultMajor.ID,
					name: defaultMajor.Name,
					status: defaultMajor.Status
				}
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to create course', details: error.message },
			{ status: 500 }
		);
	}
}

// UPDATE COURSE - Updated to work with auto-increment ID
// UPDATE COURSE - Updated to prevent duplicates
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
		let { id, Code, Name, CreditsRequired, Status } = await req.json();

		if (!id) {
			return NextResponse.json(
				{ message: 'Course ID is required' },
				{ status: 400 }
			);
		}

		// Trim Code and Name
		Code = Code?.trim();
		Name = Name?.trim();

		// Check if course exists by ID
		const existingCourse = await prisma.Course.findUnique({
			where: { ID: id }
		});

		if (!existingCourse) {
			return NextResponse.json(
				{ message: 'Course not found' },
				{ status: 404 }
			);
		}

		// Check for duplicates (excluding the current course by ID)
		const existingCourses = await prisma.Course.findMany({
			where: {
				OR: [{ Code }, { Name }],
				NOT: { ID: id }
			}
		});

		const duplicateCode = existingCourses.find(c => c.Code === Code);
		if (duplicateCode) {
			return NextResponse.json(
				{
					message: 'Another course with this code already exists',
					field: 'code'
				},
				{ status: 409 }
			);
		}

		const duplicateName = existingCourses.find(c => c.Name === Name);
		if (duplicateName) {
			return NextResponse.json(
				{
					message: 'Another course with this name already exists',
					field: 'name'
				},
				{ status: 409 }
			);
		}

		id = parseInt(id, 10)
		const updatedCourse = await prisma.Course.update({
			where: { ID: id },
			data: {
				Code,
				Name,
				CreditsRequired: parseFloat(CreditsRequired),
				Status
			},
			select: {
				ID: true,
				Code: true,
				Name: true,
				CreditsRequired: true,
				Status: true
			}
		});

		// AUDIT UPDATE
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'course_management',
				entity: 'Course',
				entityId: id,
				before: existingCourse,
				after: updatedCourse
			});
		} catch (e) {
			console.warn('Audit UPDATE Course failed:', e?.message);
		}

		return NextResponse.json(
			{
				message: 'Course updated successfully',
				course: {
					id: updatedCourse.ID,
					code: updatedCourse.Code,
					name: updatedCourse.Name,
					credits_required: updatedCourse.CreditsRequired,
					status: updatedCourse.Status
				}
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to update course', details: error.message },
			{ status: 500 }
		);
	}
}


// DELETE COURSE - No changes needed here
export async function DELETE(request) {
	try {
		// Check for DEV override
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
		const { code } = await request.json();

		if (!code) {
			return NextResponse.json(
				{ message: 'Course code is required' },
				{ status: 400 }
			);
		}


		const isValidResult = await prisma.$transaction(async (tx) => {
			const course = await tx.course.findUnique({
				where: {
					Code: code,
				},
			});

			if (!course) {
				return { status: false, message: 'Course not found' };
			}

			const majors_with_intakes_count = await tx.major.findMany({
				where: {
					CourseID: course.ID,
				},
				select: {
					_count: {
						select: {
							CourseIntake: true,
						},
					},
				},
			});

			const has_intakes = majors_with_intakes_count.some(major => {
				return major._count.CourseIntake > 0;
			});

			if (has_intakes) {
				// Condition 1: Course has associated CourseIntakes
				return { status: false, message: 'Course intake(s) are associated with this course. Please ensure there are no intakes inside each of the majors' };
			}

			const students = await tx.student.findMany({
				where: {
					CourseID: course.ID,
				},
			});

			if (students.length > 0) {
				// Condition 2: Course has associated students
				return { status: false, message: 'Students are associated with this course.' };
			}

			// If all checks pass
			return { status: true, message: 'Validation successful.' };
		});

		if (!isValidResult.status) {
			return NextResponse.json(
				{ message: isValidResult.message },
				{ status: 400 }
			);
		}
		// First delete all majors associated with this course
		await prisma.Major.deleteMany({
			where: { CourseCode: code },
		});

		// Then delete the course
		const deletedCourse = await prisma.Course.delete({
			where: { Code: code },
		});

		// AUDIT DELETE
		try {
			const user = await SecureSessionManager.authenticateUser(request);
			const actorEmail = user?.email || request.headers.get('x-session-email') || undefined;
			await AuditLogger.logDelete({
				userId: user?.id || null,
				email: actorEmail,
				module: 'course_management',
				entity: 'Course',
				entityId: deletedCourse.ID,
				before: deletedCourse
			});
		} catch (e) {
			console.warn('Audit DELETE Course failed:', e?.message);
		}

		return NextResponse.json(
			{ success: true, message: 'Course and associated majors deleted successfully', course: deletedCourse },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Delete error:', error);
		return NextResponse.json(
			{ message: 'Failed to delete course', error: error.message },
			{ status: 500 }
		);
	}
}