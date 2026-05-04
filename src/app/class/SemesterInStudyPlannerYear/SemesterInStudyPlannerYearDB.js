import SemesterInStudyPlannerYear from "./SemesterInStudyPlannerYear";
import SecureFrontendAuthHelper from "@utils/auth/FrontendAuthHelper";

class SemesterInStudyPlannerYearDB {
	/**
	 * Fetches semesters in study planner years from the server.
	 *
	 * @param {Object} params - Query parameters for filtering, sorting, and selecting data.
	 *   @param {number|null} [params.id] - Unique identifier for a specific semester in study planner year.
	 *   @param {number|number[]} [params.course_intake_id] - One or multiple course intake IDs to filter by.
	 *   @param {string} [params.status] - Status of the semester in study planner year.
	 *   @param {Array<Object>} [params.order_by] - Array of objects specifying columns and sort order.
	 *   @param {Array<string>} [params.return] - Array of strings specifying which fields to return.
	 *   @param {Array<string>} [params.exclude] - Array of strings specifying which fields to exclude.
	 *
	 * @returns {Promise<Array<SemesterInStudyPlannerYear>|Object>} - Array of SemesterInStudyPlannerYear instances or error object.
	 */
	static async FetchSemesterInStudyPlannerYears(params = {}) {
		try {
			// Constructing the query parameters
			const query = new URLSearchParams({
				...params,
				...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
				...(params.return ? { return: params.return.join(',') } : {}),
				...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {})
			}).toString();

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/semester_in_study_planner_year?${query}`);

			// Get the response content regardless of status
			const textResponse = await response.text();

			// Try to parse as JSON
			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error('Failed to parse response as JSON:', textResponse);
				throw new Error(`Failed to parse response from server: ${textResponse}`);
			}

			// Check if the response is ok
			if (!response.ok) {
				return {
					success: false,
					message: `Failed to parse response from server: ${textResponse}`
				};
			}

			// If data is not an array, check if it has a data property that is an array
			const semestersData = Array.isArray(data) ? data : (data.data || []);

			// Map each semester to an instance of the SemesterInStudyPlannerYear class
			const semesters = semestersData.map(semesterData => new SemesterInStudyPlannerYear({
				id: semesterData.ID,
				master_study_planner_id: semesterData.MasterStudyPlannerID,
				year: semesterData.Year,
				sem_type: semesterData.SemType
			}));

			console.log('semesters', semesters)

			return semesters;
		} catch (error) {
			console.error('Error fetching semesters:', error);
			throw error;
		}
	}

	/**
	 * Adds a new semester in study planner year to the server.
	 * @param {Object} semester - The semester object to be added.
	 * @returns {Promise<Object>} - Result object containing success, message, data, details, and status.
	 */
	static async AddSemesterInStudyPlannerYear(semester) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/semester_in_study_planner_year`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(semester),
			});

			// Get the response content regardless of status
			const textResponse = await response.text();

			// Try to parse as JSON
			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error('Failed to parse response as JSON:', textResponse);
				return {
					success: false,
					status: response.status,
					message: `Failed to parse response from server: ${textResponse}`
				};
			}

			// Always return the response data
			return {
				success: response.ok,
				message: data.message || (response.ok ? "Semester added successfully" : "Failed to add semester"),
				data: data.data,
				status: response.status
			};
		} catch (err) {
			console.error('addSemester error:', err);
			return { success: false, message: err.message };
		}
	}

	static async UpdateSemesterInStudyPlannerYear(semester) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/semester_in_study_planner_year`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(semester)
			});

			const data = await response.json();

			if (!response.ok) {
				if (response.status !== 200) {
					console.warn('Semester already exists:', data.data);
					return { success: false, message: data.message, data: data.data };
				}
				throw new Error(data.error || 'Failed to edit the semester');
			}

			return {
				success: true,
				message: 'The semester has been updated successfully',
				data: data.data,
			};
		} catch (err) {
			console.error('UpdateSemester Error:', err);
			return { success: false, message: err.message };
		}
	}

	static async DeleteSemesterInStudyPlannerYear(ids) {
		try {
			const query = new URLSearchParams({ ids: JSON.stringify(ids) });

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/semester_in_study_planner_year?${query.toString()}`, {
				method: "DELETE"
			});

			const data = await response.json();
			return {
				success: response.ok,
				message: data.message || (response.ok ? "Semester deleted successfully" : "Failed to delete semester"),
				data: data
			};
		} catch (err) {
			console.error('DeleteSemester Error:', err);
			return { success: false, message: err.message };
		}
	}
}

export default SemesterInStudyPlannerYearDB;
