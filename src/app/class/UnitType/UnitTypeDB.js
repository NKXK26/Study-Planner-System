import UnitType from './UnitType';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

export default class UnitTypeDB {
	static async FetchUnitTypes(params) {
		try {
			//Use this one for netlify
			const queryParams = {};

			for (const key in params) {
				if (Array.isArray(params[key]) || typeof params[key] === 'object') {
					// stringify arrays or objects
					queryParams[key] = JSON.stringify(params[key]);
				} else {
					queryParams[key] = params[key];
				}
			}

			const url = `${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit_type?${new URLSearchParams(queryParams)}`;

			const response = await SecureFrontendAuthHelper.authenticatedFetch(url);

			if (!response.ok) {
				let errorMessage = 'Failed to fetch data';
				try {
					const error = await response.json();
					errorMessage = error.message || errorMessage;
				} catch (e) {
					try {
						errorMessage = await response.text();
					} catch { }
				}
				console.error('FetchUnitTypes error:', errorMessage);
				return [];
			}

			const data = await response.json();
			const pagination = data.pagination || null;
			const arr = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
			if (!arr.length) {
				return {
					success: true,
					data: [],
					pagination
				}
			}
			let unit_types = arr.map(unitType => new UnitType({
				id: unitType.ID,
				name: unitType.Name,
				colour: unitType.Colour
			}));

			return {
				success: true,
				data: unit_types,
				pagination
			};
		} catch (err) {
			console.error('FetchUnitTypes error:', err);
			throw err;
		}
	}

	static async SaveUnitType(unitTypeData, method_type) {
		try {
			// Prepare the data to send based on method type
			const requestData = method_type === 'POST' ? {
				Name: unitTypeData.name,
				Colour: unitTypeData.colour
			} : {
				ID: unitTypeData.ID, // Make sure this matches what your API expects
				Name: unitTypeData.name,
				Colour: unitTypeData.colour
			};

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit_type`, {
				method: method_type,
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestData),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to save unit type');
			}

			return await response.json();
		} catch (error) {
			console.error('SaveUnitType error:', error);
			throw error;
		}
	}

	static async deleteUnitType(unitTypeId) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit_type`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ ID: unitTypeId }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to delete unit type');
			}

			const result = await response.json();
			console.log('Delete successful:', result);
			return result;
		} catch (error) {
			console.error('DeleteUnitType error:', error);
			throw error;
		}
	}
}
