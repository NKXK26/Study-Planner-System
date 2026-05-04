import { useState, useEffect } from 'react';
import CourseDB from '@app/class/Course/CourseDB';
import MajorDB from '@app/class/Major/MajorDB';
import { useRouter } from 'next/navigation';
import CourseIntakeDB from '@app/class/CourseIntake/CourseIntakeDB';
import { useRole } from '@app/context/RoleContext';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import ActionButton from '@components/ActionButton';
//Added the theme function to understand the light/dark theme function 
const CourseListing = ({ params, error: propError, HandleOpenForm, refreshList, setPagination, courses }) => {
	const { can } = useRole();
	const { theme } = useLightDarkMode();
	const router = useRouter();
	const [majors, setMajors] = useState({});
	const [showMajorForm, setShowMajorForm] = useState(false);
	const [selectedCourse, setSelectedCourse] = useState(null);
	const [newMajorName, setNewMajorName] = useState('');
	const [editingMajor, setEditingMajor] = useState(null);
	const [error, setError] = useState(propError || null);
	const [expandedCourse, setExpandedCourse] = useState(null);
	const [deleteLoading, setDeleteLoading] = useState({});


	// Process courses data from parent component
	useEffect(() => {
		if (courses && courses.data) {
			const arr = Array.isArray(courses.data) ? courses.data : [];
			if (arr.length > 0) {
				setError(null); // Clear any previous errors
				setMajorsForCourses(arr);
			} else {
				setError({
					message: courses.message || 'No courses found',
					filtered: courses.filtered || false
				});
			}
		} else if (courses && !courses.success) {
			setError({
				message: courses.message || 'Failed to fetch courses',
				filtered: courses.filtered || false
			});
		}
	}, [courses]);


	const setMajorsForCourses = async (courses) => {
		const majorsData = {};
		for (const course of courses) {
			majorsData[course.code] = course.majors.map(major => ({
				id: major.id,
				name: major.name,
				status: major.status
			}))
		}
		setMajors(majorsData);
	}

	// Fetch majors for all courses
	/*
	Comment out first, because Beckham is testing for optimising API calls
	const fetchMajorsForCourses = async (courses) => {
		const majorsData = {};
		for (const course of courses) {
			try {
				const courseMajors = await MajorDB.FetchMajors({
					course_code: course.code,
					return: ['ID', 'CourseID', 'CourseCode', 'Name', 'Status']
				});

				if (courseMajors.success) {
					majorsData[course.code] = courseMajors.data.map(major => ({
						id: major.id,
						name: major.name,
						status: major.status
					}));
				} else {
					majorsData[course.code] = [];
				}
			} catch (err) {
				console.error(`Error fetching majors for ${course.code}:`, err);
				majorsData[course.code] = [];
			}
		}
		setMajors(majorsData);
	};
	*/
	const handleAddMajor = async () => {
		if (!can('course', 'create')) {
			window.Swal.fire({
				title: 'Permission denied',
				text: 'You need course:create permission',
				icon: 'warning'
			});
			return;
		}
		if (!newMajorName.trim()) {
			window.Swal.fire({
				title: 'Error',
				text: 'Major name is required',
				icon: 'error',
				timer: 1000,
				showConfirmButton: false,
				timerProgressBar: true
			});
			return;
		}

		// Check for duplicate major name (case-insensitive)
		if ((majors[selectedCourse.code] || []).some(m => m.name.trim().toLowerCase() === newMajorName.trim().toLowerCase())) {
			await window.Swal.fire({
				title: 'Error',
				text: 'A major with this name already exists for this course.',
				icon: 'error'
			});
			setIsProcessing(false);
			return;
		}

		setIsProcessing(true);
		try {
			const result = await MajorDB.addMajor(selectedCourse.code, newMajorName);

			if (result.message === 'Major added successfully') {
				// Update the state optimistically
				setMajors(prev => {
					// Check if the courseCode exists in the previous state
					if (!prev[courseCode]) {
						console.warn(`Course ${courseCode} not found in majors state`);
						return prev;
					}
					
					return {
						...prev,
						[courseCode]: prev[courseCode].filter(m => m.id !== majorId)
					};
				});

				setNewMajorName('');
				setShowMajorForm(false);
			} else {
				throw new Error('Add operation failed');
			}
		} catch (err) {
			window.Swal.fire({
				title: 'Error',
				text: `Failed to add major: ${err.message}`,
				icon: 'error',
				timer: 1000,
				showConfirmButton: false,
				timerProgressBar: true
			});
			// Re-fetch majors if the optimistic update failed
			if (courses && courses.data) {
				setMajorsForCourses(courses.data);
			}
		} finally {
			setIsProcessing(false);
		}
	};

	const handleDeleteMajor = async (majorId, courseCode) => {
		if (!can('course', 'delete')) {
			window.Swal.fire({
				title: 'Permission denied',
				text: 'You need course:delete permission',
				icon: 'warning'
			});
			return;
		}
		let result;
		result = await window.Swal.fire({
			title: 'Delete Major',
			text: `Are you sure you want to delete this major?\nThis action cannot be undone.`,
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#d33',
			cancelButtonColor: '#3085d6',
			confirmButtonText: 'Yes, delete it!',
			cancelButtonText: 'No, cancel'
		});

		if (!result.isConfirmed) {
			setDeleteLoading((prev) => ({ ...prev, [majorId]: false }));
			return;
		}

		setDeleteLoading((prev) => ({ ...prev, [majorId]: true }));
		try {
			const result = await MajorDB.deleteMajor(majorId);

			await window.Swal.fire({
				title: result.success ? 'Deleted!' : 'Failed to delete',
				text: result.message,
				icon: result.success ? 'success' : 'error',
				confirmButtonText: 'OK',
				confirmButtonColor: result.success ? '#6c63ff' : '#d33'
			});

			if (result.success) {
				// Update UI state
				setMajors(prev => ({
					...prev,
    				[courseCode]: (prev[courseCode] || []).filter(m => m.id !== majorId)
				}));

				// Optionally, re-fetch majors for this course for robustness
				refreshList();
			}
		} catch (err) {
			window.Swal.fire({
				title: 'Error',
				text: `Failed to delete major: ${err.message}`,
				icon: 'error',
				confirmButtonText: 'OK',
				confirmButtonColor: '#d33'
			});
			console.error('Delete error:', err);
		} finally {
			setDeleteLoading((prev) => ({ ...prev, [majorId]: false }));
		}
	};

	const handleEditMajor = (major, courseCode) => {
		setEditingMajor({ ...major, courseCode });
		setNewMajorName(major.name);
		setShowMajorForm(true);
	};

	const handleUpdateMajor = async () => {
		if (!can('course', 'update')) {
			window.Swal.fire({
				title: 'Permission denied',
				text: 'You need course:update permission',
				icon: 'warning'
			});
			return;
		}
		if (!newMajorName.trim()) {
			window.Swal.fire({
				title: 'Error',
				text: 'Major name is required',
				icon: 'error',
				timer: 1000,
				showConfirmButton: false,
				timerProgressBar: true
			});
			return;
		}

		setIsProcessing(true);
		try {
			const result = await MajorDB.updateMajor(editingMajor.id, {
				name: newMajorName,
				status: editingMajor.status || 'Active'
			});

			if (result.message === 'Major updated successfully') {
				// Update UI state
				setMajors(prev => ({
					...prev,
					[editingMajor.courseCode]: prev[editingMajor.courseCode].map(m =>
						m.id === editingMajor.id ? { ...m, name: newMajorName } : m
					)
				}));

				setNewMajorName('');
				setShowMajorForm(false);
				setEditingMajor(null);
			} else {
				throw new Error('Update operation failed');
			}
		} catch (err) {
			window.Swal.fire({
				title: 'Error',
				text: `Failed to update major: ${err.message}`,
				icon: 'error',
				timer: 1000,
				showConfirmButton: false,
				timerProgressBar: true
			});
			console.error('Update error:', err);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleDelete = async (courseCode) => {
		// Check if course has majors
		const courseMajors = majors[courseCode] || [];

		let confirmMessage = courseMajors.length > 0
			? `This course has ${courseMajors.length} major(s).\n\nDeleting this course will also delete all associated majors.\n\nAre you sure you want to proceed?`
			: 'Are you sure you want to delete this course?';

		const result = await window.Swal.fire({
			title: 'Delete Course',
			text: confirmMessage,
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#d33',
			cancelButtonColor: '#3085d6',
			confirmButtonText: 'Yes, delete it!',
			cancelButtonText: 'No, cancel'
		});

		if (!result.isConfirmed) {
			setDeleteLoading((prev) => ({ ...prev, [courseCode]: false }));
			return;
		}

		setDeleteLoading((prev) => ({ ...prev, [courseCode]: true }));
		try {
			// First delete all majors associated with this course
			/*
			Commented out by Beckham: The API already does this
			if (courseMajors.length > 0) {
				await Promise.all(
					courseMajors.map(major => MajorDB.deleteMajor(major.id))
				);
			}
			*/

			// Then delete the course
			await CourseDB.deleteCourse(courseCode);

			window.Swal.fire({
				title: 'Deleted!',
				text: 'Course has been deleted successfully.',
				icon: 'success',
				confirmButtonText: 'OK',
				confirmButtonColor: '#6c63ff'
			});

			// Refresh the list
			refreshList();
		} catch (err) {
			console.error('Delete error:', err);
			window.Swal.fire({
				title: 'Error',
				text: `Failed to delete course: ${err.message}\n\nPlease try again.`,
				icon: 'error',
				confirmButtonText: 'OK',
				confirmButtonColor: '#d33'
			});
		} finally {
			setDeleteLoading((prev) => ({ ...prev, [courseCode]: false }));
		}
	};

	const GoToMajorPage = (major_id, mode) => {
		const page_data = {
			module: "course_major",
			action: mode
		};

		localStorage.setItem('PageRequest', JSON.stringify(page_data));
		router.push(`/view/course/${major_id}`);
	}

	return (
		<>
			{!courses || !courses.data || courses.data.length === 0 ? (
				<tr>
					<td colSpan="6" className={`py-8 text-muted`} style={{ height: "120px" }}>
						<div className="flex items-center justify-center w-full h-full">
							{error?.filtered ? 'No courses match your filters' : 'No courses found'}
						</div>
					</td>
				</tr>
			) : (
				courses.data
					.slice(
						((params.page || 1) - 1) * (params.limit || 10),
						(params.page || 1) * (params.limit || 10)
					)
					.map((course, index) => (
						<tr
							key={`${course.code}-${index}`}
							className={`table-row-hover`}
						>
							<td onClick={() => HandleOpenForm("VIEW", course.code, course)} className={`px-6 py-4 whitespace-nowrap cursor-pointer table-text`}>{index + 1}</td>
							<td onClick={() => HandleOpenForm("VIEW", course.code, course)} className={`px-6 py-4 whitespace-nowrap font-medium cursor-pointer table-text`}>{course.code}</td>
							<td onClick={() => HandleOpenForm("VIEW", course.code, course)} className={`px-6 py-4 whitespace-nowrap cursor-pointer table-text`}>{course.name}</td>
							<td
								className={`px-6 py-4 w-100`}
							>
								{majors[course.code]?.length > 0 ? (
									majors[course.code].length === 1 ? (
										// Single major: always visible action buttons
										<div className="p-1"
										>
											<div className="flex items-center justify-between">
												<span className={`mr-2 table-text`}>{majors[course.code][0].name}</span>
												<div className="flex items-center space-x-2">
													{/* Users need to have access to the intakes to view it */}
													{(can('intakes', 'read')) && (
														<ActionButton
															actionType="view"
															onClick={(e) => {
																e.stopPropagation();
																GoToMajorPage(majors[course.code][0].id, 'read');
															}}
															title="View major"
														/>
													)}
													{/*<button
															className={`btn-close cursor-pointer flex items-center justify-center`}
															disabled={isProcessing}
															onClick={(e) => {
																e.stopPropagation();
																GoToMajorPage(majors[course.code][0].id, 'read');
															}}
															title="View"
														>
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
																<path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
																<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
															</svg>
														</button>*/}
														{can('intakes', 'update') && (
															<ActionButton
																actionType="edit"
																onClick={(e) => {
																	e.stopPropagation();
																	GoToMajorPage(majors[course.code][0].id, 'edit');
																}}
																title="Edit major"
															/>
														)}
														{/*<button
															className={`flex items-center justify-center ${can('course', 'update')
																? 'btn-close cursor-pointer'
																: 'text-gray-500 cursor-not-allowed'}`}
															onClick={(e) => {
																e.stopPropagation();
																GoToMajorPage(majors[course.code][0].id, 'edit');
															}}
															disabled={isProcessing || !can('course', 'update')}
															title="Edit"
														>
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
																<path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
															</svg>
														</button>*/}
														{can('intakes', 'delete') && (
															<ActionButton
																actionType="delete"
																onClick={(e) => {
																	e.stopPropagation();
																	handleDeleteMajor(majors[course.code][0].id);
																}}
																isLoading={deleteLoading[majors[course.code][0].id]}
																loadingText="Deleting..."
																title="Delete major"
															/>
														)}
														{/*<button
															className={`flex items-center justify-center ${can('course', 'delete')
																? 'btn-close cursor-pointer'
																: 'text-gray-500 cursor-not-allowed'}`}
															onClick={(e) => {
																e.stopPropagation();
																handleDeleteMajor(majors[course.code][0].id, course.code);
															}}
															disabled={isProcessing || !can('course', 'delete')}
															title="Delete"
														>
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
																<path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
															</svg>
														</button>*/}
												</div>
											</div>
										</div>
									) : (
										// Multiple majors: show dropdown
										<div className="space-y-1">
											<div
												className="flex items-center cursor-pointer p-1 table-row-hover"
												onClick={(e) => {
													e.stopPropagation();
													setExpandedCourse(expandedCourse === course.code ? null : course.code);
												}}
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													fill="none"
													viewBox="0 0 24 24"
													strokeWidth={1.5}
													stroke="currentColor"
													className={`w-4 h-4 mr-2 transition-transform ${expandedCourse === course.code ? 'rotate-90' : ''}`}
												>
													<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
												</svg>
												<span className={`table-text`}>{majors[course.code].length} majors</span>
											</div>
											{expandedCourse === course.code && (
												<div className="pl-6 space-y-2">
													{majors[course.code].map((major) => (
														<div
															key={major.id}
															className={`p-1 ${can('intakes', 'read') ? "cursor-pointer": ""} table-row-hover`}
														>

															<div className="flex items-center justify-between">
																<span className={`mr-2 table-text`}>{major.name}</span>
																<div className="flex items-center space-x-2">
																	{/* Users need to have access to the intakes to view it */}
																	{(can('intakes', 'read')) && (
																		<ActionButton
																			actionType="view"
																			onClick={(e) => {
																				e.stopPropagation();
																				GoToMajorPage(major.id, 'read');
																			}}
																			title="View major"
																		/>
																	)}
																	{/* Users need to have access to the intakes to view it */}
																	{(can('intakes', 'update')) && (
																		<ActionButton
																			actionType="edit"
																			onClick={(e) => {
																				e.stopPropagation();
																				GoToMajorPage(major.id, 'edit');
																			}}
																			title="Edit major"
																		/>
																	)}
																	{/* Users need to have access to the intakes to view it */}
																	{(can('intakes', 'delete')) && (
																		<ActionButton
																			actionType="delete"
																			onClick={(e) => {
																				e.stopPropagation();
																				handleDeleteMajor(major.id, course.code);
																			}}
																			isLoading={deleteLoading[major.id]}
																			loadingText="Deleting..."
																			title="Delete major"
																		/>
																	)}
																</div>
															</div>
														</div>
													))}
												</div>
											)}
										</div>
									)
								) : (
									<div className={`text-muted`}>No majors</div>
								)}
							</td>

							<td className={`px-6 py-4 whitespace-nowrap cursor-pointer table-text`}>{course.credits_required}</td>
							<td className="px-6 py-4 whitespace-nowrap">
								<div className="flex items-center space-x-2">
									{can('course', 'read') && (
										<ActionButton
											actionType="view"
											onClick={(e) => {
												e.stopPropagation();
												HandleOpenForm("VIEW", course.code, course);
											}}
											title="View course"
										/>
									)}
									{can('course', 'update') && (
										<ActionButton
											actionType="edit"
											onClick={(e) => {
												e.stopPropagation();
												HandleOpenForm("EDIT", course.code, course);
											}}
											title="Edit course"
										/>
									)}
									{can('course', 'delete') && (
										<ActionButton
											actionType="delete"
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(course.code);
											}}
											isLoading={deleteLoading[course.code]}
											loadingText="Deleting..."
											title="Delete course"
										/>
									)}
								</div>
							</td>
						</tr>
					))
			)}

			{showMajorForm && (
				<tr>
					<td>
						<div className={`theBoxOfInformationBackground`}>
							<div className={`theBoxOfInformation ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-6 rounded-lg w-96`}>
								<h2 className={`heading-text text-xl font-bold mb-4`}>
									{editingMajor ? 'Edit Major' : `Add Major to ${selectedCourse?.code}`}
								</h2>
								<input
									type="text"
									value={newMajorName}
									onChange={(e) => setNewMajorName(e.target.value)}
									placeholder="Enter major name"
									className={`input-field w-full p-2 border mb-4 rounded`}
								/>
								<div className="flex justify-end space-x-4">
									<button
										onClick={() => {
											setShowMajorForm(false);
											setEditingMajor(null);
											setNewMajorName('');
										}}
										className="btn-cancel px-4 py-2 rounded disabled:opacity-50"
										disabled={isProcessing}
									>
										Cancel
									</button>
									<button
										onClick={editingMajor ? handleUpdateMajor : handleAddMajor}
										className="btn-primary px-4 py-2 rounded disabled:opacity-50"
										disabled={isProcessing}
									>
										{isProcessing ? (
											<span className="flex items-center justify-center">
												<svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
													<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
													<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
												</svg>
												{editingMajor ? 'Updating...' : 'Creating...'}
											</span>
										) : editingMajor ? 'Update Major' : 'Create Major'}
									</button>
								</div>
							</div>
						</div>
					</td>
				</tr>
			)}
		</>
	);
};

export default CourseListing;