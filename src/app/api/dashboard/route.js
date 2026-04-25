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

		const res = await prisma.$transaction(async (tx) => {
			const student_count = await tx.student.count();
			const unit_count = await tx.unit.count();
			const course_count = await tx.course.count();
			const term_count = await tx.term.count({
				where: { Status: "published" }
			});

			return {
				student_count,
				unit_count,
				course_count,
				term_count,
			};
		});

		let data = res;

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