import Major from '../Major/Major';
import MasterStudyPlanner from '../MasterStudyPlanner/MasterStudyPlanner';
import Term from '../Term/term';
import CourseIntake from './CourseIntake';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

class CourseIntakeDB {
	/**
	 * Fetches course intake data based on filters and return options.
	 *
	 * @param {Object} params
	 * @param {string} params.status - Intake status.
	 * @param {number} params.term_id - Term ID.
	 * @param {number} params.major_id - Major ID.
	 * @param {Array<{column: string, ascending: boolean}>} params.order_by - Sort options.
	 * @param {Array<string>} params.return - Fields to return.
	 * @param {Object} params.exclude - Fields to exclude values from.
	 *
	 * @returns {{ success: boolean, message: string, data: courseIntakes }}
	 */
	static async FetchCourseIntakes(params) {
		try {
			const queryParams = {
				...params,
				...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
				...(params.return ? { return: params.return.join(',') } : {}),
				...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {}),
			};
			const query = new URLSearchParams(queryParams).toString();

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/course_intake?${query}`);

			if (!response.ok) {
				const errorData = await response.json();
				return {
					success: false,
					message: errorData?.message || 'Failed to fetch data',
					data: []
				};
			}

			const data = await response.json();
			if (!data || data.length === 0) {
				return {
					success: false,
					message: 'No course intakes found',
					data: []
				};
			}

			console.log('course_intake data', data)

			const courseIntakes = data.map(intake => new CourseIntake({
				ID: intake.ID,
				Status: intake.Status,
				TermID: intake.TermID,
				MajorID: intake.MajorID,
				Term: intake.Term
					? new Term(
						intake.Term.ID,
						intake.Term.Name,
						intake.Term.Year,
						intake.Term.Month,
						intake.Term.SemType,
						intake.Term.Status
					) : null,
				Major: intake.Major
					? new Major({
						ID: intake.Major.ID,
						CourseID: intake.Major.CourseID,
						CourseCode: intake.Major.CourseCode,
						Name: intake.Major.Name,
						Status: intake.Major.Status,
						CourseData: intake.Major.Course || null
					}) : null
			}));

			return {
				success: true,
				data: courseIntakes
			};
		} catch (err) {
			console.error('FetchCourseIntakes error:', err);
			return {
				success: false,
				message: err.message || 'Unknown error',
				data: []
			};
		}
	}

	/**
	 * Adds a course intake to the database.
	 *
	 * @param {Object} intake - Intake details.
	 * @returns {{ success: boolean, message: string, intake?: object }}
	 */
	static async AddCourseIntake(intake) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/course_intake`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(intake)
			});
			const data = await response.json();
			if (!response.ok) {
				return { success: false, message: data.message };
			}

			return { success: true, message: "Succesfully added the intakes", intake: data };
		} catch (err) {
			console.error('AddCourseIntake error:', err);
			return { success: false, message: err.message };
		}
	}

	/**
	 * Updates a course intake in the database.
	 *
	 * @param {Object} intake - Updated intake details.
	 * @returns {{ success: boolean, message: string, intake?: object }}
	 */
	static async UpdateCourseIntake(intake) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/course_intake`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ intake })
			});

			const data = await response.json();

			if (!response.ok) {
				return { success: false, message: data.message, intake: data.intake };
			}

			return { success: true, message: 'Intake updated successfully', intake: data.intake };
		} catch (err) {
			console.error('UpdateCourseIntake error:', err);
			return { success: false, message: err.message };
		}
	}

	/**
	 * Deletes a course intake.
	 *
	 * @param {number} id - Intake ID to delete.
	 * @returns {{ success: boolean, message: string }}
	 */
	static async DeleteCourseIntake(ids) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/course_intake`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ ids })
			});

			const data = await response.json();

			if (!response.ok) {
				return { success: false, message: data.message };
			}

			return { success: true, message: data.message };
		} catch (err) {
			console.error('DeleteCourseIntake error:', err);
			return { success: false, message: err.message };
		}
	}

	/**
	 * Updates multiple course intakes in a single transaction.
	 *
	 * @param {Array<Object>} intakes - Array of intake objects to update.
	 * @returns {{ success: boolean, message: string }}
	 */
	static async BatchUpdateIntakes(intakes) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/course_intake/batch`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ intakes })
			});

			const data = await response.json();

			if (!response.ok) {
				return { success: false, message: data.message };
			}

			return { success: true, message: 'Intakes updated successfully' };
		} catch (err) {
			console.error('BatchUpdateIntakes error:', err);
			return { success: false, message: err.message };
		}
	}
}

export default CourseIntakeDB;