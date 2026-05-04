import Major from './Major';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

export default class MajorDB {
	static async fetchMajorsByCourse(courseCode) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/major?courseCode=${courseCode}`);
			if (!response.ok) {
				return [];
			}
			const data = await response.json();
			return data.map(major => new Major(major));
		} catch (err) {
			console.error('FetchMajors error:', err);
			return [];
		}
	}

	static async FetchMajors(params) {
		try {
			// Make the API request, passing the query parameters
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/major?${new URLSearchParams(params)}`);

			// const response = await fetch(`/api/course/major?${new URLSearchParams(params)}`);

			// Check if the response is ok (status code 200-299)
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to fetch majors');
			}

			// Parse the JSON response data
			const data = await response.json();
			// Return an empty array if no majors were found
			if (!data || data.length === 0) {
				return {
					success: false,
					message: "Major does not exist",
					data: []
				};
			}
			// Map the returned data to Major instances
			const majors = data.map(major => new Major({
				ID: major.ID,
				CourseID: major.CourseID,
				CourseCode: major.CourseCode,
				Name: major.Name,
				Status: major.Status,
				CourseData: major.Course
			}));

			return {
				success: true,
				data: majors,
			};
		} catch (err) {
			// console.error('FetchMajors error:', err);
			return {
				success: false,
				message: err.message || 'An unknown error occurred',
				data: []
			};
		}
	}

	static async addMajor(courseCode, name) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/course/major', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ courseCode, name }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to add major');
			}

			const data = await response.json();
			return {
				message: 'Major added successfully',
				major: data.major // Make sure your API returns the created major
			};
		} catch (error) {
			console.error('AddMajor error:', error);
			throw error;
		}
	}

	static async updateMajor(majorId, updateData) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/course/major', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					id: majorId,
					name: updateData.name,
					status: updateData.status || 'Active'
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to update major');
			}

			return await response.json();
		} catch (error) {
			console.error('UpdateMajor error:', error);
			throw error;
		}
	}

	static async deleteMajor(majorId) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/course/major', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ id: majorId }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to delete major');
			}

			const data = await response.json()

			return data;
		} catch (error) {
			console.error('DeleteMajor error:', error);
			throw error;
		}
	}

	static async FetchMajorIntake(major_id) {
		const query = new URLSearchParams({
			major_id
		}).toString();
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/major/major_intake?${query}`);

			const data = await response.json()

			if (data.page_data) {
				let major = data.page_data;
				data.page_data = new Major({
					ID: major.ID,
					CourseID: major.CourseID,
					CourseCode: major.CourseCode,
					Name: major.Name,
					Status: major.Status,
					CourseData: major.Course
				});
			}

			return data;
		} catch (err) {

		}


	}
}