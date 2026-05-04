import Student from "./Students";
import StudentStudyPlannerAmmendments from "../StudentStudyPlannerAmmendments/StudentStudyPlannerAmmendments";
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import MasterStudyPlanner from "../MasterStudyPlanner/MasterStudyPlanner";
import Course from "../Course/Course";
import Term from "../Term/term";
import CourseIntake from "../CourseIntake/CourseIntake";
import Major from "../Major/Major";
class StudentDB {
	static async FetchStudents(params = {}) {
		try {

			if (params.StudentID) {
				const studentID = parseInt(params.StudentID, 10);
				if (isNaN(studentID)) {
					return [];
				}
			}
			const query = new URLSearchParams({
				...params,
				...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
				...(params.return ? { return: params.return.join(",") } : {}),
			}).toString();

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/students?${query}`);
			const textResponse = await response.text();

			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error("Failed to parse response as JSON:", textResponse);
				return {
					success: false,
					message: `Failed to parse response from server: ${textResponse}`
				};
			}

			if (!response.ok) {
				return {
					success: false,
					message: data.message || `Server error: ${response.status}`
				};
			}

			const studentsData = Array.isArray(data) ? data : (data.data || []);
			if (studentsData.length == 0) {
				return [];
			}

			const amendments = studentsData.flatMap(student =>
				(student.StudentStudyPlannerAmmendments || []).map(
					item =>
						new StudentStudyPlannerAmmendments({
							id: item.ID,
							student_id: item.StudentID,
							unit_code: item.Unit_StudentStudyPlannerAmmendments_UnitIDToUnit?.UnitCode || null,
							unit_id: item.UnitID,
							new_unit_code: item.Unit_StudentStudyPlannerAmmendments_NewUnitIDToUnit?.UnitCode || null,
							new_unit_id: item.NewUnitID,
							action: item.Action,
							time_of_action: item.TimeofAction,
							old_unit_type_id: item.OldUnitTypeID,
							new_unit_type_id: item.NewUnitTypeID,
							year: item.Year,
							sem_index: item.SemIndex,
							sem_type: item.SemType,
							sem_id: item.SemID,
						})
				)
			);


			const students = studentsData.map(studentData => new Student({
				studentID: studentData.StudentID,
				FirstName: studentData.FirstName,
				status: studentData.Status,
				creditCompleted: studentData.CreditCompleted,
				mpuCreditCompleted: studentData.MPUCreditCompleted,
				courseID: studentData.CourseID,
				majorID: studentData.MajorID,
				intakeID: studentData.IntakeID,

				// Wrap Course in Course class
				course: studentData.Course
					? new Course({
						id: studentData.Course.ID,
						code: studentData.Course.Code,
						name: studentData.Course.Name,
						credits_required: studentData.Course.CreditsRequired,
						status: studentData.Course.Status,
						majors: []
					})
					: null,

				// Wrap Major in Major class
				major: studentData.Major
					? new Major({
						ID: studentData.Major.ID,
						CourseID: studentData.Major.CourseID,
						CourseCode: studentData.Major.CourseCode,
						Name: studentData.Major.Name,
						Status: studentData.Major.Status,
						CourseData: studentData.Major.Course || null
					})
					: null,

				courseIntake: studentData.CourseIntake
					? new CourseIntake({
						ID: studentData.CourseIntake.ID,
						Status: studentData.CourseIntake.Status,
						TermID: studentData.CourseIntake.Term?.ID ?? null,
						MajorID: studentData.CourseIntake.Major?.ID ?? null,
						Term: studentData.CourseIntake.Term
							? new Term(
								studentData.CourseIntake.Term.ID,
								studentData.CourseIntake.Term.Name,
								studentData.CourseIntake.Term.Year,
								studentData.CourseIntake.Term.Month,
								studentData.CourseIntake.Term.SemType,
								studentData.CourseIntake.Term.Status
							) : null,
						Major: studentData.CourseIntake.Major
							? new Major({
								ID: studentData.CourseIntake.Major.ID,
								CourseID: studentData.CourseIntake.Major.CourseID,
								CourseCode: studentData.CourseIntake.Major.CourseCode,
								Name: studentData.CourseIntake.Major.Name,
								Status: studentData.CourseIntake.Major.Status,
								CourseData: studentData.CourseIntake.Major.Course || null
							}) : null,
						MasterStudyPlanner: studentData.CourseIntake.MasterStudyPlanner
							? new MasterStudyPlanner({
								id: studentData.CourseIntake.MasterStudyPlanner[0].ID,
								course_intake_id: studentData.CourseIntake.ID,
								status: studentData.CourseIntake.MasterStudyPlanner[0].Status
							}) : null
					})
					: null,

				studentStudyPlannerAmmendments: amendments || [],
				unitHistory: studentData.UnitHistory || [],
			}));

			return students;
		} catch (error) {
			console.error("Error fetching students:", error);
			throw error;
		}
	}

	static async CreateStudent(studentData) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/students`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(studentData),
			});

			const textResponse = await response.text();

			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error("Failed to parse response as JSON:", textResponse);
				return {
					success: false,
					message: `Failed to parse response from server: ${textResponse}`
				};
			}

			return {
				success: response.ok,
				message: data.message || (response.ok ? "Student added successfully" : "Failed to add student"),
				student: data.student || data,
				details: data.details,
				status: response.status,
			};
		} catch (err) {
			console.error("CreateStudent error:", err);
			return { success: false, message: err.message };
		}
	}

	static async UpdateStudent(studentData) {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/students`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(studentData),
			});

			const textResponse = await response.text();
			let data;
			try {
				data = JSON.parse(textResponse);
			} catch (e) {
				console.error("Failed to parse response as JSON:", textResponse);
				return {
					success: false,
					message: `Failed to parse response from server: ${textResponse}`
				};
			}

			if (!response.ok) {
				return {
					success: false,
					message: data.message || `Server error: ${response.status}`,
					status: response.status,
				};
			}

			return {
				success: true,
				message: data.message || "Student updated successfully",
				student: data.student || data,
			};
		} catch (err) {
			console.error("UpdateStudent error:", err);
			return { success: false, message: err.message };
		}
	}

	static async DeleteStudent(student) {
		try {
			const studentID = student.StudentID || student.studentID || student.id;
			if (!studentID) {
				throw new Error("No student ID provided");
			}

			const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/students`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ studentID }),
			});

			const data = await response.json();

			return {
				success: response.ok,
				message: data.message || (response.ok ? "Student deleted successfully" : "Failed to delete student"),
				student: data.student,
				status: response.status,
			};
		} catch (error) {
			console.error("DeleteStudent error:", error);
			return {
				success: false,
				message: error.message || "Failed to delete student",
			};
		}
	}

	// Alias for CreateStudent
	static async AddStudent(studentData) {
		return this.CreateStudent(studentData);
	}

	static async AddUnitToHistory(data) {
		try {
			const response = await fetch('/api/student/unit-history/add', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			});
			return await response.json();
		} catch (error) {
			console.error('Error adding unit to history:', error);
			return { success: false, message: error.message };
		}
	}

	static async UpdateUnitHistoryStatus(data) {
		try {
			const response = await fetch('/api/student/unit-history/update-status', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			});
			return await response.json();
		} catch (error) {
			console.error('Error updating unit history status:', error);
			return { success: false, message: error.message };
		}
	}

	static async RemoveUnitFromHistory(id) {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/student/unit-history/remove/${id}`, {
				method: 'DELETE',
			});
			return await response.json();
		} catch (error) {
			console.error('Error removing unit from history:', error);
			return { success: false, message: error.message };
		}
	}
}

export default StudentDB;
