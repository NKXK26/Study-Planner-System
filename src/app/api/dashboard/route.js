import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";
import { readOfficialCatalogue } from '@app/libs/officialCatalogue.mjs';
import { isStudentPortalRequest } from '@app/libs/studentPortalAccess.mjs';

export async function GET(req) {
	try {
		if (isStudentPortalRequest(req)) {
			const catalogue = await readOfficialCatalogue();
			const planners = catalogue.data.filter(planner => planner.courseCode === 'BA-CS');
			const unitCodes = new Set(planners.flatMap(planner => planner.units || []).map(unit => unit.UnitCode).filter(Boolean));
			const courseCodes = new Set(planners.map(planner => planner.courseCode).filter(Boolean));
			return NextResponse.json({
				success: true,
				data: {
					student_count: 0,
					unit_count: unitCodes.size,
					course_count: courseCodes.size,
					term_count: planners.length,
				},
			});
		}

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

		const { default: prisma } = await import('@utils/db/db');
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
		if (isStudentPortalRequest(req)) {
			return NextResponse.json(
				{ success: false, message: 'The published planner catalogue is temporarily unavailable.' },
				{ status: 503 }
			);
		}
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}
