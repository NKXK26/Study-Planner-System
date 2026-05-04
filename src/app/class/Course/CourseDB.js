import Course from './Course';
import Major from "@app/class/Major/Major";
import Term from '../Term/term';
import CourseIntake from '../CourseIntake/CourseIntake';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

export default class CourseDB {
	static async FetchCourses(params) {
		try {
			const queryParams = {
				...params,
				...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
				...(params.return ? { return: params.return.join(',') } : {}),
				...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {})
			};
			const query = new URLSearchParams(queryParams).toString();
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course?${new URLSearchParams(query)}`);

			if (!response.ok) {
				const error = await response.json();
				return {
					success: false,
					message: error.message || 'Failed to fetch data',
					filtered: error.filtered || false,
					data: []
				};
			}

			const data = await response.json();

			const arr = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
			if (!arr || arr.length === 0) {
				return {
					success: false,
					message: 'No courses found',
					data: []
				};
			}
			const courses = arr.map(c => {
				const majors = (c.Major || []).map(m => {
					//Looping through each of the course intakes inside major
					const course_intakes = (m.CourseIntake || []).map(course_intake => {
						const term = new Term(
							course_intake.Term.ID,
							course_intake.Term.Name,
							course_intake.Term.Year,
							course_intake.Term.Month,
							course_intake.Term.SemType,
							course_intake.Term.Status
						);
						const course_intake_constructor_obj = {
							ID: course_intake.ID,
							Status: course_intake.Status,
							TermID: course_intake.TermID,
							Term: term,
						}
						return new CourseIntake(course_intake_constructor_obj)
					});
					m.CourseIntakes = course_intakes;
					return new Major(m)
				}
				);
				// const course_intakes = ;
				return new Course({
					id: c.ID,
					code: c.Code,
					name: c.Name,
					credits_required: c.CreditsRequired,
					status: c.Status,
					majors
				});
			});
			return {
				success: true,
				data: courses
			};
		} catch (err) {
			console.error('FetchCourses error:', err);
			return {
				success: false,
				message: err.message || 'Failed to fetch courses',
				filtered: false,
				data: []
			};
		}
	}

	static async SaveCourse(courseData, method_type) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course`, {
				method: method_type,
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					Code: courseData.code,
					Name: courseData.name,
					CreditsRequired: courseData.credits_required,
					Status: courseData.status || 'Draft',
					// Only include id for PUT requests
					...(method_type === 'PUT' && { id: courseData.id })
				}),
			});

			const responseData = await response.json();

			if (!response.ok) {
				// Return the error response data including status and field info
				return {
					error: true,
					...responseData,
					status: response.status
				};
			}

			return responseData;
		} catch (error) {
			console.error('SaveCourse error:', error);
			throw error;
		}
	}

	static async deleteCourse(courseCode) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ code: courseCode }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to delete course');
			}

			return await response.json();
		} catch (error) {
			console.error('DeleteCourse error:', error);
			throw error;
		}
	}
}