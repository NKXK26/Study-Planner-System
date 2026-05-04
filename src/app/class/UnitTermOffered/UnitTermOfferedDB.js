import UnitTermOffered from "./UnitTermOffered";
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

class UnitTermOfferedDB {
	/**
	 * Fetches unit term offered data based on filters and return options.
	 *
	 * @param {Object} params
	 * @param {string} params.unit_code - Unit code.
	 * @param {string} params.term_type - Term type.
	 * @param {Array<{column: string, ascending: boolean}>} params.order_by - Sort options.
	 * @param {Array<string>} params.return - Fields to return.
	 * @param {Object} params.exclude - Fields to exclude values from.
	 * @param {Array<string>} params.exclude.UnitCode
	 * @param {Array<string>} params.exclude.TermType
	 *
	 * @returns {{ success: boolean, message: string, data: UnitTermOffered[] }}
	 */
	static async FetchTermOffered(params) {
		try {
			const queryParams = {
				...params,
				...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
				...(params.return ? { return: params.return.join(',') } : {}),
				...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {})
			};

			const query = new URLSearchParams(queryParams).toString();

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit/unit_term_offered?${query}`);

			if (!response.ok) {
				const errorData = await response.json();
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
				console.log('data', data)
				const unit_terms = data.map(term => new UnitTermOffered({
					id: term.ID,
					unit_id: term.UnitID,
					unit_code: term.Unit.UnitCode,
					term_type: term.TermType
				}));

				return {
					success: true,
					data: unit_terms,
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

export default UnitTermOfferedDB;
