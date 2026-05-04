import MasterStudyPlanner from "./MasterStudyPlanner";
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

class MasterStudyPlannerDB {
	/**
	 * Fetches master study planners from the server.
	 *
	 * @param {Object} params - Query parameters for filtering, sorting, and selecting data.
	 *   @param {number|null} [params.id] - Unique identifier for a specific master study planner.
	 *   @param {number|number[]} [params.course_intake_id] - One or multiple course intake IDs to filter by.
	 *   @param {string} [params.status] - Status of the master study planner.
	 *   @param {Boolean} [params.get_all] - Get All of the Master Study Planner Data.
	 *   @param {Array<Object>} [params.order_by] - Array of objects specifying columns and sort order.
	 *   @param {Array<string>} [params.return] - Array of strings specifying which fields to return.
	 *   @param {Array<string>} [params.exclude] - Array of strings specifying which fields to exclude.
	 *
	 * @returns {Promise<Array<MasterStudyPlanner>|Object>} - Array of MasterStudyPlanner instances or error object.
	 */
	static async FetchMasterStudyPlanners(params = {}) {
		try {
			const query = new URLSearchParams({
				...params,
				...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
				...(params.return ? { return: params.return.join(',') } : {}),
				...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {})
			}).toString();

			const is_get_all = params.get_all;
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/master_study_planner?${query}`);
			const textResponse = await response.text();

			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error('Failed to parse response as JSON:', textResponse);
				throw new Error(`Failed to parse server response: ${textResponse}`);
			}

			if (!response.ok) {
				return { success: false, message: data.message || 'Failed to fetch data' };
			}

			const planners = (Array.isArray(data) ? data : data.data || []).map(plannerData => ({
				...new MasterStudyPlanner({
					id: plannerData.ID,
					course_intake_id: plannerData.CourseIntakeID,
					status: plannerData.Status
				}),
				full_data: plannerData.full_data,
				last_modified: plannerData.last_modified
			}));

			return planners;
		} catch (error) {
			console.error('FetchMasterStudyPlanners error:', error);
			throw error;
		}
	}

	/**
	 * Adds a new master study planner to the server.
	 * @param {Object} planner - The planner object to be added.
	 * @returns {Promise<Object>} - Result object containing success, message, data, ids, and status.
	 */
	static async AddMasterStudyPlanner(planner) {
		try {
			const response =  await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/master_study_planner`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(planner),
			});

			const textResponse = await response.text();

			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error('Failed to parse response as JSON:', textResponse);
				return {
					success: false,
					message: `Failed to parse response from server: ${textResponse}`
				};
			}

			return {
				success: data.success,
				message: data.message || (response.ok ? "Master study planner added successfully" : "Failed to add master study planner"),
				data: data.data,
				ids: data.ids,
				status: response.status
			};
		} catch (err) {
			console.error('AddMasterStudyPlanner error:', err);
			return { success: false, message: err.message };
		}
	}

	/**
	 * Updates an existing master study planner on the server.
	 * @param {Object} planner - The planner object to be updated.
	 * @returns {Promise<Object>} - Result object containing success, message, and planner.
	 */
	static async UpdateMasterStudyPlanner(planner) {
		try {
			const response =  await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/master_study_planner`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(planner)
			});

			const data = await response.json();

			if (!response.ok) {
				if (response.status !== 200) {
					console.warn('Master study planner already exists:', data.planner);
					return { success: false, message: data.message, planner: data.planner };
				}
				throw new Error(data.error || 'Failed to edit the master study planner');
			}

			return {
				success: true,
				message: 'The master study planner has been updated successfully',
				planner: data.planner,
			};
		} catch (err) {
			console.error('UpdateMasterStudyPlanner Error:', err);
			return { success: false, message: err.message };
		}
	}

	static async SaveToDB(planner, toPublish = false) {
		const planner_data = {
			save_planner: true,
			master_study_planner_id: planner.details.id,
			master_study_planner_status: planner.details.status,
			course_intake_id: planner.details.course_intake_id,
			first_sem_data: {
				id: planner.years[0].semesters[0].sem_id,
				sem_type: planner.years[0].semesters[0].sem_type,
			},
			sem_ids_to_delete: planner.semester_state.removed,
			sem_data_to_add: planner.semester_state.added.map(sem => ({
				master_study_planner_id: planner.details.id,
				year: sem.year,
				sem_type: sem.sem_type
			})),
			units_ids_to_delete: planner.units_state.removed,
			units_to_add: planner.units_state.added,
			units_to_edit: planner.units_state.edited,
			to_publish: toPublish
		}

		console.log('planner_data to save', planner_data);

		const response = await SecureFrontendAuthHelper.authenticatedFetch(
			`/api/course/master_study_planner`,
			{
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(planner_data),
			}
		);

		return await response.json();
	}

	static async GetPlannerData(planner_major_id, target_course_intake_id) {
		try {
			const params = new URLSearchParams({
				planner_major_id,
				target_course_intake_id,
			});

			const response =  await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/master_study_planner/get_planner_data?${params.toString()}`,
				{
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);

			const data = await response.json();

			return { sucess: data ? true : false, data: data }
		} catch (err) {
			console.error('UpdateMasterStudyPlanner Error:', err);
			return { success: false, message: err.message };
		}
	}

	static async GetAvailableIntakes(planner_major_id, planner_course_intake_id, sem_type) {
		try {
			const params = new URLSearchParams({
				planner_major_id,
				planner_course_intake_id,
				sem_type
			});

			const response =  await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/master_study_planner/get_available_intakes?${params.toString()}`,
				{
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);

			const data = await response.json();

			return { sucess: data.length > 0 ? true : false, data: data }
		} catch (err) {
			console.error('UpdateMasterStudyPlanner Error:', err);
			return { success: false, message: err.message };
		}

	}
}

export default MasterStudyPlannerDB;
