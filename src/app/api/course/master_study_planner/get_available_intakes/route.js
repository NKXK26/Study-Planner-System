import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

export async function GET(req) {
	try {
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
		const params_planner_major_id = params.get('planner_major_id');
		const params_planner_sem_type = params.get('sem_type');
		const params_planner_course_intake_id = params.get('planner_course_intake_id');

		const planner_major_id = parseInt(params_planner_major_id)
		const planner_sem_type = params_planner_sem_type;
		const planner_course_intake_id = parseInt(params_planner_course_intake_id);

		const data = await prisma.courseIntake.findMany({
			where: {
				MajorID: planner_major_id,
				Term: {
					SemType: planner_sem_type
				},
				NOT: {
					ID: planner_course_intake_id
				}
			},
			include: {
				MasterStudyPlanner: true,
				Term: true
			}
		});
		return new NextResponse(JSON.stringify(data), {
			status: 200,
			message: data.length > 0 ? data.length + " available intakes" : "No available intakes",
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		})


	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}
