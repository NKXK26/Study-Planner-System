'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import CourseListing from './listing';
import Form from './form';
import FileUploader from './FileUploader';
import styles from '@styles/course.module.css';
import RequireAuth from '@app/RequireAuth';
import { ConditionalRequireAuth } from '@components/helper';
import CourseDB from '@app/class/Course/CourseDB';
import { useRole } from '@app/context/RoleContext';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import InfoTooltip from '@components/InfoTooltip';


const Course = () => {
	const { can } = useRole();
	const { theme } = useLightDarkMode();
	const [showForm, setShowForm] = useState(false);
	const [formMode, setFormMode] = useState("VIEW");
	const [showFileUploader, setShowFileUploader] = useState(false);
	const [selectedCourseCode, setSelectedCourseCode] = useState(null);
	const [selectedCourse, setSelectedCourse] = useState(null);
	const [error, setError] = useState(null);
	const [courses, setCourses] = useState([]);
	const [pagination, setPagination] = useState({
		total: 0,
		page: 1,
		limit: 10,
		totalPages: 0
	});

	// Actual search parameters that get sent to the backend
	const [params, setParams] = useState({
		code: "",
		return: ["Code", "Name", "CreditsRequired"],
		order_by: [{ column: "Code", ascending: true }],
		include_majors: true,
		page: 1,
		limit: 10
	});

	// Temporary input values that don't trigger search
	const [inputValues, setInputValues] = useState({
		code: ""
	});

	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [pageError, setPageError] = useState(null);

	const is_first_load = useRef(true);
	const formRef = useRef(null);
	const isFetching = useRef(false);

	// Check if user has permission to access this page
	const hasPermission = can('course', 'read');

	// Debug hasPermission changes
	useEffect(() => {
		console.log('hasPermission changed to:', hasPermission);
	}, [hasPermission]);

	// Open form handler
	const HandleOpenForm = (mode, courseCode = null, course = null) => {
		// Permission gating for simulated roles
		if (mode === 'ADD' && !can('course', 'create')) {
			window.Swal?.fire?.({ title: 'Permission denied', text: 'You need course:create', icon: 'warning' });
			return;
		}
		if (mode === 'EDIT' && !can('course', 'update')) {
			window.Swal?.fire?.({ title: 'Permission denied', text: 'You need course:update', icon: 'warning' });
			return;
		}
		setFormMode(mode);
		setSelectedCourseCode(courseCode);
		setSelectedCourse(course);
		setShowForm(true);
	};

	// File uploader handlers
	const handleOpenFileUploader = () => {
		setShowFileUploader(true);
	};
	const handleCloseFileUploader = () => {
		setShowFileUploader(false);
	};

	// Filter Change handler
	const HandleFilterChange = (e) => {
		const { name, value } = e.target;
		setInputValues(prev => ({
			...prev,
			[name]: value.trim()
		}));
	};

	const handleKeyDown = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleSearch();
		}
	};

	const handleSearch = () => {
		setParams(prev => ({ ...prev, ...inputValues }));
		setIsInitialLoad(false);
	};

	// Pagination handlers (frontend-only)
	const handlePageChange = (newPage) => {
		if (!newPage || newPage === pagination.page) return;
		setParams(prev => ({ ...prev, page: newPage }));
		setPagination(prev => ({ ...prev, page: newPage }));
	};

	const handleLimitChange = (newLimit) => {
		if (!newLimit || newLimit === pagination.limit) return;
		setParams(prev => ({ ...prev, limit: newLimit, page: 1 }));
		setPagination(prev => ({ ...prev, limit: newLimit, page: 1, totalPages: prev.total > 0 ? Math.ceil(prev.total / newLimit) : 0 }));
	};


	const fetchCourses = async () => {
		// Prevent multiple simultaneous calls
		if (isFetching.current) {
			console.log('fetchCourses already in progress, skipping...');
			return;
		}

		try {
			isFetching.current = true;
			console.log('fetchCourses called with params:', params);
			setIsLoading(true);
			setPageError(null);
			// Remove the _refresh parameter before making API call
			const { _refresh, ...apiParams } = params;
			const courses = await CourseDB.FetchCourses(apiParams);
			if (!courses.success && courses.filtered) {
				await window.Swal.fire({
					title: 'No Results',
					text: 'No courses match your code. Try Again',
					icon: 'info',
					confirmButtonColor: '#3085d6',
				});

				resetFilters();
				return;
			}
			setCourses(courses);

			// Update pagination if the response includes pagination data
			if (courses.pagination) {
				console.log('Setting pagination from API:', courses.pagination);
				setPagination(courses.pagination);
			} else {
				// If no pagination from API, calculate it from the data length
				const total = courses.data ? courses.data.length : 0;
				const limit = params.limit || 10;
				const page = params.page || 1;
				const totalPages = Math.ceil(total / limit);
				console.log('Calculating pagination from data:', { total, limit, page, totalPages });
				setPagination({ total, limit, page, totalPages });
			}
		} catch (error) {
			console.error('Error fetching courses:', error);
			setPageError('Failed to load courses');
		} finally {
			setIsLoading(false);
			isFetching.current = false;
		}
	};

	useEffect(() => {
		console.log('useEffect triggered - params:', params, 'hasPermission:', hasPermission);
		// Only fetch if user has permission (authenticated and authorized)
		if (hasPermission) {
			fetchCourses();
		}
	}, [params, hasPermission]);

	// Refresh function
	const refreshList = useCallback(() => {
		// Force a re-fetch by updating a timestamp
		setParams(prev => ({ ...prev, _refresh: Date.now() }));
	}, []);

	// Reset filters
	const resetFilters = () => {
		setParams({
			code: "",
			return: ["Code", "Name", "CreditsRequired"],
			order_by: [{ column: "Code", ascending: true }],
			include_majors: true,
		});
		setInputValues({
			code: ""
		});
		setIsInitialLoad(false);
	};

	const handleConfirmDelete = async () => {
		if (!can('course', 'delete')) {
			await window.Swal?.fire?.({ title: 'Permission denied', text: 'You need course:delete', icon: 'warning' });
			return;
		}
		try {
			if (!selectedCourseCode) {
				throw new Error("No course selected for deletion");
			}

			const response = await CourseDB.DeleteCourse({
				CourseID: selectedCourseCode
			});

			if (response.success) {
				await window.Swal.fire({
					title: 'Deleted!',
					text: 'Course has been deleted successfully.',
					icon: 'success'
				});
				setSelectedCourseCode(null);
				// Refresh list by updating timestamp
				setParams(prev => ({ ...prev, _refresh: Date.now() }));
			} else {
				await window.Swal.fire({
					title: 'Error',
					text: response.message || 'Failed to delete course',
					icon: 'error'
				});
			}
		} catch (err) {
			console.error("Delete error:", err);
			await window.Swal.fire({
				title: 'Error',
				text: err.message || 'An error occurred while deleting the course',
				icon: 'error'
			});
		}
	};

	// Add click outside handler
	useEffect(() => {
		const handleClickOutside = (event) => {
			// Check if click is on the confirmation dialog
			const confirmDialog = document.querySelector('.swal2-container');
			if (confirmDialog && confirmDialog.contains(event.target)) {
				return;
			}

			if (formRef.current && !formRef.current.contains(event.target)) {
				setShowForm(false);
			}
		};

		if (showForm) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [showForm]);

	return (
		<ConditionalRequireAuth>
			<PageLoadingWrapper
				requiredPermission={{ resource: 'course', action: 'read' }}
				resourceName="course management"
				isLoading={isLoading}
				loadingText="Loading courses..."
				error={pageError}
				errorMessage="Failed to load courses"
			>
				<div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
					<div className="w-full px-4 sm:px-6 lg:px-8 py-6">


						{showForm && (
							<div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
								<div className={`theBoxOfInformationBackground`} ref={formRef}>
									<Form
										onClose={() => setShowForm(false)}
										mode={formMode}
										courseCode={selectedCourseCode}
										RefreshList={refreshList}
										HandleOpenForm={HandleOpenForm}
										course={selectedCourse}
									/>
								</div>
							</div>
						)}

						{showFileUploader && (
							<FileUploader
								onClose={handleCloseFileUploader}
								onUploadSuccess={refreshList}
							/>
						)}

						<div className={`course-wrapper p-3 w-full overflow-y-auto h-screen ${styles.courseWrapper}`}>
							<h1 className='module-heading text-4xl font-bold mb-6'>
								Course Management
								<InfoTooltip
									content={"In this page, it is where all the courses that are currently in the database will be shown. All courses have their Code, Name, Majors, and Credits Required."}
									position='right'
									className='info-bttn'
								></InfoTooltip>
							</h1>

							{/* SEARCH INTERFACE */}
							<div className='flex space-x-4 mb-6 lg:flex-row flex-col md:text-md text-sm'>
								<div className='flex-1 w-full'>
									<input
										type="text"
										name="code"
										placeholder="Search by Course Code"
										className="border w-full p-3 rounded-md"
										value={inputValues.code}
										onChange={HandleFilterChange}
										onKeyDown={handleKeyDown}
									/>
								</div>


								<div className='flex sm:flex-row flex-col gap-2 lg:mt-0 mt-4'>
									<div className='flex flex-row sm:w-auto w-full gap-2'>
										<button
											onClick={resetFilters}
											className={`px-4 py-3 rounded-md flex justify-center items-center cursor-pointer sm:flex-none flex-1 ${theme === 'dark' ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-50 border'}`}
										>
											Reset Filters
										</button>
										<button
											onClick={handleSearch}
											disabled={!inputValues.code || inputValues.code.trim() === ''}
											className={`px-4 py-3 rounded-md flex justify-center items-center cursor-pointer sm:flex-none flex-1 ${!inputValues.code || inputValues.code.trim() === ''
												? "bg-gray-400 text-white cursor-not-allowed"
												: "bg-[#DC2D27] text-white hover:bg-red-700"
												}`}
										>
											Search
										</button>
									</div>
									<div className='flex flex-row gap-2 sm:w-auto w-full'>
										{can('course', 'create') && (
											<button
												onClick={() => HandleOpenForm("ADD")}
												disabled={!can('course', 'create')}
												className={`px-4 py-3 rounded-md flex justify-center items-center sm:flex-none flex-1 ${can('course', 'create') ? 'bg-[#DC2D27] text-white cursor-pointer' : 'bg-gray-300 text-white cursor-not-allowed'}`}
											>
												Add Course
												<span className="ml-1 text-xl">+</span>
											</button>
										)}
									</div>
								</div>
							</div>

							{/* TABLE FOR COURSES */}
							<div className='course-listing-container overflow-x-auto mt-5 shadow-md sm:rounded-lg'>
								<table className={`table-base`}>
									<thead>
										<tr className={`table-header-row`}>
											<th scope="col" className="px-6 py-4 w-16">No</th>
											<th scope="col" className="px-6 py-4">Code</th>
											<th scope="col" className="px-6 py-4">Name</th>
											<th scope="col" className="px-6 py-4">Majors</th>
											<th scope="col" className="px-6 py-4">Credits Required</th>
											<th scope="col" className="px-6 py-4">Actions</th>
										</tr>
									</thead>
									<tbody className={`table-body-divided`}>
										<CourseListing
											params={params}
											error={error}
											HandleOpenForm={HandleOpenForm}
											refreshList={refreshList}
											courses={courses}
											onNoCoursesFound={resetFilters}
											setPagination={setPagination}
										/>
									</tbody>
								</table>
							</div>

							{/* Pagination Controls */}
							{console.log('Pagination state:', pagination)}
							{pagination.total > 0 && (
								<div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
									{/* Items per page selector */}
									<div className="flex items-center gap-2">
										<label className={`label-text text-sm`}>Items per page:</label>
										<select
											value={params.limit || 10}
											onChange={(e) => handleLimitChange(parseInt(e.target.value))}
											className={`select-field rounded px-2 py-1 text-sm`}
										>
											<option value={10}>10</option>
											<option value={20}>20</option>
										</select>
									</div>

									{/* Page info */}
									<div className={`pagination-information`}>
										Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
									</div>

									{/* Page navigation */}
									<div className="flex items-center gap-2">
										<button
											onClick={() => handlePageChange(pagination.page - 1)}
											disabled={pagination.page <= 1}
											className={`pagination-btn`}
										>
											Previous
										</button>

										{/* Page numbers */}
										<div className="flex items-center gap-1">
											{Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
												let pageNum;
												if (pagination.totalPages <= 5) {
													pageNum = i + 1;
												} else if (pagination.page <= 3) {
													pageNum = i + 1;
												} else if (pagination.page >= pagination.totalPages - 2) {
													pageNum = pagination.totalPages - 4 + i;
												} else {
													pageNum = pagination.page - 2 + i;
												}

												return (
													<button
														key={pageNum}
														onClick={() => handlePageChange(pageNum)}
														className={`${pagination.page === pageNum ? 'pagination-btn-active' : 'pagination-btn'}`}
													>
														{pageNum}
													</button>
												);
											})}
										</div>

										<button
											onClick={() => handlePageChange(pagination.page + 1)}
											disabled={pagination.page >= pagination.totalPages}
											className={`pagination-btn`}
										>
											Next
										</button>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</PageLoadingWrapper>
		</ConditionalRequireAuth>
	);
}

export default Course;