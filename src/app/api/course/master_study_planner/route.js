import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import Major from "@app/class/Major/Major";
import Course from "@app/class/Course/Course";
import CourseIntake from "@app/class/CourseIntake/CourseIntake";
import Term from "@app/class/Term/term";
import SemesterInStudyPlannerYear from "@app/class/SemesterInStudyPlannerYear/SemesterInStudyPlannerYear";
import UnitInSemesterStudyPlanner from "@app/class/UnitInSemesterStudyPlanner/UnitInSemesterStudyPlanner";
import AuditLogger from '@app/class/Audit/AuditLogger';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
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

		const params_id = params.get('id');
		const params_course_intake_id = params.get('course_intake_id');
		const params_status = params.get('status');
		const params_get_all_data = params.get("get_all")
		const return_attributes = params.get('return');
		const order_by = params.get('order_by');
		const exclude_raw = params.get('exclude');

		const is_get_all = ["true", "1"].includes(params.get("get_all") || "");

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
		const allowed_columns = ['ID', 'CourseIntakeID', 'Status'];
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

			...(params_course_intake_id ? {
				CourseIntakeID: {
					in: params_course_intake_id.split(',').map(id => parseInt(id)),
					...(exclude.CourseIntakeID?.length ? { notIn: exclude.CourseIntakeID } : {})
				}
			} : (exclude.CourseIntakeID?.length ? { CourseIntakeID: { notIn: exclude.CourseIntakeID } } : {})),

			...(params_status ? {
				Status: {
					equals: params_status,
					...(exclude.Status?.length ? { notIn: exclude.Status } : {})
				}
			} : (exclude.Status?.length ? { Status: { notIn: exclude.Status } } : {}))
		};

		// Final query
		const query = {
			where,
			...(orderBy && { orderBy }),
			...(select && { select })
		};

		// Fetch master study planner data from Prisma
		let master_study_planner_listing = await prisma.MasterStudyPlanner.findMany(query);

		if (master_study_planner_listing.length === 0) {
			return new NextResponse(JSON.stringify(master_study_planner_listing), {
				status: 200,
				message: "No master study planners found",
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store',
				},
			})
		} else {
			if (is_get_all) {
				// Run all async calls in parallel and wait for them
				master_study_planner_listing = await Promise.all(
					master_study_planner_listing.map(async (planner) => {
						const full_data = await GetAllMasterStudyPlannerData(
							planner.ID,
							planner.CourseIntakeID
						);

						// Fetch last modified info from audit logs
						const lastModified = await AuditLogger.getLatestAuditForEntity(
							'study_plans',
							'MasterStudyPlanner',
							`Planner ${planner.ID}`
						);

						return {
							...planner,
							full_data,
							last_modified: lastModified,
						};
					})
				);
			} else {
				// Even if not getting all data, fetch last modified info
				master_study_planner_listing = await Promise.all(
					master_study_planner_listing.map(async (planner) => {
						const lastModified = await AuditLogger.getLatestAuditForEntity(
							'study_plans',
							'MasterStudyPlanner',
							`Planner ${planner.ID}`
						);

						return {
							...planner,
							last_modified: lastModified,
						};
					})
				);
			}

			return new NextResponse(JSON.stringify(master_study_planner_listing), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": "no-store",
				},
			});
		}

	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}


