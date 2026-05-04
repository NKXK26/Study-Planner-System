import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
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
		const params_major_id = params.get('major_id');
		const major_id = parseInt(params_major_id);

		let res = await GetCourseIntakePageData(major_id);

		return new NextResponse(JSON.stringify({
			...res
		}), {
			status: res.status,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store'
			}
		});
	} catch (err) {
		console.error('Error:', err);
		return NextResponse.json(
			{ succcess: false, message: 'Failed to process the request', details: err.message },
			{ status: 500 }
		);
	}
}

async function GetCourseIntakePageData(major_id) {
	return await prisma.$transaction(async (tx) => {
		let return_obj = {
			success: true,
			message: "",
			status: 200,
			page_data: null,
			intake_listing_data: [],
		}
		const major_course_data = await tx.major.findFirst({
			where: { ID: major_id },
			include: {
				Course: true
			}
		})

		//If major's and course's data doesnt exist, return false with message
		if (!major_course_data) {
			return_obj.success = false;
			return_obj.message = "Major and Course not found;"
			return_obj.status = 404;
			return return_obj;
		}

		const intake_listing_data = await tx.masterStudyPlanner.findMany({
			where: {
				CourseIntake: {
					MajorID: major_id
				}
			},
			include: {
				CourseIntake: {
					include: {
						Term: true
					}
				}
			}
		});

		return_obj.message = "Data fetched succesfully"
		return_obj.page_data = major_course_data;
		return_obj.intake_listing_data = intake_listing_data;

		return return_obj
	})
}