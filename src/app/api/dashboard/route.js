import prisma from "@utils/db/db";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
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

			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}

		const [student_count, unit_count, course_count, term_count] = await Promise.all([
			prisma.student.count(),
			prisma.unit.count(),
			prisma.course.count(),
			prisma.term.count({ where: { Status: 'published' } }),
		]);
		const data = { student_count, unit_count, course_count, term_count };

		return NextResponse.json(
			{
				data,
				success: true
			},
			{ status: 200 }
		);

	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}
