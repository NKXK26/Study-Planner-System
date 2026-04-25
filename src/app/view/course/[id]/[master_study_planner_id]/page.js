'use client'

import { React, useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation';
import { useParams } from 'next/navigation';
import Year from './year'
import StudyPlanner from '@app/class/StudyPlanner/StudyPlanner'
import UnitTypeDB from '@app/class/UnitType/UnitTypeDB'
import MasterStudyPlannerDB from '@app/class/MasterStudyPlanner/MasterStudyPlannerDB';
import { ConditionalRequireAuth } from 'components/helper';
import MajorDB from '@app/class/Major/MajorDB';
import { redirect } from 'components/helper';
import { useRouter } from "next/navigation";
import { SaveStudyPlannerAsPDF } from './master_study_planner_pdf_export';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import CourseIntakeDB from '@app/class/CourseIntake/CourseIntakeDB';
import CourseIntakeList from './course_intake_list';
import InfoTooltip from '@components/InfoTooltip';
import LoadingSpinner from '@components/LoadingSpinner';


const StudyPlannerPage = () => {
	const { can } = useRole(); // Get permission checking function
	const [studyPlanner, setStudyPlanner] = useState(null);
	const [originalStudyPlanner, setOriginalStudyPlanner] = useState(null);
	const [unitTypes, setUnitTypes] = useState([]);
	const [state, setState] = useState();
	const [confirmConfig, setConfirmConfig] = useState({
		title: '',
		description: '',
		isOpen: false,
		onConfirm: null,
		confirmButtonColor: 'red'
	});
	const [master_study_planner_id, setMasterStudyPlannerId] = useState(null);
	const [majorID, setMajorID] = useState(null);
	const [mode, setMode] = useState(null);
	const [isPlannerInfoExpanded, setIsPlannerInfoExpanded] = useState(true);
	const [error, setError] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isIntakeLoading, setIsIntakeLoading] = useState(false)
	const [is_read_only, setIsReadOnly] = useState(true);
	const [has_changes, setHasChanges] = useState(false);
	const [saveLoading, setSaveLoading] = useState(false);
	const params = useParams();
	const [availableIntakes, setAvailableIntakes] = useState([]);
	const [openIntakeList, setOpenIntakeList] = useState(false);
	const [lastModified, setLastModified] = useState(null);
	const [unitTypeSummary, setUnitTypeSummary] = useState({});
	const [listOfConflicts, setListOfConflicts] = useState([]);
	const [currentConflictIndex, setCurrentConflictIndex] = useState(-1);


	useEffect(() => {
		const master_study_planner_id = params.master_study_planner_id;
		const major_id = params.id;
		setMajorID(major_id)
		setMasterStudyPlannerId(master_study_planner_id)

		const storageKey = `course_planner_mode_${major_id}`;
		const updateModeFromStorage = () => {
			try {
				const stored = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
				setMode(stored && stored.toLowerCase() === 'edit' ? 'edit' : 'read');
			} catch (_) {
				setMode('read');
			}
		};

		updateModeFromStorage();
		const handleCustom = () => updateModeFromStorage();
		window.addEventListener('course-planner-mode-change', handleCustom);
		const handleFocus = () => updateModeFromStorage();
		// window.addEventListener('focus', handleFocus);

		return () => {
			window.removeEventListener('course-planner-mode-change', handleCustom);
			window.removeEventListener('focus', handleFocus);
		};
	}, [params])

	useEffect(() => {
		if (master_study_planner_id && majorID) {
			InitPlanner();
		}
	}, [master_study_planner_id && majorID]);

	useEffect(() => {
		if (studyPlanner) {
			setState(JSON.stringify(studyPlanner, null, 2))
			studyPlanner.UpdateStatus();
		}
	}, [studyPlanner]);


	useEffect(() => {
		// Skip effect if mode is null (initial render)
		if (mode === null) return;

		// Check if user is trying to access edit mode without permission
		if (mode === 'edit' && !can('intakes', 'update')) {
			setMode('read');
			setIsReadOnly(true);
			return;
		}

		if (mode === 'edit') {
			setIsReadOnly(false);
		} else {
			setIsReadOnly(true);
		}
	}, [mode, can])

	// Warn user before leaving page if there are unsaved changes
	useEffect(() => {
		// Set global flag for other components to check
		if (typeof window !== 'undefined') {
			window.__hasUnsavedChanges = has_changes && !is_read_only;
		}

		const handleBeforeUnload = (e) => {
			if (has_changes && !is_read_only) {
				e.preventDefault();
				e.returnValue = ''; // Required for Chrome
				return ''; // Required for other browsers
			}
		};

		const handleNavigation = async (e) => {
			// Skip if no unsaved changes or in read-only mode
			if (!has_changes || is_read_only) return;

			// Check if the click target is a link or button that might navigate
			const target = e.target.closest('a, button, [role="link"]');
			if (!target) return;

			// Get button text to identify safe buttons
			const buttonText = target.textContent?.trim() || '';

			// Skip buttons that don't navigate away from the page
			const safeButtons = [
				'Back', 'Save Changes', 'Cancel Changes', 'Save as PDF',
				'Add Year', 'Change to View', 'Change to Edit',
				'Saving...', 'Generating PDF...', 'Import from other intake',
				'Propagate Changes to Students'
			];
			if (safeButtons.includes(buttonText)) return;

			// Get the href from various sources
			let href = target.getAttribute('href') || target.dataset.href;

			// Skip if it's just a button without href (not a navigation element)
			if (target.tagName === 'BUTTON' && !href) return;

			// Skip if no href or it's a same-page anchor
			if (!href || href.startsWith('#')) return;

			// Skip if it's a download link
			if (target.hasAttribute('download')) return;

			// Prevent navigation and show confirmation
			e.preventDefault();
			e.stopPropagation();

			const result = await window.Swal.fire({
				title: 'Unsaved Changes',
				text: 'You have unsaved changes. Are you sure you want to leave this page? Your changes will be lost.',
				icon: 'warning',
				showCancelButton: true,
				confirmButtonColor: '#d33',
				cancelButtonColor: '#3085d6',
				confirmButtonText: 'Leave Page',
				cancelButtonText: 'Stay on Page'
			});

			if (result.isConfirmed) {
				// User confirmed, clear changes and navigate
				setHasChanges(false);
				window.__hasUnsavedChanges = false;

				// Use setTimeout to ensure state updates before navigation
				setTimeout(() => {
					if (target.target === '_blank') {
						window.open(href, '_blank');
					} else {
						// Use window.location for navigation
						window.location.href = href;
					}
				}, 100);
			}
		};

		// Add event listeners - use capture phase to catch events early
		window.addEventListener('beforeunload', handleBeforeUnload);
		document.addEventListener('click', handleNavigation, true);

		// Cleanup
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			document.removeEventListener('click', handleNavigation, true);
			if (typeof window !== 'undefined') {
				window.__hasUnsavedChanges = false;
			}
		};
	}, [has_changes, is_read_only])

	const ImportPlanner = async (course_intake_id) => {
		try {
			setIsIntakeLoading(true);
			const planner = await studyPlanner.ImportPlannerData(course_intake_id);
			window.Swal.fire({

			})
			updateStudyPlanner(planner);
		} catch (error) {
			console.error("Failed to import planner:", error);
		} finally {
			setIsIntakeLoading(false); // hide spinner no matter success or error
			window.Swal.fire({
				title: "Planner Imported Successfully",
				icon: "success",
				timer: 1000,
				showConfirmButton: false
			});
		}
	};

	const handleNextConflict = () => {
		if (listOfConflicts.length === 0) return;

		const nextIndex = (currentConflictIndex + 1) % listOfConflicts.length;
		setCurrentConflictIndex(nextIndex);

		const conflict = listOfConflicts[nextIndex];
		const conflictID = `${conflict.year_num}_${conflict.sem_index}_${conflict.unit_index}`;

		const target = document.getElementById(conflictID);
		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'center' });
			target.classList.add('highlight-row'); // optional visual cue
			setTimeout(() => target.classList.remove('highlight-row'), 1500);
		}
	};
	const updateStudyPlanner = (newPlanner) => {
		setStudyPlanner(newPlanner);
		setUnitTypeSummary(newPlanner.GetCPSummaryByUnitType());
		setListOfConflicts(newPlanner.GetConflictingUnitsIndex());

		setHasChanges(true);
	};

	const InitPlanner = async () => {
		setIsLoading(true);
		try {
			if (master_study_planner_id === null) {
				return
			}

			const planner = new StudyPlanner();
			const res = await planner.Init(master_study_planner_id);

			if (!res.success) {
				setError("Master Study Planner not found");
				return;
			}
			setAvailableIntakes(await planner.FetchAvailablePlanner())
			setStudyPlanner(planner);
			setUnitTypeSummary(planner.GetCPSummaryByUnitType());
			setListOfConflicts(planner.GetConflictingUnitsIndex());
			setHasChanges(false);

			// Set last modified info if available
			console.log('Frontend - Planner last_modified:', planner.last_modified);
			if (planner.last_modified) {
				console.log('Setting lastModified state to:', planner.last_modified);
				setLastModified(planner.last_modified);
			} else {
				console.log('No last_modified data found in planner');
			}

			// Create a proper clone of the planner
			const original_planner = planner.Clone();
			setOriginalStudyPlanner(original_planner);

			try {
				const types = await UnitTypeDB.FetchUnitTypes({})
				const arr = Array.isArray(types) ? types : (Array.isArray(types?.data) ? types.data : [])
				if (arr.length > 0) {
					const formattedTypes = arr.map(type => ({
						_type_id: (type?._id ?? type?.id ?? type?.ID),
						_name: (type?._name ?? type?.name ?? type?.Name),
						_color: (type?._colour ?? type?.colour ?? type?.Colour)
					}))
					setUnitTypes(formattedTypes)
				}
			} catch (error) {
				console.error('Error fetching unit types:', error)
			}
		} catch (error) {
			console.error('Error initializing planner:', error);
			setError("Error loading planner");
		} finally {
			setIsLoading(false);
		}
	}

	const onCancelChanges = (change_mode = false) => {
		let text = 'Cancel changes will remove all the changes that you made, and can\'t be undone'
		if (change_mode) {
			text = 'Changing mode will remove all the changes that you made and can\'t be undone'
		}
		return new Promise((resolve) => {
			window.Swal.fire({
				title: 'Cancel Changes',
				text,
				icon: 'warning',
				showCancelButton: true,
				confirmButtonColor: '#d33',
				cancelButtonColor: '#3085d6',
				confirmButtonText: 'Yes, cancel changes',
				cancelButtonText: 'No, keep changes'
			}).then((result) => {
				if (result.isConfirmed) {
					setStudyPlanner(originalStudyPlanner);
					setUnitTypeSummary(originalStudyPlanner.GetCPSummaryByUnitType());
					setListOfConflicts(originalStudyPlanner.GetConflictingUnitsIndex());
					resolve(true);
					setHasChanges(false);
				} else {
					resolve(false);
				}
			});
		});
	}

	const onSaveDraft = async () => {
		if (studyPlanner) {
			setSaveLoading(true);
			try {
				const res = await studyPlanner.SaveToDB()
				if (res.success) {
					setHasChanges(false);
					await window.Swal.fire({
						title: 'Success',
						text: res.message,
						icon: 'success',
						showConfirmButton: true,
						confirmButtonText: 'OK'
					});
					// Refresh page to update last modified info
					window.location.reload();
				} else {
					await window.Swal.fire({
						title: 'Error',
						text: res.message,
						icon: 'error',
						showConfirmButton: true,
						confirmButtonText: 'OK'
					});
				}
			} finally {
				setSaveLoading(false);
			}
		}
	}

	const onSave = async () => {
		if (studyPlanner) {
			console.log('studyPlanner', studyPlanner)
			if (studyPlanner.IsFullyCompleted()) {
				setSaveLoading(true);
				try {
					let toPublish = false;
					if (!studyPlanner.IsCourseIntakeComplete()) {
						const res = await window.Swal.fire({
							title: 'Publish Intake?',
							text: 'Do you want to publish this intake now?',
							icon: 'question',
							showCancelButton: true,
							confirmButtonText: 'Yes, publish it',
							cancelButtonText: 'No, not now',
							reverseButtons: true,
							confirmButtonColor: '#28a745',
							cancelButtonColor: '#d33',
							allowOutsideClick: false,
							allowEscapeKey: false,
						});
						toPublish = res.value;
					}
					const res = await studyPlanner.SaveToDB(toPublish)
					if (res.success) {
						setHasChanges(false);
						await window.Swal.fire({
							title: 'Success',
							text: res.message,
							icon: 'success',
							showConfirmButton: true,
							confirmButtonText: 'OK'
						});
						// Refresh page to update last modified info
						window.location.reload();
					} else {
						await window.Swal.fire({
							title: 'Error',
							text: res.message,
							icon: 'error',
							toast: true,
							position: 'top-end',
							showConfirmButton: true,
							confirmButtonText: 'OK'
						});
					}
				} finally {
					setSaveLoading(false);
				}
			} else {
				window.Swal.fire({
					title: 'Continue with Save with Conflicts?',
					text: 'There are conflicts or empty slots in the planner, continue with save?',
					icon: 'warning',
					showCancelButton: true,
					confirmButtonColor: '#3085d6',
					cancelButtonColor: '#d33',
					confirmButtonText: 'Yes, save it!',
					cancelButtonText: 'No, cancel'
				}).then(async (result) => {
					if (result.isConfirmed) {
						setSaveLoading(true);
						try {
							const res = await studyPlanner.SaveToDB()
							if (res.success) {
								setHasChanges(false);
								await window.Swal.fire({
									title: 'Success',
									text: res.message,
									icon: 'success',
									showConfirmButton: true,
									confirmButtonText: 'OK'
								});
								// Refresh page to update last modified info
								window.location.reload();
							} else {
								await window.Swal.fire({
									title: 'Error',
									text: res.message,
									icon: 'error',
									toast: true,
									position: 'top-end',
									showConfirmButton: true,
									confirmButtonText: 'OK'
								});
							}
						} finally {
							setSaveLoading(false);
						}
					}
				});
			}
		}
	}

	// Check if user has study planner read permission
	const hasPermission = can('intakes', 'read');

	return (
		<ConditionalRequireAuth>
			{!hasPermission ? (
				<AccessDenied requiredPermission="intakes:read" resourceName="study planner" />
			) : (error === "Major not found" || error === "Master Study Planner not found") ?
				<div className="flex flex-col items-center justify-center py-16">
					<div className="text-2xl font-bold text-gray-700 mb-4">{error}</div>
					<button
						onClick={() => redirect(`/view/course/${error === "Master Study Planner not found" ? majorID : ''}`)}
						className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded cursor-pointer"
					>
						Back to Course Intake
					</button>
				</div>
				: isLoading ?
					<LoadingSpinner
						size="large"
						color="primary"
						text="Loading master study planner..."
						fullScreen={true}
					/> : (
						<>
							{listOfConflicts.length > 0 && (
								<div
									onClick={handleNextConflict}
									className="fixed bottom-20 right-5  bg-red-700 text-white z-10 shadow-md py-4 px-6 cursor-pointer hover:bg-red-800 rounded-xl font-semibold text-center"
								>
									NEXT CONFLICT
								</div>
							)}
							<div className="mx-auto px-4 py-3">
								<div className="flex flex-col items-center mb-5">
									<span className="text-gray-500 text-sm px-2 py-1 rounded">
										{is_read_only ? 'View' : 'Edit'} Mode
									</span>
									<h1 className="plannerTitle">Master Study Planner</h1>
								</div>
								<div className="title font-bold mb-8">
									<div className="flex justify-between items-center mb-6 md:flex-row flex-col">
										<div className="md:w-fit w-full">
											<h2 className='plannerCourseTitle'>
												{studyPlanner?.courseName} - {studyPlanner?.courseCode}
												<p className="text-xl">{studyPlanner?.majorName}</p>
											</h2>
											<h2 className='plannerIntakeText'>
												{studyPlanner?.intakeName} | {studyPlanner?.intakeYear}
											</h2>
										</div>
										<div className="flex gap-4 md:w-fit w-full">
											<button
												onClick={async () => {
													if (has_changes && !is_read_only) {
														const result = await window.Swal.fire({
															title: 'Unsaved Changes',
															text: 'You have unsaved changes. Are you sure you want to leave this page? Your changes will be lost.',
															icon: 'warning',
															showCancelButton: true,
															confirmButtonColor: '#d33',
															cancelButtonColor: '#3085d6',
															confirmButtonText: 'Leave Page',
															cancelButtonText: 'Stay on Page'
														});
														if (result.isConfirmed) {
															setHasChanges(false);
															redirect(`/view/course/${majorID}`);
														}
													} else {
														redirect(`/view/course/${majorID}`);
													}
												}}
												className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
											>
												Back
											</button>
											{can("intakes", "update") && (
												<button
													onClick={() => {
														const storageKey = `course_planner_mode_${majorID}`;
														if (mode === 'edit') {
															if (has_changes) {
																onCancelChanges(true).then(confirmed => {
																	if (confirmed) {
																		setMode('read');
																		localStorage.setItem(storageKey, 'read');
																		setIsReadOnly(true);
																	}
																});
															} else {
																setMode('read');
																localStorage.setItem(storageKey, 'read');
																setIsReadOnly(true);
															}
														} else {
															setMode('edit');
															localStorage.setItem(storageKey, 'edit');
															setIsReadOnly(false);
														}
													}}
													disabled={!can('intakes', 'update')}
													className={`px-6 py-2 rounded text-white transition-colors duration-200 ${!can('intakes', 'update')
														? 'bg-gray-400 cursor-not-allowed'
														: mode == "edit"
															? 'bg-blue-500 hover:bg-blue-600'
															: 'bg-red-500 hover:bg-red-600'
														}`}
													title={!can('intakes', 'update') ? 'You do not have permission to edit study plans' : ''}
												>
													Change to {mode == "edit" ? 'View' : 'Edit'}
												</button>
											)}
										</div>
									</div>
									<hr className="border-gray-300" />
								</div>
								<div className="plannerInfoCard">
									<div
										className="plannerInfoHeader"
										onClick={() => setIsPlannerInfoExpanded(!isPlannerInfoExpanded)}
									>
										<div className="flex items-center gap-4 flex-1">
											<div className="flex items-center">
												<div className="bg-white p-2 rounded-full mr-3 shadow-sm">
													<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#DC2D27]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
													</svg>
												</div>
												<h3 className="plannerInfoTitle">Planner Information</h3>
											</div>
											{lastModified && (
												<div className="relative group ml-4" onClick={(e) => e.stopPropagation()}>
													<div className="text-xs text-gray-300 cursor-help flex items-center gap-2 bg-gray-700 px-3 py-1.5 rounded-md">
														<svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
														</svg>
														<span>
															Last modified by <strong>{lastModified.userName}</strong> on{' '}
															{new Date(lastModified.timestamp).toLocaleDateString()}
														</span>
													</div>
													{/* Hover tooltip */}
													<div className="absolute top-full left-0 mt-2 hidden group-hover:block w-80 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-50">
														<div className="space-y-1">
															<div>
																<strong>Modified by:</strong> {lastModified.userName}
																{lastModified.userRoles && lastModified.userRoles.length > 0 && (
																	<span className="text-gray-400">
																		{' '}({lastModified.userRoles.join(', ')})
																	</span>
																)}
															</div>
															<div><strong>Email:</strong> {lastModified.userEmail}</div>
															<div><strong>Date & Time:</strong> {new Date(lastModified.timestamp).toLocaleString('en-AU', {
																year: 'numeric',
																month: 'long',
																day: 'numeric',
																hour: '2-digit',
																minute: '2-digit',
																second: '2-digit'
															})}</div>
															<div><strong>Action:</strong> {lastModified.action}</div>
														</div>
														{/* Arrow */}
														<div className="absolute bottom-full left-8 mb-[-1px]">
															<div className="border-8 border-transparent border-b-gray-900"></div>
														</div>
													</div>
												</div>
											)}
										</div>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											className={`h-5 w-5 text-white transition-transform duration-300 ${isPlannerInfoExpanded ? 'transform rotate-180' : ''}`}
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
										</svg>
									</div>

									<div className={`transition-all duration-300 ease-in-out overflow-auto ${isPlannerInfoExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
										<div className="p-6">
											<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
												{/* Course Details Card */}
												<div className="plannerDetailsCard">
													<div className="flex items-center mb-4">
														<div className="bg-blue-100 p-3 rounded-full mr-4 shadow-sm">
															<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
																<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
															</svg>
														</div>
														<div>
															<h3 className="plannerDetailsTitle">Course Details <InfoTooltip content={"Information of Course Details, consist of Status, Credit, Total Years and Total Semester"}></InfoTooltip></h3>

															<p className="plannerDetailsSubtitle">Course Information</p>
														</div>
													</div>

													<div className="space-y-3">
														<div className="flex border-b border-gray-100 pb-3">
															<span className="plannerDetailLabel">Status:</span>
															<span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${studyPlanner?.status === "Complete" ? "bg-green-100 text-green-800" :
																studyPlanner?.status === "Draft" ? "bg-yellow-100 text-yellow-800" :
																	"bg-gray-100 text-gray-800"
																}`}>
																{studyPlanner?.status}
															</span>
															{studyPlanner.GetConflictingUnitsIndex().length > 0 && (
																<span
																	className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-500 ml-3"
																>
																	Conflicts!
																</span>
															)}
														</div>
														<div className="flex border-b border-gray-100 pb-3">
															<span className="plannerDetailLabel">Credits:</span>
															<span className="plannerDetailValue">{studyPlanner?.totalCredits} / {studyPlanner?.creditsRequired}</span>
														</div>
														<div className="flex border-b border-gray-100 pb-3">
															<span className="plannerDetailLabel">Total Years:</span>
															<span className="plannerDetailValue">{studyPlanner?.years?.length || 0}</span>
														</div>
														<div className="flex border-b border-gray-100 pb-3">
															<span className="plannerDetailLabel">Total Semesters:</span>
															<span className="plannerDetailValue">{studyPlanner?.years?.reduce((total, year) => total + year.semesters.length, 0) || 0}</span>
														</div>
													</div>
												</div>

												{/* Unit Type Progress Card */}
												<div className="plannerDetailsCard">
													<div className="flex items-center mb-4">
														<div className="bg-purple-100 p-3 rounded-full mr-4 shadow-sm">
															<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
																<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
															</svg>
														</div>
														<h3 className="plannerDetailsTitle">Unit Types <InfoTooltip content={"Unit types that exist in this Course"}></InfoTooltip> </h3>
													</div>

													<div className="overflow-x-auto">
														<table className="plannerTable">
															<thead>
																<tr>
																	<th className="plannerTableHeader">Unit Type</th>
																	<th className="plannerTableHeader text-center">Count</th>
																	<th className="plannerTableHeader text-center">Credit Points</th>
																</tr>
															</thead>
															<tbody>
																{Object.values(unitTypeSummary).map((type, index) => (
																	<tr key={index} className="plannerTableRow">
																		<td className="plannerTableCell">
																			<div className="flex items-center gap-2">
																				<div
																					className="w-4 h-4 rounded-full shadow-sm"
																					style={{ backgroundColor: type.color }}
																				></div>
																				{type.name}
																			</div>
																		</td>
																		<td className="plannerTableCell">
																			{type.count}
																		</td>
																		<td className="plannerTableCell">
																			{type.total_cp}
																		</td>
																	</tr>
																))}
															</tbody>
															<tfoot>
																<tr>
																	<td className="plannerTableFooter">
																		<div className="flex items-center gap-2">
																			Total Units
																		</div>
																	</td>
																	<td className="plannerTableFooter">
																		{Object.values(unitTypeSummary).reduce((total, type) => total + type.count, 0)}
																	</td>
																	<td className="plannerTableFooter">
																		{Object.values(unitTypeSummary).reduce((total, type) => total + type.total_cp, 0)}
																	</td>
																</tr>
															</tfoot>
														</table>
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>
								<div className="flex justify-between items-center gap-4 mb-3">
									<div className="flex items-end justify-end gap-4">
										<button
											onClick={() => SaveStudyPlannerAsPDF(studyPlanner)}
											className="px-4 py-2 rounded-md transition-all duration-200 bg-red-500 hover:bg-red-600 cursor-pointer shadow-sm hover:shadow text-white"
										>
											Save as PDF
										</button>
										{!is_read_only && (
											<button
												onClick={() => {
													setOpenIntakeList(!openIntakeList)
													//TODO: Show the available intakes through another component, <CourseIntakeList/>
												}}
												className="px-4 py-2 rounded-md transition-all duration-200 bg-red-500 hover:bg-red-600 cursor-pointer shadow-sm hover:shadow text-white"
											>
												Import from planners
											</button>
										)}
									</div>

									{!is_read_only && has_changes && (
										<div className="flex items-center gap-4">
											<button
												className={`px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 ${saveLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
												title="Cancel"
												onClick={() => onCancelChanges(false)}
												disabled={saveLoading}
											>
												Cancel Changes
											</button>
											{/* {studyPlanner.status !== "Empty" && ( */}
											<button
												className={`px-4 py-2 text-white rounded flex items-center gap-2 ${saveLoading ? 'bg-green-300 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 cursor-pointer'}`}
												title="Save"
												onClick={studyPlanner.status === "Complete" ? onSave : onSaveDraft}
												disabled={saveLoading}
											>
												{saveLoading ? (
													<>
														<svg
															className="animate-spin h-5 w-5 text-white"
															xmlns="http://www.w3.org/2000/svg"
															fill="none"
															viewBox="0 0 24 24"
														>
															<circle
																className="opacity-25"
																cx="12"
																cy="12"
																r="10"
																stroke="currentColor"
																strokeWidth="4"
															/>
															<path
																className="opacity-75"
																fill="currentColor"
																d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
															/>
														</svg>
														<span>Saving...</span>
													</>
												) : (
													<span>{studyPlanner.status !== "Complete" ? "Save Changes" : "Save Planner"}</span>
												)}
											</button>
										</div>
									)}

								</div>
								<div className="space-y-4">
									<div className="flex justify-between items-center">
										<h2 className="plannerSectionTitle">Course Planner</h2>
									</div>
									{isIntakeLoading ? (
										<LoadingSpinner
											size="large"
											color="primary"
											text="Importing planner data..."
											fullScreen={false}
										/>
									) : (
										<>
											{studyPlanner.years.map((year, index) => (
												<div key={index} className="plannerYearCard">
													<div className="flex justify-between items-center">
														<h3 className="plannerYearTitle">
															Year {year.year}
															<InfoTooltip
																content={"A year consists of TWO long semesters and TWO short semesters"}
																position='right'
																className='ml-2'
															/>
														</h3>
														{!is_read_only && index > 0 && (
															<button
																onClick={async () => {
																	const result = studyPlanner.RemoveYear(year.year);
																	updateStudyPlanner(result);
																}}
																className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 cursor-pointer" title="Remove Year"
															>
																Remove Year
															</button>
														)}
													</div>
													<Year
														year={year}
														planner={studyPlanner}
														setStudyPlanner={updateStudyPlanner}
														unitTypes={unitTypes}
														is_read_only={is_read_only}
													/>
												</div>
											))}
										</>
									)}

									{!is_read_only && (
										<button
											onClick={() => {
												const newPlanner = studyPlanner.AddNewYear();
												updateStudyPlanner(newPlanner);
											}}
											className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 w-full cursor-pointer" title="Add year"
										>
											Add Year
										</button>
									)}
								</div>
							</div>

							{openIntakeList && (
								<div className="fixed inset-0 z-50 flex justify-center items-center">
									<CourseIntakeList
										onClose={() => {
											setOpenIntakeList(!openIntakeList)
										}}
										ImportPlanner={ImportPlanner}
										available_intakes={availableIntakes}
										unit_types={unitTypes}

									/>
								</div>
							)}
						</>
					)}
		</ConditionalRequireAuth >
	)
}

export default StudyPlannerPage