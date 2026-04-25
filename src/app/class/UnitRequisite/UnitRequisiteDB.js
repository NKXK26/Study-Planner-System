import UnitRequisite from "./UnitRequiste";
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

class UnitRequisiteDB {
	/**
	 * Fetches unit requisites data based on filters and return options.
	 *
	 * @param {Object} params
	 * @param {string} params.code - Unit code.
	 * @param {string} params.requisite_code - requisite unit's code.
	 * @param {string} params.relationship - pre, co, anti
	 * @param {string} params.operator - logical operator (or || and).
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
	static async FetchUnitRequisites(params) {
		try {
			const queryParams = {
				...params,
				...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
				...(params.return ? { return: params.return.join(',') } : {}),
				...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {})
			};

			const query = new URLSearchParams(queryParams).toString();

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit/unit_requisite?${query}`);

			if (!response.ok) {
				const errorData = await response.json(); // Try to get more detailed error message
				return {
					success: false,
					message: errorData?.message || 'Failed to fetch data',
				};
			}


			const data = await response.json();

			if (!(data.length > 0)) {
				return {
					success: false,
					message: "No Data Found",
				};
			} else {
				const unit_requisites = data.map(requisite => new UnitRequisite({
					id: requisite.ID,
					unit_code: requisite.UnitCode,
					requisite_unit_code: requisite.RequisiteUnitCode,
					unit_relationship: requisite.UnitRelationship,
					operator: requisite.LogicalOperators,
					minCP: requisite.MinCP
				}));

				return {
					success: true,
					data: unit_requisites,
				};

			}


		} catch (err) {
			return {
				success: false,
				message: err.message || 'An unknown error occurred',
			};
		}
	}
}

export default UnitRequisiteDB