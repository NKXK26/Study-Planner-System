import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { TokenValidation } from "@app/api/api_helper";

// Commented out by Beckham, because doesnt accept other query, onyl accept course code
// export async function GET(request) {
// 	try {
// 		const { searchParams } = new URL(request.url);
// 		const courseCode = searchParams.get('courseCode');

// 		if (!courseCode) {
// 			return NextResponse.json(
// 				{ message: 'Course code is required' },
// 				{ status: 400 }
// 			);
// 		}

// 		const majors = await prisma.Major.findMany({
// 			where: { CourseCode: courseCode },
// 		});

// 		return NextResponse.json(majors);
// 	} catch (error) {
// 		console.error('Error:', error);
// 		return NextResponse.json(
// 			{ error: 'Failed to fetch majors', details: error.message },
// 			{ status: 500 }
// 		);
// 	}
// }

export async function GET(request) {
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
		const params = new URL(request.url).searchParams;

		const major_id = params.get('id');
		const course_id = params.get('course_id');
		const course_code = params.get('course_code');
		const course_name = params.get('name');
		const major_status = params.get('status');
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

		// Allowed fields for return and sorting
		const allowed_columns = ['ID', 'CourseID', 'CourseCode', 'Name', 'Status'];

		// Handle order_by
		let orderBy;
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

		// Handle return_attributes (select specific fields)
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

		// Build Prisma filter
		const where = {
			...(major_id ? { ID: parseInt(major_id) } : {}),
			...(course_id ? { CourseID: parseInt(course_id) } : {}),
			...(major_status ? { Status: major_status } : {}),
			...(exclude.ID?.length ? { ID: { notIn: exclude.ID } } : {}),
			...(exclude.CourseID?.length ? { CourseID: { notIn: exclude.CourseID } } : {}),
			...(exclude.Status?.length ? { Status: { notIn: exclude.Status } } : {}),
		};

		if (course_code || course_name) {
			// Check if the major's CourseCode or Name matches
			if (course_code) {
				where.CourseCode = {  // Now we directly filter by CourseCode in the `major` table
					contains: course_code,
					...(exclude.Course?.CourseCode?.length ? { notIn: exclude.Course.CourseCode } : {}),
				};
			}

			if (course_name) {
				where.Name = {
					contains: course_name,
					...(exclude.Course?.Name?.length ? { notIn: exclude.Course.Name } : {}),
				};
			}
		}

		// Create the query object
		const query = {
			where,
			...(select ? { select } : { include: { Course: true } }),
			...(orderBy && { orderBy }),
		};

		const majors = await prisma.Major.findMany(query);

		if (majors.length === 0) {
			return new NextResponse(JSON.stringify(majors), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store'
				}
			});
		}

		return new NextResponse(JSON.stringify(majors), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}
export async function POST(request) {
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
		let { courseCode, name } = await request.json();

		// Trim input values
		courseCode = courseCode?.trim();
		name = name?.trim();

		if (!courseCode || !name) {
			return NextResponse.json(
				{ message: 'Course Code and Name are required' },
				{ status: 400 }
			);
		}

		const course = await prisma.Course.findUnique({
			where: { Code: courseCode },
		});

		if (!course) {
			return NextResponse.json(
				{ message: 'Course not found' },
				{ status: 404 }
			);
		}

		const newMajor = await prisma.Major.create({
			data: {
				CourseID: course.ID,
				CourseCode: courseCode,
				Name: name,
				Status: 'Active'
			}
		});

		// AUDIT CREATE
		try {
			const user = await SecureSessionManager.authenticateUser(request);
			const actorEmail = user?.email || request.headers.get('x-session-email') || undefined;
			await AuditLogger.logCreate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'course_management',
				entity: 'Major',
				entityId: newMajor.ID,
				after: newMajor
			});
		} catch (e) {
			console.warn('Audit CREATE Major failed:', e?.message);
		}

		return NextResponse.json(
			{ message: 'Major added successfully', major: newMajor },
			{ status: 201 }
		);
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to create major', details: error.message },
			{ status: 500 }
		);
	}
}

export async function PUT(request) {
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
		let { id, name, status } = await request.json();

		// Trim the name
		name = name?.trim();

		if (!id || !name) {
			return NextResponse.json(
				{ message: 'Major ID and Name are required' },
				{ status: 400 }
			);
		}
		id = parseInt(id, 10)

		// Get existing major before update
		const existingMajor = await prisma.Major.findUnique({
			where: { ID: id }
		});

		if (!existingMajor) {
			return NextResponse.json(
				{ message: 'Major not found' },
				{ status: 404 }
			);
		}

		const updatedMajor = await prisma.Major.update({
			where: { ID: id },
			data: {
				Name: name,
				Status: status || 'Active'
			}
		});

		// AUDIT UPDATE
		try {
			const user = await SecureSessionManager.authenticateUser(request);
			const actorEmail = user?.email || request.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'course_management',
				entity: 'Major',
				entityId: id,
				before: existingMajor,
				after: updatedMajor
			});
		} catch (e) {
			console.warn('Audit UPDATE Major failed:', e?.message);
		}

		return NextResponse.json(
			{ message: 'Major updated successfully', major: updatedMajor },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to update major', details: error.message },
			{ status: 500 }
		);
	}
}

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
		const { id } = await request.json();

		if (!id) {
			return NextResponse.json(
				{
					success: false,
					message: 'Major ID is required'
				},
				{ status: 400 }
			);
		}

		const result = await prisma.$transaction(async (tx) => {
			// 1. Check if the major exists
			const existingMajor = await tx.major.findUnique({
				where: { ID: id },
			});

			if (!existingMajor) {
				return {
					success: false,
					status: 404,
					message: 'Major not found',
				};
			}

			// 2. Check if the major has course intakes
			const majorCourseIntake = await tx.courseIntake.findMany({
				where: { MajorID: id },
			});

			if (majorCourseIntake.length > 0) {
				return {
					success: false,
					status: 200,
					message: `Please make sure that this major has no intakes before deleting. It currently has ${majorCourseIntake.length} intakes/study planner`,
				};
			}

			// 3. Safe to delete
			await tx.major.delete({
				where: { ID: id },
			});

			return {
				success: true,
				status: 200,
				message: 'Major deleted successfully',
			};
		});

		if (result.success) {
			// AUDIT DELETE
			try {
				const user = await SecureSessionManager.authenticateUser(request);
				const actorEmail = user?.email || request.headers.get('x-session-email') || undefined;
				await AuditLogger.logDelete({
					userId: user?.id || null,
					email: actorEmail,
					module: 'course_management',
					entity: 'Major',
					entityId: id,
					before: existingMajor
				});
			} catch (e) {
				console.warn('Audit DELETE Major failed:', e?.message);
			}
		}

		return NextResponse.json(
			{ success: result.success, message: result.message },
			{ status: result.status }
		);
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to delete major', details: error.message },
			{ status: 500 }
		);
	}
}