//ADD MASTER STUDY PLANNER
export async function POST(req) {
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

		const planner_data = await req.json();
		const plannerArray = Array.isArray(planner_data) ? planner_data : [planner_data];

		// Validate all entries in the array
		for (const planner of plannerArray) {
			// Validate required fields
			if (!planner.course_intake_id || !planner.status) {
				return NextResponse.json(
					{
						success: false,
						message: 'Missing required fields: course_intake_id and status are required'
					},
					{ status: 400 }
				);
			}

			// Validate Status
			const validStatuses = ['Complete', 'Draft', 'Empty'];
			if (!validStatuses.includes(planner.status)) {
				return NextResponse.json(
					{
						success: false,
						message: 'Invalid status. Must be either "Complete", "Empty", or "Draft"'
					},
					{ status: 400 }
				);
			}

			// Check if CourseIntake exists
			const courseIntake = await prisma.CourseIntake.findUnique({
				where: {
					ID: planner.course_intake_id
				}
			});

			if (!courseIntake) {
				return NextResponse.json(
					{
						success: false,
						message: 'Course Intake does not exist'
					},
					{ status: 400 }
				);
			}

			// Check if a master study planner already exists for this course intake
			const existingPlanner = await prisma.MasterStudyPlanner.findFirst({
				where: {
					CourseIntakeID: planner.course_intake_id
				}
			});

			if (existingPlanner) {
				return NextResponse.json(
					{
						success: false,
						message: 'A master study planner already exists for this course intake'
					},
					{ status: 400 }
				);
			}
		}

		// Create all planners in a transaction
		const new_planners = await prisma.$transaction(
			plannerArray.map(planner =>
				prisma.MasterStudyPlanner.create({
					data: {
						CourseIntakeID: planner.course_intake_id,
						Status: planner.status
					},
					select: {
						ID: true,
						CourseIntakeID: true,
						Status: true
					}
				})
			)
		);

		// AUDIT LOG - CREATE
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logCreate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'study_plans',
				entity: 'MasterStudyPlanner',
				entityId: new_planners.map(p => p.ID).join(', '),
				after: new_planners,
				metadata: {
					plannersCreated: new_planners.length,
					courseIntakeIds: new_planners.map(p => p.CourseIntakeID),
					statuses: new_planners.map(p => p.Status)
				}
			}, req);
		} catch (e) {
			console.warn('Audit CREATE MasterStudyPlanner failed:', e?.message);
		}

		return NextResponse.json({
			success: true,
			message: 'Master study planners added successfully',
			data: new_planners,
			ids: new_planners.map(planner => planner.ID)
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

//UPDATE MASTER STUDY PLANNER
export async function PUT(req) {
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

		const data = await req.json();
		let planners = [];

		if (data.save_planner) {
			const save_result = await SaveMasterStudyPlannerData(data, req)

			return NextResponse.json({
				success: save_result.success,
				message: save_result.message
			})
		} else {
			// Normalize to array
			if (Array.isArray(data)) {
				planners = data;
			} else if (data && data.id && data.status) {
				planners = [data];
			} else {
				return NextResponse.json(
					{
						success: false,
						message: 'Invalid data format. Expected a planner object or an array of planners with id and status.'
					},
					{ status: 400 }
				);
			}

			const validStatuses = ['Complete', 'Draft', 'Empty'];
			const beforeData = [];
			const afterData = [];

			for (const planner of planners) {
				const { id, status } = planner;

				if (!id || !status) {
					return NextResponse.json(
						{
							success: false,
							message: 'Missing required fields: id and status are required'
						},
						{ status: 400 }
					);
				}

				if (!validStatuses.includes(status)) {
					return NextResponse.json(
						{
							success: false,
							message: 'Invalid status. Must be either "Complete", "Draft", or "Empty"'
						},
						{ status: 400 }
					);
				}

				const existingPlanner = await prisma.MasterStudyPlanner.findUnique({
					where: { ID: id }
				});

				if (!existingPlanner) {
					return NextResponse.json(
						{
							success: false,
							message: `Master study planner with ID ${id} does not exist`
						},
						{ status: 404 }
					);
				}

				beforeData.push(existingPlanner);

				const updatedPlanner = await prisma.MasterStudyPlanner.update({
					where: { ID: id },
					data: {
						Status: status
					},
					select: {
						ID: true,
						CourseIntakeID: true,
						Status: true
					}
				});

				afterData.push(updatedPlanner);
			}

			// AUDIT LOG - UPDATE
			try {
				const user = await SecureSessionManager.authenticateUser(req);
				const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
				await AuditLogger.logUpdate({
					userId: user?.id || null,
					email: actorEmail,
					module: 'study_plans',
					entity: 'MasterStudyPlanner',
					entityId: afterData.map(p => p.ID).join(', '),
					before: beforeData,
					after: afterData,
					metadata: {
						plannersUpdated: afterData.length,
						statusChanges: afterData.map((after, idx) => ({
							id: after.ID,
							oldStatus: beforeData[idx].Status,
							newStatus: after.Status
						}))
					}
				}, req);
			} catch (e) {
				console.warn('Audit UPDATE MasterStudyPlanner failed:', e?.message);
			}

			return NextResponse.json({
				success: true,
				message: 'Master study planner(s) updated successfully'
			});
		}

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

async function GetAllMasterStudyPlannerData(master_study_planner_id, course_intake_id) {
	return await prisma.$transaction(async (tx) => {
		// 1. Fetch course intake
		const course_intake_res = await tx.courseIntake.findUnique({
			where: { ID: course_intake_id },
			select: {
				ID: true,
				MajorID: true,
				TermID: true,
				Status: true,
			},
		});
		if (!course_intake_res) throw new Error("CourseIntake not found");
		const course_intake = new CourseIntake({
			ID: course_intake_res.ID,
			Status: course_intake_res.Status,
			TermID: course_intake_res.TermID,
			MajorID: course_intake_res.MajorID,
		});

		// 2. Fetch major
		const major_res = await tx.major.findUnique({
			where: { ID: course_intake_res.MajorID },
			select: {
				ID: true,
				Name: true,
				CourseCode: true,
				CourseID: true,
			},
		});
		if (!major_res) throw new Error("Major not found");
		const major_data = new Major({
			ID: major_res.ID,
			CourseID: major_res.CourseID,
			CourseCode: major_res.CourseCode,
			Name: major_res.Name,
		});


		// 3. Fetch course
		const course_res = await tx.course.findUnique({
			where: { ID: major_res.CourseID },
			select: {
				ID: true,
				Name: true,
				Code: true,
				CreditsRequired: true,
			},
		});
		if (!course_res) throw new Error("Course not found");
		const course_data = new Course({
			id: course_res.ID,
			code: course_res.Code,
			name: course_res.Name,
			credits_required: course_res.CreditsRequired,
			status: course_res.Status
		});

		// 4. Fetch term
		const term_res = await tx.term.findUnique({
			where: { ID: course_intake_res.TermID },
			select: {
				ID: true,
				Name: true,
				Month: true,
				Year: true,
				SemType: true,
			},
		});
		const term_data = term_res
			? new Term(
				term_res.ID,
				term_res.Name,
				term_res.Year,
				term_res.Month,
				term_res.SemType,
				term_res.Status
			)
			: null;

		// 5. Fetch semesters in study planner year
		const semesters_res = await tx.semesterInStudyPlannerYear.findMany({
			where: { MasterStudyPlannerID: master_study_planner_id }
		});

		const semestersData = Array.isArray(semesters_res) ? semesters_res : (semesters_res.data || []);

		const semesters = semestersData.map(semesterData => new SemesterInStudyPlannerYear({
			id: semesterData.ID,
			master_study_planner_id: semesterData.MasterStudyPlannerID,
			year: semesterData.Year,
			sem_type: semesterData.SemType
		}));

		// 6. Fetch units in semesters
		const semIds = semesters.map((s) => s.id);
		const units_res = semIds.length
			? await tx.unitInSemesterStudyPlanner.findMany({
				where: { SemesterInStudyPlannerYearID: { in: semIds } },
				orderBy: { ID: "asc" },
				include: {
					Unit: true,
				}
			})
			: [];
		const units_in_semester = units_res.map(
			(u) =>
				new UnitInSemesterStudyPlanner({
					id: u.ID,
					unit_id: u.UnitID,
					unit_type_id: u.UnitTypeID,
					unit_code: u.Unit?.UnitCode ?? null, // still safe, if Unit included
					semester_in_study_planner_year_id: u.SemesterInStudyPlannerYearID,
				})
		);

		// Return everything as class instances
		return {
			course_intake,
			major_data,
			course_data,
			term_data,
			semesters,
			units_in_semester,
		};
	});
}

async function SaveMasterStudyPlannerData(planner_data, req) {
	const to_publish = planner_data.to_publish || false;

	//MasterStudyPlanner(MSP) Data
	const msp_id = planner_data.master_study_planner_id;
	const msp_status = planner_data.master_study_planner_status;
	const course_intake_id = planner_data.course_intake_id;

	//SemesterInStudyPlannerYear Data
	const first_sem_data = planner_data.first_sem_data;
	const sem_ids_to_delete = planner_data.sem_ids_to_delete; //Array of SemesterInStudyPlannerYear IDs to delete
	const sem_data_to_add = planner_data.sem_data_to_add; //Array of {year, sem_type} objects to add

	//UnitInSemesterStudyPlanner Data
	const unit_ids_to_delete = planner_data.units_ids_to_delete;
	const units_to_add = planner_data.units_to_add;
	const units_to_edit = planner_data.units_to_edit;

	try {
		// Fetch before state for audit
		const beforePlanner = await prisma.MasterStudyPlanner.findUnique({
			where: { ID: msp_id },
			include: {
				SemesterInStudyPlannerYear: {
					include: {
						UnitInSemesterStudyPlanner: true
					}
				}
			}
		});
		const update = await prisma.$transaction(async (tx) => {
			if (msp_status != "Complete") {
				//Update Course Intake Status to "unpublished"
				const course_intake_status = await tx.courseIntake.update({
					where: { ID: course_intake_id },
					data: { Status: "unpublished" }
				})
				const student_in_planner = await tx.student.findMany({
					where: { IntakeID: course_intake_id }
				})

				if (student_in_planner.length > 0) {
					return { success: false, message: student_in_planner.length + " student(s) are referenced to this Master Study Planner. So the study planner must be complete" };
				}
			}

			const msp_status_update = await tx.masterStudyPlanner.update({
				where: { ID: msp_id },
				data: { Status: msp_status }
			})


			// Update the first semester type first
			await tx.semesterInStudyPlannerYear.updateMany({
				where: { ID: first_sem_data.id, Year: 1 },
				data: { SemType: first_sem_data.sem_type }
			});

			//Delete Semesters
			if (sem_ids_to_delete.length > 0) {
				await tx.semesterInStudyPlannerYear.deleteMany({
					where: { ID: { in: sem_ids_to_delete } }
				});
			}

			//Add Semester
			if (sem_data_to_add.length > 0) {
				let sem_data_to_add_mapped = sem_data_to_add.map(s => ({
					MasterStudyPlannerID: s.master_study_planner_id,
					Year: s.year,
					SemType: s.sem_type,
				}));
				await tx.semesterInStudyPlannerYear.createMany({ data: sem_data_to_add_mapped });
			}

			//RemoveUnits
			if (unit_ids_to_delete.length > 0) {
				const units_deleted = await tx.unitInSemesterStudyPlanner.deleteMany({
					where: { ID: { in: unit_ids_to_delete } }
				})
			}

			//Fetch all the semesters in the MSP
			const all_sems = await tx.semesterInStudyPlannerYear.findMany({
				where: { MasterStudyPlannerID: msp_id },
				orderBy: { ID: "asc" },
			})

			const sorted_sem = all_sems.sort((a, b) => {
				// Sort by year first
				if (a.Year !== b.Year) return a.Year - b.Year;

				// If years are equal, sort by ID
				return a.ID - b.ID;
			});
			let unit_data_struc = null;
			if (units_to_add.length > 0) {
				unit_data_struc = units_to_add.map(unit => {
					// Find semesters that match the unit's year
					const semesters_in_year = sorted_sem.filter(sem => sem.Year === unit.year_to_add);
					console.log('semesters_in_year', semesters_in_year)

					// Get the semester based on sem_index_to_add (e.g., 0 = first sem of that year)
					const matched_semester = semesters_in_year[unit.sem_index_to_add];

					// Safety check
					if (!matched_semester) {
						console.warn(`No matching semester for year ${unit.year_to_add}, sem_index ${unit.sem_index_to_add}`);
						return null;
					}

					return {
						UnitTypeID: unit.unit_type_id,
						UnitID: unit.unit_id,
						// UnitCode: unit.unit_code,
						SemesterInStudyPlannerYearID: matched_semester.ID
					};
				}).filter(Boolean);
			}
			// Add units
			if (unit_data_struc && unit_data_struc.length > 0) {
				await tx.unitInSemesterStudyPlanner.createMany({ data: unit_data_struc });
			}

			//I CHANGE unit_id to unit_row_id
			if (units_to_edit.length > 0) {
				console.log('units_to_edit', units_to_edit)
				for (const u of units_to_edit) {
					await tx.unitInSemesterStudyPlanner.update({
						where: { ID: u.unit_row_id },
						data: {
							UnitTypeID: u.unit_type_id,
							UnitID: u.unit_id,
						}
					});
				}
			}

			if (to_publish) {
				await tx.courseIntake.update({
					where: { ID: course_intake_id },
					data: { Status: to_publish ? "published" : "unpublished" }
				})
			}
			return { success: true, message: "Master Study Planner Updated Succesfully" };
		})

		// AUDIT LOG - UPDATE (Full Planner Save)
		if (update.success) {
			try {
				const user = await SecureSessionManager.authenticateUser(req);
				const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;

				// Fetch after state
				const afterPlanner = await prisma.MasterStudyPlanner.findUnique({
					where: { ID: msp_id },
					include: {
						SemesterInStudyPlannerYear: {
							include: {
								UnitInSemesterStudyPlanner: true
							}
						}
					}
				});

				await AuditLogger.logUpdate({
					userId: user?.id || null,
					email: actorEmail,
					module: 'study_plans',
					entity: 'MasterStudyPlanner',
					entityId: `Planner ${msp_id}`,
					before: beforePlanner,
					after: afterPlanner,
					metadata: {
						plannerId: msp_id,
						courseIntakeId: course_intake_id,
						statusChange: { from: beforePlanner?.Status, to: msp_status },
						semestersDeleted: sem_ids_to_delete?.length || 0,
						semestersAdded: sem_data_to_add?.length || 0,
						unitsDeleted: unit_ids_to_delete?.length || 0,
						unitsAdded: units_to_add?.length || 0,
						unitsEdited: units_to_edit?.length || 0
					}
				}, req);
			} catch (e) {
				console.warn('Audit UPDATE MasterStudyPlanner (full save) failed:', e?.message);
			}
		}

		return update;
	} catch (err) {
		console.error("Error saving master study planner:", err);
		return false;
	}
}