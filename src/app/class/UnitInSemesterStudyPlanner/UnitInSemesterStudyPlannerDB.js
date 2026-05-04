import UnitInSemesterStudyPlanner from "./UnitInSemesterStudyPlanner";
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

class UnitInSemesterStudyPlannerDB {
	/**
	 * Fetches units in semester study planner from the server.
	 *
	 * @param {Object} params - Query parameters for filtering, sorting, and selecting data.
	 *   @param {number|null} [params.id] - Unique identifier for a specific unit. Optional.
	 *   @param {number} [params.unit_type_id] - Identifier for the type of unit. Optional.
	 *   @param {string} [params.unit_code] - Code representing the unit. Optional.
	 *   @param {number} [params.semester_in_study_planner_year_id] - ID of the associated semester in the study planner year. Optional.
	 *   @param {Array<Object>} [params.order_by] - Array of objects specifying columns and sort order. Optional.
	 *   @param {Array<string>} [params.return] - Array of strings specifying which fields to return. Optional.
	 *   @param {Array<string>} [params.exclude] - Array of strings specifying which fields to exclude. Optional.
	 *
	 * @returns {Promise<Array<UnitInSemesterStudyPlanner>|Object>} - Array of UnitInSemesterStudyPlanner instances or error object.
	 */
	static async FetchUnitsInSemesterStudyPlanner(params = {}) {
		try {
			const query = new URLSearchParams({
				...params,
				...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
				...(params.return ? { return: params.return.join(',') } : {}),
				...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {})
			}).toString();

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit_in_semester_study_planner?${query}`);
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

			const units = (Array.isArray(data) ? data : data.data || []).map(unitData => new UnitInSemesterStudyPlanner({
				id: unitData.ID,
				unit_type_id: unitData.UnitTypeID,
				unit_code: unitData.UnitCode,
				semester_in_study_planner_year_id: unitData.SemesterInStudyPlannerYearID
			}));

			return units;
		} catch (error) {
			console.error('FetchUnitsInSemesterStudyPlanner error:', error);
			throw error;
		}
	}

	/**
	 * Adds a new unit in semester study planner to the server.
	 * @param {Object} unitData - The unit object to be added.
	 * @returns {Promise<Object>} - Result object containing:
	 *   success {boolean} - Indicates if the operation was successful.
	 *   message {string} - Message describing the result.
	 *   data {any} - The returned data from the operation.
	 */
	static async SaveUnitInSemesterStudyPlanner(unitData) {
		try {
			// const body = unitData.map(unit => ({
			// 	UnitTypeID: unit.UnitTypeID,
			// 	UnitCode: unit.UnitCode,
			// 	SemesterInStudyPlannerYearID: unit.SemesterInStudyPlannerYearID,
			// }));

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit_in_semester_study_planner`, {
				method: "POST",
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(unitData),
			});

			const textResponse = await response.text();
			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error('Failed to parse save response as JSON:', textResponse);
				return {
					success: false,
					message: `Failed to parse server response: ${textResponse}`
				};
			}

			if (!response.ok) {
				return {
					success: false,
					message: data.message || 'Failed to save unit',
					status: response.status
				};
			}

			return {
				success: true,
				message: data.message || 'Unit saved successfully',
				data: data
			};
		} catch (error) {
			console.error('SaveUnitInSemesterStudyPlanner error:', error);
			return { success: false, message: error.message };
		}
	}

	/**
	 * Updates one or more units in semester study planner on the server.
	 * @param {Array<Object>} units - Array of unit objects to be updated.
	 * @returns {Promise<Object>} - Result object containing:
	 *   success {boolean} - Indicates if the operation was successful.
	 *   message {string} - Message describing the result.
	 *   data {any} - The returned data from the operation.
	 */
	static async UpdateUnitInSemesterStudyPlanner(units) {
		try {
			const body = units.map(unit => ({
				ID: unit.unit_id,
				UnitTypeID: unit.unit_type_id,
				UnitCode: unit.unit_code,
			}));

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit_in_semester_study_planner`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			});

			const textResponse = await response.text();
			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error('Failed to parse update response as JSON:', textResponse);
				return {
					success: false,
					message: `Failed to parse server response: ${textResponse}`
				};
			}

			if (!response.ok) {
				return {
					success: false,
					message: data.message || 'Failed to update units',
					status: response.status
				};
			}

			return {
				success: true,
				message: data.message || 'Units updated successfully',
				data: data
			};
		} catch (error) {
			console.error('UpdateUnitInSemesterStudyPlanner error:', error);
			return { success: false, message: error.message };
		}
	}

	/**
	 * Deletes one or more units in semester study planner from the server by their IDs.
	 * @param {number|Array<number>} id - The ID or array of IDs of units to delete.
	 * @returns {Promise<Object>} - Result object containing:
	 *   success {boolean} - Indicates if the operation was successful.
	 *   message {string} - Message describing the result.
	 *   data {any} - The returned data from the operation.
	 *   results {Array} - Array of individual delete results (if array input).
	 */
	static async DeleteUnitInSemesterStudyPlanner(id) {
		try {
			// If id is an array, delete each item one by one
			if (Array.isArray(id)) {
				const results = await Promise.all(
					id.map(async (singleId) => {
						return await this.DeleteUnitInSemesterStudyPlanner(singleId);
					})
				);

				// Check if all deletions were successful
				const allSuccessful = results.every(result => result.success);

				return {
					success: allSuccessful,
					message: allSuccessful ? 'All units deleted successfully' : 'Some units failed to delete',
					results: results
				};
			}

			// Handle single ID case
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit_in_semester_study_planner`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ id }),
			});

			const textResponse = await response.text();
			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error('Failed to parse delete response as JSON:', textResponse);
				return {
					success: false,
					message: `Failed to parse server response: ${textResponse}`
				};
			}

			return {
				success: response.ok,
				message: data.message || (response.ok ? 'Unit deleted successfully' : 'Failed to delete unit'),
				data: data
			};
		} catch (error) {
			console.error('DeleteUnitInSemesterStudyPlanner error:', error);
			return { success: false, message: error.message };
		}
	}
}

export default UnitInSemesterStudyPlannerDB;
