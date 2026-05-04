import { useEffect, useState, useRef } from 'react';
import StudentDB from '@app/class/Student/StudentsDB';
import CourseDB from '@app/class/Course/CourseDB';
import MajorDB from '@app/class/Major/MajorDB';
import TermDB from '@app/class/Term/termDB';
import CourseIntakeDB from '@app/class/CourseIntake/CourseIntakeDB';
import InfoTooltip from '@components/InfoTooltip';

const Form = ({ onClose, mode, studentID, RefreshList }) => {
	const [originalStudentID, setOriginalStudentID] = useState("");
	const [studentData, setStudentData] = useState({
		StudentID: "",
		FirstName: "",
		CourseID: "",
		MajorID: "",
		IntakeID: "",
		CreditCompleted: mode === 'ADD' ? "0" : "",
		Status: "Active"
	});

	const [courses, setCourses] = useState([]);
	const [majors, setMajors] = useState([]);
	const [intakeTerms, setIntakeTerms] = useState([]);
	const [loading, setLoading] = useState(false);
	const [saveLoading, setSaveLoading] = useState(false)
	const [error, setError] = useState(null);
	const is_fetching = useRef(false);
	const modalRef = useRef(null);

	const handleBackdropClick = (e) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};


	// Helper function to convert month number to month abbreviation
	const getMonthAbbrev = (monthNum) => {
		const months = {
			1: 'JAN', 2: 'FEB', 3: 'MAR', 4: 'APR', 5: 'MAY', 6: 'JUN',
			7: 'JUL', 8: 'AUG', 9: 'SEP', 10: 'OCT', 11: 'NOV', 12: 'DEC'
		};	
		return months[monthNum] || 'JAN'; // Default to JAN if month is not available
	};

	useEffect(() => {
		const fetchInitialData = async () => {
			try {
				setLoading(true);
				// Fetch courses
				const coursesResult = await CourseDB.FetchCourses({
					return: ['ID', 'Code', 'Name', 'Status'],
					include_majors: true
				});
				console.log('coursesResult', coursesResult)
				if (coursesResult.success) {
					setCourses(coursesResult.data);
				}
				setLoading(false);
			} catch (err) {
				setLoading(false);
				console.error("Failed to fetch initial data:", err);
			}
		};

		fetchInitialData();
	}, []);

	// Fetch majors when course changes
	useEffect(() => {
		if (studentData.CourseID) {
			const target_course = courses.find(((course) => course.id == studentData.CourseID));
			console.log('target_course', target_course)
			setMajors(target_course.majors);
		}
	}, [studentData.CourseID]);

	// Fetch intake terms when major changes
	useEffect(() => {
		const fetchIntakeTerms = async () => {
			if (studentData.MajorID) {
				//Selected major is a Major object
				const selected_major = majors.find(((major) => (major.id == studentData.MajorID)));

				console.log('intake selected_major.courseIntakes', selected_major.courseIntakes)
				console.log('intake selected_major', selected_major)
				const filter_published_intakes_in_selected_major = selected_major.courseIntakes
					.filter((course_intake) => course_intake.Status === "published") //First filter only to show published
					.map((course_intake) => {
						const term = course_intake.Term;

						const monthAbbrev = term.month
							? getMonthAbbrev(term.month)
							: (term.name && term.name.includes('Sem1') ? 'FEB' : 'AUG');

						return {
							...course_intake,
							id: course_intake.ID,
							termName: `${term.name} - ${monthAbbrev}${term.year} (${term.semtype})`
						};
					});

				console.log('intake filter_published_intakes_in_selected_major', filter_published_intakes_in_selected_major)
				setIntakeTerms(filter_published_intakes_in_selected_major);
			} else {
				setIntakeTerms([]);
			}
		};

		fetchIntakeTerms();
	}, [studentData.MajorID]);

	useEffect(() => {
		const fetchStudentData = async () => {
			if ((mode === 'READ' || mode === 'EDIT') && studentID && !is_fetching.current) {
				is_fetching.current = true;
				setLoading(true);
				try {
					const students = await StudentDB.FetchStudents({
						StudentID: studentID,
						return: ['StudentID', 'FirstName', 'CourseID', 'MajorID', 'IntakeID', 'CreditCompleted', 'Status']
					});

					if (students && students.length > 0) {
						const student = students[0];
						setOriginalStudentID(student.studentID || "");
						setStudentData({
							StudentID: student.studentID || "",
							FirstName: student.FirstName || "",
							CourseID: student.courseID || "",
							MajorID: student.majorID || "",
							IntakeID: student.intakeID || "",
							CreditCompleted: student.creditCompleted !== null && student.creditCompleted !== undefined ?
								String(student.creditCompleted) : "0",
							Status: student.status || "Active"
						});
					} else {
						setError(`Student ID: ${studentID} is invalid`);
						onClose();
					}
				} catch (error) {
					setError('Failed to fetch student data: ' + error.message);
					onClose();
				} finally {
					is_fetching.current = false;
					setLoading(false);
				}
			}
		};
		fetchStudentData();
	}, [studentID, mode, onClose]);

	const SubmitForm = async (e) => {
		setSaveLoading(true);
		e.preventDefault();

		const method_type = mode === 'ADD' ? 'POST' : 'PUT';
		const formData = new FormData(e.target);
		const formValues = Object.fromEntries(formData.entries());

		// Create the submission data object with proper formatting
		const submissionData = {
			StudentID: formValues.StudentID,
			FirstName: formValues.FirstName,
			CourseID: formValues.CourseID,
			MajorID: formValues.MajorID,
			IntakeID: formValues.IntakeID,
			CreditCompleted: mode === 'ADD' ? 0 : (formValues.CreditCompleted ? Number(formValues.CreditCompleted) : 0), // Force 0 for ADD mode
			Status: formValues.Status
		};

		// For EDIT mode, include the original StudentID so the backend knows which record to update
		if (mode === 'EDIT') {
			submissionData.originalStudentID = originalStudentID;
		}

		// Ensure IntakeID is a valid number
		if (submissionData.IntakeID) {
			submissionData.IntakeID = Number(submissionData.IntakeID);
		}
		
		console.log("Form data before submission:", submissionData);

		const errors = [];
		if (!submissionData.StudentID) errors.push("Student ID is required!");
		if (!submissionData.FirstName) errors.push("Name is required!");
		if (!submissionData.CourseID) errors.push("Course is required!");
		if (!submissionData.MajorID) errors.push("Major is required!");
		if (!submissionData.IntakeID) errors.push("Intake is required!");
		if (!submissionData.Status) errors.push("Status is required!");

		if (submissionData.CreditCompleted && isNaN(submissionData.CreditCompleted)) {
			errors.push("Credits completed must be a valid number!");
		}

		if (errors.length > 0) {
			await window.Swal.fire({
				title: 'Validation Error',
				text: errors.join('\n'),
				icon: 'error'
			});
			return;
		}

		try {
			let response;
			if (method_type === 'PUT') {
				response = await StudentDB.UpdateStudent(submissionData);
			} else {
				response = await StudentDB.CreateStudent(submissionData);
			}

			console.log("API Response:", response);

			// For debugging purpose
			console.log("Received data:", submissionData);
			setSaveLoading(false);
			if (response.success) {
				await window.Swal.fire({
					title: 'Success',
					text: response.message,
					icon: 'success'
				});
				RefreshList();
				onClose();
			} else {
				await window.Swal.fire({
					title: 'Error',
					text: response.message,
					icon: 'error'
				});
			}
		} catch (error) {
			console.error('Error:', error);
			await window.Swal.fire({
				title: 'Error',
				text: 'An error occurred while saving student data',
				icon: 'error'
			});
		}
	};

	const form_heading_text = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase() + " Student";
	const is_read_only = mode === "READ";

	if (error) return <div className="VED-wrapper"><div className="VED-container p-6">Error: {error}</div></div>;

	return (
		<div className="VED-wrapper" onClick={handleBackdropClick} >
			<div className="VED-container" ref={modalRef} onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="VED-header">
					<h1 className='VED-title'>
						{`${mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase()} Student`}
						<InfoTooltip
							content={
								mode === 'VIEW'
									? "Currently viewing the Student, in this mode you are viewing the details of the student you have chosen"
									: mode === 'EDIT'
										? "Currently editting the Student, in this mode you can edit the student details such as Student ID, Name, Course, Major, and Intake Term"
										: mode === 'ADD'
											? "Adding a new Student, please fill in the necessary information for the student you are creating."
											: "Student management form" // Default fallback text
							}
							position="bottom"
							className="ml-2"
						/>
					</h1>
					<button
						onClick={onClose}
						className="VED-close-btn"
					>
						<svg width="24" height="24" stroke="currentColor" strokeWidth="2">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				{loading ? (
					<div className="flex justify-center items-center h-64 ">
						<p>Loading student data...</p>
					</div>
				) : (
					<form onSubmit={SubmitForm} className="p-6 overflow-y-auto max-h-[80vh]">

						<div className="flex flex-col md:flex-row gap-6">
							{/* Left Column */}
							<div className="flex-1">
								{/* Student ID Field */}
								<div className="mb-4">
									<label className="label-text-alt">Student ID:</label>
									<input
										type="text"
										name="StudentID"
										value={studentData.StudentID}
										onChange={(e) => setStudentData({ ...studentData, StudentID: e.target.value })}
										className="form-input"
										required
										disabled={mode === 'READ'}
									/>
								</div>

								{/* First Name Field */}
								<div className="mb-4">
									<label className="label-text-alt">Name:</label>
									<input
										type="text"
										name="FirstName"
										value={studentData.FirstName}
										onChange={(e) => setStudentData({ ...studentData, FirstName: e.target.value })}
										className="form-input"
										required
										disabled={mode === 'READ'}
									/>
								</div>

								{/* Course Field */}
								<div className="mb-4">
									<label className="label-text-alt">Course:</label>
									<select
										name="CourseID"
										value={studentData.CourseID}
										onChange={(e) => setStudentData({ ...studentData, CourseID: e.target.value })}
										className="form-input"
										required
										disabled={mode === 'READ'}
										placeholder="Select a course"
									>
										<option value="" disabled>Select a course</option>
										{courses.map(course => (
											<option key={course.id} value={course.id}>
												{course.code} - {course.name}
											</option>
										))}
									</select>
								</div>
							</div>

							{/* Right Column */}
							<div className="flex-1 md:border-l md:pl-6 border-divider">
								{/* Major Field */}
								<div className="mb-4">
									<label className="label-text-alt">Major:</label>
									<select
										name="MajorID"
										value={studentData.MajorID}
										onChange={(e) => setStudentData({ ...studentData, MajorID: e.target.value })}
										className="form-input"
										required
										disabled={mode === 'READ'}
										placeholder="Select a major"
									>
										<option value="" disabled>Select a major</option>
										{majors.map(major => (
											<option key={major.id} value={major.id}>
												{major.name}
											</option>
										))}
									</select>
								</div>

								{/* Intake Term Field */}
								<div className="mb-4">
									<label className="label-text-alt">Intake Term:</label>
									<select
										name="IntakeID"
										value={studentData.IntakeID}
										onChange={(e) => setStudentData({ ...studentData, IntakeID: e.target.value })}
										className="form-input"
										required
										disabled={mode === 'READ'}
										placeholder="Select a term"
									>
										<option value="" disabled>Select an intake term</option>
										{intakeTerms.map(intake => (
											<option key={intake.id} value={intake.id}>
												{intake.termName}
											</option>
										))}
									</select>
								</div>

								{/* Status Field */}
								<div>
									<label className="label-text-alt">Status:</label>
									<select
										name="Status"
										value={studentData.Status}
										onChange={(e) => setStudentData({ ...studentData, Status: e.target.value })}
										className="form-input"
										required
										disabled={mode === 'READ'}
									>
										<option value="Active">Active</option>
										<option value="Inactive">Inactive</option>
									</select>
								</div>
							</div>
						</div>

						{/* Action Buttons */}
						<div className="mt-6 flex flex-row justify-end space-x-4">
							{mode === "READ" ? (
								<>
									<button
										type="button"
										onClick={onClose}
										className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer"
									>
										Close
									</button>
									<button
										type="button"
										onClick={() => {
											onClose();
											HandleOpenForm('EDIT', studentData.StudentID);
										}}
										className="bg-white text-black border-2 border-solid mx-3 px-4 py-2 rounded-xl cursor-pointer"
									>
										Edit Student
									</button>
								</>
							) : (
								<>
									<button
										type="button"
										onClick={onClose}
										className="bg-white text-black border-2 border-solid mx-3 px-4 py-2 rounded-xl cursor-pointer"
									>
										Cancel
									</button>
									<button
										type="submit"
										className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer"
										disabled={saveLoading}
									>
										{saveLoading ? (
											<span className="flex items-center space-x-2">
												<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
													<circle
														className="opacity-25"
														cx="12"
														cy="12"
														r="10"
														stroke="currentColor"
														strokeWidth="4"
														fill="none"
													/>
													<path
														className="opacity-75"
														fill="currentColor"
														d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
													/>
													
												</svg>
												<span>Saving...</span>
												</span>
										) : (
											<span className='text-white'>{mode === "ADD" ? "Add Student" : "Save Changes"}</span>
										)}					
									</button>
								</>
							)}
						</div>
					</form>
				)}
			</div>
		</div>
	);
};

export default Form;