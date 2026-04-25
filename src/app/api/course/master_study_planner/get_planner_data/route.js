import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import SemesterInStudyPlannerYear from "@app/class/SemesterInStudyPlannerYear/SemesterInStudyPlannerYear";
import UnitInSemesterStudyPlanner from "@app/class/UnitInSemesterStudyPlanner/UnitInSemesterStudyPlanner";
import { TokenValidation } from "@app/api/api_helper";

//GET MASTER STUDY PLANNER
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
		const params_target_course_intake_id = params.get('target_course_intake_id');
		const params_planner_major_id = params.get('planner_major_id');

		if (!params_target_course_intake_id && !params_planner_major_id) {
			return NextResponse.json({ success: false, message: "Bad Request" }, { status: 400 });
		}

		const target_course_intake_id = parseInt(params_target_course_intake_id)
		const planner_major_id = parseInt(params_planner_major_id)

		let is_valid = true;
		let full_data = null;
		//Must ensure that the major_id of the target course intake is the same as the planner_major_id
		await prisma.$transaction(async (tx) => {
			const target_master_study_planner = await tx.masterStudyPlanner.findFirst({
				where: { CourseIntakeID: target_course_intake_id },
				include: {
					CourseIntake: true,
				},
			});

			if (!target_master_study_planner) {
				is_valid = false;
				return;
			}

			const target_planner_major_id = target_master_study_planner.CourseIntake.MajorID;
			const target_planner_master_study_planner_id = target_master_study_planner.ID;

			// If target planner's major id is not the same as the planner's major id, then it is not valid
			if (target_planner_major_id != planner_major_id) {
				is_valid = false;
				return;
			}


			full_data = await GetAllMasterStudyPlannerData(
				target_planner_master_study_planner_id,
				tx
			);
		});

		return new NextResponse(JSON.stringify(full_data), {
			status: 200,
			message: is_valid ? "Data imported succesfully" : "Failed to import due to either different major or target planner does not exist",
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

async function GetAllMasterStudyPlannerData(master_study_planner_id, tx) {
	const client = tx || prisma; // use tx if provided, otherwise fall back to prisma

	// 5. Fetch semesters
	const semesters_res = await client.semesterInStudyPlannerYear.findMany({
		where: { MasterStudyPlannerID: master_study_planner_id },
	});


	const semesters = semesters_res.map(
		(semesterData) =>
			new SemesterInStudyPlannerYear({
				id: semesterData.ID,
				master_study_planner_id: semesterData.MasterStudyPlannerID,
				year: semesterData.Year,
				sem_type: semesterData.SemType
			})
	);

	// 6. Fetch units in semesters
	const semIds = semesters.map((s) => s.id);
	const units_res = semIds.length
		? await client.unitInSemesterStudyPlanner.findMany({
			where: { SemesterInStudyPlannerYearID: { in: semIds } },
			orderBy: { ID: "asc" },
			include: { Unit: true },
		})
		: [];

	const units_in_semester = units_res.map(
		(u) =>
			new UnitInSemesterStudyPlanner({
				id: u.ID,
				unit_type_id: u.UnitTypeID,
				unit_code: u.Unit?.UnitCode ?? null,
				unit_id: u.UnitID,
				semester_in_study_planner_year_id: u.SemesterInStudyPlannerYearID,
			})
	);

	// Return everything
	return {
		semesters,
		units_in_semester,
	};
}
