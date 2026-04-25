import Unit from './Unit';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import UnitRequisite from '../UnitRequisite/UnitRequiste';
class UnitDB {
	/**
	 * Fetches unit data based on filters and return options.
	 *
	 * @param {Object} params
	 * @param {string} params.code - Unit code.
	 * @param {string} params.name - Unit name.
	 * @param {float} params.cp - Credit points.
	 * @param {string} params.availability - Availability status.
	 * @param {Array<{column: string, ascending: boolean}>} params.order_by - Sort options.
	 * @param {Array<string>} params.return - Fields to return.
	 * @param {Object} params.exclude - Fields to exclude values from.
	 * @param {Array<string>} params.exclude.UnitCode
	 * @param {Array<string>} params.exclude.Name
	 * @param {Array<float>} params.exclude.CreditPoints
	 * @param {Array<string>} params.exclude.Availability
	 *
	 * @returns {{ success: boolean, message: string, data: units, }}
	 */
	static async FetchUnits(params) {
		try {
			const queryParams = {
				...params,
				...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
				...(params.return ? { return: params.return.join(',') } : {}),
				...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {})
			};
			const query = new URLSearchParams(queryParams).toString();
			const apiUrl = `/api/unit?${query}`;
			console.log('🔍 FetchUnits calling:', apiUrl);
			const response = await SecureFrontendAuthHelper.authenticatedFetch(apiUrl);
			if (!response.ok) {
				const errorData = await response.json();
				console.error('❌ API returned error status:', response.status, errorData);
				return {
					success: false,
					message: errorData?.message || 'Failed to fetch data',
					data: []
				};
			}

			const responseData = await response.json();
			console.log('responseData', responseData)
			// Handle both array and object-with-data API responses
			const arr = Array.isArray(responseData) ? responseData : (Array.isArray(responseData.data) ? responseData.data : []);
			const pagination = responseData.pagination || null;
			if (!arr || arr.length <= 0) {
				return {
					success: true,
					data: [],
					pagination
				};
			}

			// constructor({ id, unit_id, requisite_unit_id, unit_code, requisite_unit_code, unit_relationship, operator, minCP }) {
			const unit_requisites = responseData.data.flatMap(unit =>
				(unit.UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit || []).map(
					requisite =>
						new UnitRequisite({
							id: requisite.ID,
							unit_id: unit.ID,
							requisite_unit_id: requisite.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit ? requisite.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit.ID : null,
							unit_code: unit.UnitCode,
							requisite_unit_code: requisite.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit ? requisite.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit.UnitCode : null,
							unit_relationship: requisite.UnitRelationship,
							operator: requisite.LogicalOperators,
							minCP: requisite.MinCP,
						})
				)
			);

			let requisitesByUnitId = {};

			if (unit_requisites.length > 0) {
				requisitesByUnitId = unit_requisites.reduce((acc, req) => {
					if (!acc[req._unit_id]) acc[req._unit_id] = [];
					acc[req._unit_id].push(req);
					return acc;
				}, {});
			}
			const units = arr.map(unit => new Unit({
				id: unit.ID,
				unit_code: unit.UnitCode,
				name: unit.Name,
				availability: unit.Availability,
				// requisites: requisitesByCode[unit.UnitCode] || [],
				requisites: requisitesByUnitId[unit.ID] || [],
				credit_points: unit.CreditPoints,
				offered_terms: (unit.UnitTermOffered || []).map(term => term.TermType),
			}));
			return {
				success: true,
				data: units,
				pagination
			};
		} catch (err) {
			console.error('❌ FetchUnits error:', err.message || err);
			return {
				success: false,
				message: err.message || 'An unknown error occurred',
				data: []
			};
		}
	}

	/**
	 * Adds a unit to the database.
	 *
	 * @param {Object} unit - Unit details.
	 * @param {string} unit.code - Unit code (e.g., "COS20004").
	 * @param {string} unit.name - Unit name.
	 * @param {float} unit.cp - Credit points (e.g., 12.5).
	 * @param {string} unit.availability - Availability status (e.g., "published").
	 *
	 * @returns {{ success: boolean, message: string }} API response.
	*/
	static async AddUnit(unit) {
		console.log('unit to add', unit)
		try {
			// Send a POST request using authenticated fetch to include x-session-email
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(unit), // Convert the unit data to a JSON string
			});

			// Parse the response data
			const data = await response.json();

			// Check if the response is okay
			if (!response.ok) {
				if (response.status !== 200) {
					return { success: false, message: data.message }; // Return success as false with message
				}
				// For other errors, throw a generic error
				throw new Error(data.error || 'Failed to add unit');
			}


			return { success: true, message: data.message, unit: data.unit };

		} catch (err) {
			console.error('addUnit error:', err);
			return { success: false, message: err.message }; // Return error message
		}
	}

	/**
	 * Updates a unit in the database.
	 *
	 * @param {Object} unit - Updated unit details.
	 * @param {string} unit.code - New unit code.
	 * @param {string} unit.name - Unit name.
	 * @param {float} unit.cp - Credit points.
	 * @param {string} unit.availability - Availability status.
	 * @param {string} unit.original_code - Original unit code to identify the unit.
	 *
	 * @returns {{ success: boolean, message: string }} API response.
	 */
	static async UpdateUnit(unit) {
		try {
			// The unit object already contains the original_code
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ unit }),
			});

			// Parse the response data
			const data = await response.json();

			// Check if the response is okay
			if (!response.ok) {
				return {
					success: false,
					message: data.message || 'Failed to update unit'
				};
			}

			// Return success message and updated unit data
			return {
				success: true,
				message: data.message || 'Unit updated successfully',
				unit: data.data
			};

		} catch (err) {
			console.error('UpdateUnit error:', err);
			return {
				success: false,
				message: err.message || 'An error occurred while updating the unit'
			};
		}
	}

	static async DeleteUnit(id) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit`,
				{
					method: 'DELETE',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ ids: [id] }),   // send array of IDs
				}
			);

			const data = await response.json();
			if (!response.ok) {
				return { success: false, message: data.message || 'Failed to delete unit' };
			}

			return { success: true, message: data.message || 'Unit deleted successfully' };
		} catch (err) {
			console.error('DeleteUnit error:', err);
			return { success: false, message: err.message || 'An error occurred while deleting the unit' };
		}
	}

	// Multiple delete
	static async DeleteUnits(ids) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit`,
				{
					method: 'DELETE',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ ids }),   // send array of IDs directly
				}
			);

			const data = await response.json();
			if (!response.ok) {
				return { success: false, message: data.message || 'Failed to delete units' };
			}

			return { success: true, message: data.message || 'Units deleted successfully' };
		} catch (err) {
			console.error('DeleteUnits error:', err);
			return { success: false, message: err.message || 'An error occurred while deleting units' };
		}
	}
}

export default UnitDB;