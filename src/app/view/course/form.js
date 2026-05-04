'use client';
import { useEffect, useState, useRef } from 'react';
import CourseDB from '@app/class/Course/CourseDB';
import CourseIntakeDB from '@app/class/CourseIntake/CourseIntakeDB.js';
import Button from '../../../components/button.js';
import MajorDB from '@app/class/Major/MajorDB';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import ActionButton from '@components/ActionButton.js';
import { useRole } from '@app/context/RoleContext';
import InfoTooltip from '@components/InfoTooltip.js';

const Form = ({ onClose, mode, courseCode, RefreshList, HandleOpenForm, course }) => {
	const { theme } = useLightDarkMode();
	// Ensure we have permission helpers available
	const { can } = useRole();
	const [courseData, setCourseData] = useState({
		id: '',
		code: '',
		name: '',
		credits_required: '',
		status: 'Draft'
	});

	const [isLoading, setIsLoading] = useState(mode === 'VIEW' || mode === 'EDIT');
	const is_fetching = useRef(false);
	const [majorCount, setMajorCount] = useState(0);
	const [majors, setMajors] = useState([]);
	const [newMajor, setNewMajor] = useState({ name: '' });
	const [isProcessing, setIsProcessing] = useState(false);
	const [showAddMajorForm, setShowAddMajorForm] = useState(false);
	const [saveLoading, setSaveLoading] = useState(false)
	const [deleteLoading, setDeleteLoading] = useState(false)

	const modalRef = useRef(null);

	const handleBackdropClick = (e) => {
		if (e.target === modalRef.current) {
			onClose();
		}
	};

	useEffect(() => {
		const processCourseData = async () => {
			setIsLoading(true);
			console.log('course', course);

			try {
				// 1. Initial check to ensure 'course' is not null/undefined before accessing properties
				if (!course) {
					// If course is expected to be fetched asynchronously elsewhere,
					// you might just return here or handle the loading state differently.
					console.warn("Course data is missing or not yet loaded.");
					return;
				}

				// 2. Set state data
				setCourseData({
					id: course.id,
					code: course.code,
					name: course.name,
					credits_required: course.credits_required,
					status: course.status
				});

				// Ensure 'majors' array exists before accessing its length
				const majorsArray = Array.isArray(course.majors) ? course.majors : [];
				setMajors(majorsArray);
				setMajorCount(majorsArray.length);

			} catch (error) {
				await window.Swal.fire({
					title: 'Error',
					text: 'Failed to process course data',
					icon: 'error'
				});
				console.error(error);
			} finally {
				is_fetching.current = false;
				setIsLoading(false);
			}
		};

		processCourseData();

	}, [course, courseCode, mode, onClose]);
	/* 
	Commented Out - Beckham
	Optimising API calls, keep this as backup
	const fetchMajors = async (course_code) => {
		const res = await MajorDB.FetchMajors({ course_code: course_code });
		if (res.success) {
			setMajors(res.data);
			setMajorCount(res.data.length);
		}
	};
	*/
	const handleAddMajor = async () => {
		const newMajorNameTrimmed = newMajor.name.trim().toLowerCase();
		if (!newMajorNameTrimmed) {
			await window.Swal.fire({
				title: 'Error',
				text: 'Major name is required',
				icon: 'error'
			});
			return;
		}

		// Check for duplicate major name (case-insensitive)
		if (majors.some(m => m.name.trim().toLowerCase() === newMajorNameTrimmed)) {
			await window.Swal.fire({
				title: 'Error',
				text: 'A major with this name already exists for this course.',
				icon: 'error'
			});
			return;
		}

		// Optimistically update UI
		const tempMajor = { id: Date.now(), name: newMajor.name }; // Temporary ID
		setMajors([...majors, tempMajor]);
		setNewMajor({ name: '' });
		setMajorCount(prev => prev + 1);

		try {
			const res = await MajorDB.addMajor(courseData.code, newMajor.name);

			if (!res.major) {
				// If failed, revert the optimistic update
				setMajors(majors);
				setMajorCount(prev => prev - 1);
				await window.Swal.fire({
					title: 'Error',
					text: 'Failed to add major',
					icon: 'error'
				});
			}
		} catch (error) {
			// If error, revert the optimistic update
			setMajors(majors);
			setMajorCount(prev => prev - 1);
			await window.Swal.fire({
				title: 'Error',
				text: error.message || 'Error adding major',
				icon: 'error'
			});
			console.error(error);
		}
	};

	const handleDeleteMajor = async (majorId) => {

		let result = await window.Swal.fire({
			title: 'Delete Major',
			text: `Are you sure you want to delete this major?\nThis action cannot be undone.`,
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#d33',
			cancelButtonColor: '#3085d6',
			confirmButtonText: 'Yes, delete it!',
			cancelButtonText: 'No, cancel'
		});

		if (!result.isConfirmed) return;
		setDeleteLoading(true);

		try {
			let res = await MajorDB.deleteMajor(majorId);
			setDeleteLoading(false);
			await window.Swal.fire({
				title: res.success ? 'Deleted!' : 'Fail to delete',
				text: res.message,
				icon: res.success ? 'success' : 'error'
			});

			if (res.success) {
				const previousMajors = [...majors];

				// Optimistically update UI
				setMajors(previousMajors.filter(major => major.id !== majorId));
				setMajorCount(prev => prev - 1);
			}

		} catch (err) {
			window.Swal.fire({
				title: 'Error',
				text: `Failed to delete major: ${err.message}`,
				icon: 'error',
				timer: 1000,
				showConfirmButton: false,
				timerProgressBar: true
			});
			console.error('Delete error:', err);
		}
	};

	const SubmitForm = async (e) => {
		setSaveLoading(true);
		e.preventDefault();
		const formData = new FormData(e.target);
		const course = Object.fromEntries(formData.entries());

		// Basic validation
		const errors = [];
		if (!course.code) errors.push("Code is required!");
		if (!course.name) errors.push("Name is required!");
		if (!course.credits_required) errors.push("Credits Required is required!");

		if (isNaN(course.credits_required) || parseFloat(course.credits_required) <= 0) {
			errors.push("Credits Required must be a positive number!");
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
			const method_type = mode === 'ADD' ? 'POST' : 'PUT';
			const dataToSend = {
				...course,
				credits_required: parseFloat(course.credits_required),
				...(method_type === 'PUT' && { id: courseData.id })
			};

			const response = await CourseDB.SaveCourse(dataToSend, method_type);
			setSaveLoading(false);
			if (response.error) {
				// Handle duplicate errors with field-specific feedback
				if (response.status === 409) {
					if (response.field === 'code') {
						setCourseData(prev => ({ ...prev, code: courseData.code }));
					} else if (response.field === 'name') {
						setCourseData(prev => ({ ...prev, name: courseData.name }));
					}
					await window.Swal.fire({
						title: 'Error',
						text: response.message,
						icon: 'error'
					});
					return;
				}
				throw new Error(response.message || 'Failed to save course');
			}

			await window.Swal.fire({
				title: 'Success',
				text: `Course ${mode === 'ADD' ? 'added' : 'updated'} successfully`,
				icon: 'success'
			});
			RefreshList();
			onClose();
		} catch (error) {
			await window.Swal.fire({
				title: 'Error',
				text: error.message,
				icon: 'error'
			});
			console.error(error);
		}
	};

	const HandleConfirmDelete = async () => {
		setDeleteLoading(true);
		try {
			const res = await CourseDB.deleteCourse(courseData.code);
			if (res && res.success) {
				await window.Swal.fire({
					title: 'Deleted!',
					text: res.message,
					icon: 'success'
				});
				onClose();
				RefreshList();
			} else {
				await window.Swal.fire({
					title: 'Error',
					text: (res && res.message) || 'Failed to delete course',
					icon: 'error'
				});
			}
		} catch (error) {
			await window.Swal.fire({
				title: 'Error',
				text: 'An error occurred while deleting the course',
				icon: 'error'
			});
			console.error(error);
		} finally {
			setDeleteLoading(false);
		}
	};

	const form_heading_text = `${mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase()} Course`;
	const is_read_only = mode === "VIEW";

	return (
		<div ref={modalRef} className="VED-wrapper" onClick={handleBackdropClick}>
			<div className="VED-container">
				{/* Header */}
				<div className="VED-header">
					<h1 className='VED-title'>
						{form_heading_text}
						<InfoTooltip
							content={
								mode === 'VIEW'
									? "Currently viewing the Course, in this mode you are viewing the details of the course you have chosen"
									: mode === 'EDIT'
										? "Currently editting the Course, in this mode you can edit the course details such as Code, Name, Credits Required, and Majors"
										: mode === 'ADD'
											? "Adding a new Course, please fill in the necessary information for the course you are creating."
											: "Course management form" // Default fallback text
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

				{isLoading ? (
					<div className="flex justify-center items-center h-64">
						<p className={`${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Loading courses...</p>
					</div>
				) : (
					<form onSubmit={SubmitForm} className="p-6 overflow-y-auto">

						<div className="flex md:flex-row flex-col gap-6">
							{/* Left Column */}
							<div className="flex-1">
								{/* Code Field */}
								<div className="mb-4">
									<label className="label-text-alt">Code:</label>
									<input
										type="text"
										name="code"
										value={courseData.code}
										onChange={(e) => setCourseData({ ...courseData, code: e.target.value })}
										className="form-input"
										required
										disabled={is_read_only}
									/>
								</div>

								{/* Name Field */}
								<div className="mb-4">
									<label className="label-text-alt">Name:</label>
									<input
										type="text"
										name="name"
										value={courseData.name}
										onChange={(e) => setCourseData({ ...courseData, name: e.target.value })}
										className="form-input"
										required
										disabled={is_read_only}
									/>
								</div>
							</div>

							{/* Right Column */}
							<div className="flex-1 md:pl-6">
								{/* Credits Required Field */}
								<div className="mb-4">
									<label className="label-text-alt">Credits Required:</label>
									<input
										type="number"
										name="credits_required"
										value={courseData.credits_required}
										onChange={(e) => setCourseData({ ...courseData, credits_required: e.target.value })}
										className="form-input"
										step="0.5"
										min="0"
										required
										disabled={is_read_only}
									/>
								</div>

								{/* Status Field */}
								<div className="mb-4">
									<label className="label-text-alt">Status:</label>
									<select
										name="status"
										value={courseData.status}
										onChange={(e) => setCourseData({ ...courseData, status: e.target.value })}
										className="form-input"
										disabled={is_read_only}
									>
										<option value="unavailable">Unavailable</option>
										<option value="published">Published</option>
										<option value="unpublished">Unpublished</option>
									</select>
								</div>

								{/* Majors Section */}
								{(mode === 'EDIT' || mode === 'VIEW') && (
									<div className="mt-6">
										<h2 className="heading-text text-xl font-semibold mb-4">Majors</h2>

										{/* Add Major Form - Only show in EDIT mode */}
										{mode === 'EDIT' && (
											<div className="flex gap-2 mb-4">
												<input
													type="text"
													value={newMajor.name}
													onChange={(e) => setNewMajor({ name: e.target.value })}
													className="form-input flex-1"
													placeholder="Enter major name"
												/>
												<button
													type="button"
													onClick={handleAddMajor}
													className="btn-primary px-4 py-2 rounded-lg flex items-center"
												>
													Add
												</button>
											</div>
										)}

										{/* Majors List */}
										<div className={`space-y-2 overflow-auto max-h-30`}>
											{majors.map((major) => (
												<div key={major.id} className="p-3 border border-divider rounded-lg flex justify-between items-center">
													<h4 className="text-primary font-regular">{major.name}</h4>
													{mode === 'EDIT' && (
														<button
															type="button"
															onClick={() => handleDeleteMajor(major.id)}
															className="text-red-500 hover:text-red-700 cursor-pointer"
														>
															<svg width="20" height="20" stroke="currentColor" strokeWidth="2">
																<line x1="18" y1="6" x2="6" y2="18" />
																<line x1="6" y1="6" x2="18" y2="18" />
															</svg>
														</button>
													)}
												</div>
											))}
											{majors.length === 0 && (
												<p className="text-muted text-center py-4">No majors added yet</p>
											)}
										</div>
									</div>
								)}
							</div>
						</div>

						{/* Action Buttons */}
						<div className="mt-6 flex flex-wrap justify-end gap-4">
							{mode === "VIEW" ? (
								<>
									<button
										type="button"
										onClick={onClose}
										className="btn-primary px-4 py-2 rounded-xl"
									>
										Close
									</button>
									{can('course', 'update') && (
										<button
											type="button"
											onClick={() => {
												onClose();
												HandleOpenForm('EDIT', courseData.code);
											}}
											className="btn-secondary px-4 py-2 rounded-xl"
										>
											Edit Course
										</button>
									)}
									{/*
									<button
										type="button"
										onClick={() => {
											onClose();
											HandleOpenForm('EDIT', courseData.code);
										}}
										className="btn-secondary px-4 py-2 rounded-xl"
									>
										Edit Course
									</button> */}
								</>
							) : (
								<>
									<Button
										type="button"
										onClick={onClose}
										variant="cancel"
									>
										Cancel
									</Button>
									{mode === "EDIT" && (
										<button
											type="button"
											onClick={async () => {
												let text = 'Are you sure you want to delete this course? This action cannot be undone.';
												let result;
												if (majorCount > 0) {
													text = `Please make sure that this course has no majors before deleting`;
													result = await window.Swal.fire({
														toast: true,
														position: 'top-end',
														icon: 'error', // Use 'error' instead of 'warning'
														title: 'Please make sure that this course has no majors before deleting',
														showConfirmButton: false,
														timer: 5000,
														timerProgressBar: true,
														iconColor: '#DC2D27'
													});
												} else {
													result = await window.Swal.fire({
														title: 'Delete Course',
														text,
														icon: 'warning',
														showCancelButton: true,
														confirmButtonColor: '#d33',
														cancelButtonColor: '#d33',
														confirmButtonText: 'Confirm Delete',
														cancelButtonText: 'Cancel'
													});
													if (result.isConfirmed) {
														setDeleteLoading(true); // Set loading state first
														await HandleConfirmDelete(); // Then await the delete operation
													}
												}
											}}
											className="btn-delete px-4 py-2 rounded-xl"
										>
											{deleteLoading ? (
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
													<span>Deleting...</span>
												</span>
											) : (
												<>Delete Course</>
											)
											}
										</button>
									)}
									<Button
										type="submit"
										variant="submit"
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
											<span className='text-white'>{mode === "ADD" ? "Add Course" : "Save Changes"}</span>
										)}
									</Button>
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