'use client'

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import React, { use, useEffect, useState } from 'react'
import StudentStudyPlanner from '@app/class/StudyPlanner/StudentStudyPlanner'
import UnitTypeDB from '@app/class/UnitType/UnitTypeDB'
import Year from './year'
import { SaveStudyPlannerAsPDF } from './student_study_planner_pdf_export'
import RequireAuth from '@app/RequireAuth'
import { ConditionalRequireAuth } from 'components/helper';
import { redirect } from 'components/helper' //see if this is needed to get out or not
import StudentInformation from '@app/view/student_information/[student_id]/[planner_id]/student_information'
import SendStudyPlanner from '@app/view/student_information/[student_id]/[planner_id]/send_study_planner'
import Conflicts from '@app/view/student_information/[student_id]/[planner_id]/conflicts'
import CurrentAmendments from '@app/view/student_information/[student_id]/[planner_id]/current_amendments'
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { useLightDarkMode } from "@app/context/LightDarkMode"
import AmendmentHistory from './amendment_history';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import LoadingSpinner from '@components/LoadingSpinner';
import InfoTooltip from '@components/InfoTooltip';
import { exportStudyPlannerToExcel } from './student_study_planner_excel_export';
const StudentPlanner = () => {
	const { can } = useRole();
	const { theme } = useLightDarkMode();
	const isDarkMode = theme === 'dark';
	const router = useRouter();

	const styles = {
		primary_text_color: isDarkMode ? 'text-gray-100' : 'text-gray-900',
		secondary_text_color: isDarkMode ? 'text-gray-400' : 'text-gray-600',
		background_color: isDarkMode ? 'bg-gray-900' : 'bg-white',
	};


	const { student_id, planner_id } = useParams()
	const [studentStudyPlanner, setStudentStudyPlanner] = useState(null)
	const [unitTypes, setUnitTypes] = useState([])
	const [studentEmail, setStudentEmail] = useState("")
	const [isInfoExpanded, setIsInfoExpanded] = useState(false)
	const [isEmailExpanded, setIsEmailExpanded] = useState(false)
	const [isConflictsExpanded, setIsConflictsExpanded] = useState(true)
	const [conflicts, setConflicts] = useState([])
	const [originalStudentStudyPlanner, setOriginalStudentStudyPlanner] = useState(null)
	const [hasChanges, setHasChanges] = useState(false)
	const [isAmendmentsExpanded, setIsAmendmentsExpanded] = useState(false)
	const [mode, setMode] = useState(null)
	const [isReadOnly, setIsReadOnly] = useState(false)
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null)
	const [lastModified, setLastModified] = useState(null)
	const [saveLoading, setSaveLoading] = useState(false)
	const [pdfLoading, setPdfLoading] = useState(false)
	const [listOfConflicts, setListOfConflicts] = useState([]);
	const [currentConflictIndex, setCurrentConflictIndex] = useState(-1);

	// Check permissions
	const hasReadPermission = can('student_info', 'read');
	const hasUpdatePermission = can('student_info', 'update');

	const Init = async () => {
		setIsLoading(true);
		try {
			const studentStudyPlanner = new StudentStudyPlanner()
			const result = await studentStudyPlanner.Init(student_id, planner_id)
			if (result.message) {
				setError(result.message)
				setStudentStudyPlanner(null)
				return;
				//redirect(`/view/student_information/${student_id}`)
			}
			setStudentStudyPlanner(studentStudyPlanner)

			// Create a deep clone of the study planner to use for resetting
			setOriginalStudentStudyPlanner(studentStudyPlanner)

			setStudentEmail(studentStudyPlanner.student_info.student_id + '@students.swinburne.edu.my')

			// Fetch last modified info from audit logs
			try {
				const response = await SecureFrontendAuthHelper.authenticatedFetch(
					`/api/audit_logs/latest_for_entity?module=student_management&entity=StudentStudyPlanner&entityId=Student ${student_id}`
				);
				if (response.ok) {
					const data = await response.json();
					if (data.lastModified) {
						setLastModified(data.lastModified);
					}
				}
			} catch (err) {
				console.warn('Failed to fetch last modified info:', err);
			}
			try {
				const types = await UnitTypeDB.FetchUnitTypes({})
				if (types.data.length > 0) {
					const formattedTypes = types.data.map(type => ({
						_type_id: type._id,
						_name: type._name,
						_color: type._colour
					}))
					setUnitTypes(formattedTypes)
				}

				// Get conflicts
				const unitConflicts = studentStudyPlanner.study_planner.GetAllConflicts();
				setListOfConflicts(studentStudyPlanner.study_planner.GetConflictingUnitsIndex(true));
				setConflicts(unitConflicts);
			} catch (error) {
				console.error('Error fetching unit types:', error)
			}
		} catch (error) {
			console.error('Error initializing student planner:', error);
		} finally {
			setIsLoading(false);
		}
	}

	const updateStudentStudyPlanner = (currentPlanner, updateFn) => {
		// Create a new StudentStudyPlanner instance to preserve prototype methods
		const newPlanner = new StudentStudyPlanner();

		// Copy properties from the current planner
		Object.assign(newPlanner, currentPlanner);

		// Update the StudyPlanner property using the update function
		newPlanner.StudyPlanner = updateFn(currentPlanner.StudyPlanner);

		// Keep the StudentInfo 
		newPlanner.student_info = { ...currentPlanner.student_info };

		// Update conflicts whenever the study planner is updated
		if (newPlanner && newPlanner.StudyPlanner) {
			const newConflicts = newPlanner.StudyPlanner.GetAllConflicts();
			setConflicts(newConflicts);

			setListOfConflicts(newPlanner.study_planner.GetConflictingUnitsIndex(true));

			// Mark that changes have been made
			setHasChanges(true);
		}

		return newPlanner;
	};

	const handleAddYear = () => {
		setStudentStudyPlanner(prev =>
			updateStudentStudyPlanner(prev, studyPlanner => studentStudyPlanner.StudyPlanner.AddNewYear())
		);
	};
	const handleExportExcel = async () => {
		if (!studentStudyPlanner) {
			alert("No data to export");
			return;
		}
		try {
			await exportStudyPlannerToExcel(studentStudyPlanner);
		} catch (error) {
			console.error("Failed to export Excel:", error);
			await window.Swal?.fire?.({
				title: 'Export Failed',
				text: 'Failed to export planner matching report. Please try again.',
				icon: 'error',
				confirmButtonText: 'OK'
			});
		}
	};
	const handleRemoveYear = (year) => {
		try {
			// Wait for the RemoveYear operation to complete
			const updatedStudyPlanner = studentStudyPlanner.StudyPlanner.RemoveYear(year);

			// Update amendments to reflect the removed year
			studentStudyPlanner.RemoveYearUnitAmendments(year);

			setStudentStudyPlanner(prev =>
				updateStudentStudyPlanner(prev, () => updatedStudyPlanner)
			);
		} catch (error) {
			console.error("Failed to remove year:", error);
			// Optionally handle the error in your UI
		}
	};

	useEffect(() => {
		// Initialize mode from localStorage to avoid exposing it in the URL
		// But respect permissions - force read-only if user doesn't have update permission
		try {
			const stored = typeof window !== 'undefined' ? window.localStorage.getItem(`student_view_mode_${student_id}`) : null;
			if (stored && stored.toUpperCase() === 'EDIT' && hasUpdatePermission) {
				setMode('edit')
				setIsReadOnly(false)
			} else {
				setMode('read')
				setIsReadOnly(true)
			}
		} catch (_) {
			setMode('read')
			setIsReadOnly(true)
		}
		Init()
	}, [hasUpdatePermission])

	// Warn user before leaving page if there are unsaved changes
	useEffect(() => {
		// Set global flag for other components to check
		if (typeof window !== 'undefined') {
			window.__hasUnsavedChanges = hasChanges && !isReadOnly;
		}

		const handleBeforeUnload = (e) => {
			if (hasChanges && !isReadOnly) {
				e.preventDefault();
				e.returnValue = ''; // Required for Chrome
				return ''; // Required for other browsers
			}
		};

		const handleNavigation = async (e) => {
			// Skip if no unsaved changes or in read-only mode
			if (!hasChanges || isReadOnly) return;

			// Check if the click target is a link or button that might navigate
			const target = e.target.closest('a, button, [role="link"]');
			if (!target) return;

			// Get button text to identify safe buttons
			const buttonText = target.textContent?.trim() || '';

			// Skip buttons that don't navigate away from the page
			const safeButtons = [
				'Back', 'Save Amendments', 'Cancel Changes', 'Solve Conflicts',
				'Save as PDF', 'Add Year', 'Change to View', 't',
				'Saving...', 'Generating PDF...', 'Solving...'
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
						// Use Next.js router for internal navigation if available
						if (href.startsWith('/')) {
							router.push(href);
						} else {
							window.location.href = href;
						}
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
	}, [hasChanges, isReadOnly, router])

	const cancelChanges = async (mode_swap = false) => {
		let text = 'Are you sure you want to discard all your changes?'
		if (mode_swap) {
			text = 'Are you sure you want to discard all your changes and go back to ' + (isReadOnly ? 'edit' : 'view') + ' mode?'
		}
		const result = await window.Swal.fire({
			title: 'Cancel Changes',
			text: text,
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#d33',
			cancelButtonColor: '#aaa',
			confirmButtonText: 'Discard Changes',
			cancelButtonText: 'Cancel'
		});
		if (!result.isConfirmed) return false;
		// Create a fresh copy by re-initializing from scratch
		// const resetPlanner = new StudentStudyPlanner();
		// await resetPlanner.Init(student_id, planner_id);

		// Update the state with the freshly loaded planner
		originalStudentStudyPlanner.ClearAmendments(); // Clear any amendments in the original planner
		setStudentStudyPlanner(originalStudentStudyPlanner);

		// Reset conflicts by fetching them from the new planner
		const newConflicts = originalStudentStudyPlanner.study_planner.GetAllConflicts();

		setListOfConflicts(originalStudentStudyPlanner.study_planner.GetConflictingUnitsIndex(true));
		setConflicts(newConflicts);

		if (mode_swap) {
			setIsReadOnly(true);
		}

		// Reset changes flag
		setHasChanges(false);

		return true;
	}

	// Add a helper function to get unit type info by ID
	const getUnitTypeInfo = (typeId) => {
		if (typeId === -1) return { name: "Deleted", color: "#ff4d4d" };
		if (!typeId) return null;

		const unitType = unitTypes.find(type => type._type_id === typeId);
		return unitType ? { name: unitType._name, color: unitType._color } : { name: `Type ${typeId}`, color: "#cccccc" };
	};

	// Helper function to display unit code or "Elective" based on conditions
	const getUnitCodeDisplay = (unitCode, unitTypeId) => {
		if (!unitCode && getUnitTypeInfo(unitTypeId)?.name.toLowerCase() === "elective") {
			return "Elective";
		}
		return unitCode;
	};

	const getAmendmentAction = (amendment) => {
		// Use the action property directly from the amendment
		const actionType = amendment.action || amendment._action;

		switch (actionType) {
			case 'deleted':
				return { type: "deleted", label: "Deleted Unit", color: "bg-red-100 text-red-800" };
			case 'swapped':
				return { type: "swapped", label: "Swapped Unit", color: "bg-blue-100 text-blue-800" };
			case 'replaced':
				return { type: "replaced", label: "Replaced Unit", color: "bg-indigo-100 text-indigo-800" };
			case 'added':
				return { type: "added", label: "Added Unit", color: "bg-green-100 text-green-800" };
			case 'changed_type':
				return { type: "changed_type", label: "Changed Unit Type", color: "bg-yellow-100 text-yellow-800" };
			default:
				return { type: "unknown", label: "Modified Unit", color: "bg-gray-100 text-gray-800" };
		}
	};


	const SolveStudyPlannerConflicts = async () => {
		if (!studentStudyPlanner || !studentStudyPlanner.study_planner) {
			await window.Swal.fire({
				title: 'Error',
				text: 'No study planner data available',
				icon: 'error',
				confirmButtonText: 'OK',
				showClass: {
					popup: 'animate__animated animate__shakeX'
				},
				hideClass: {
					popup: 'animate__animated animate__fadeOut'
				}
			});
			return;
		}

		// Show loading animation
		await window.Swal.fire({
			title: 'Solving Conflicts...',
			text: 'Please wait while we attempt to solve the conflicts.',
			allowOutsideClick: false,
			allowEscapeKey: false,
			allowEnterKey: false,
			showConfirmButton: false,
			willOpen: () => {
				window.Swal.showLoading();
			},
			timer: 2000,
			timerProgressBar: true
		});

		const solvedPlanner = studentStudyPlanner.SolveConflicts();

		if (solvedPlanner.success) {
			setStudentStudyPlanner(prev =>
				updateStudentStudyPlanner(prev, studyPlanner => solvedPlanner.study_planner)
			);
			await window.Swal.fire({
				title: 'Success',
				text: solvedPlanner.message,
				icon: 'success',
				showClass: {
					popup: 'animate__animated animate__fadeInDown'
				},
				hideClass: {
					popup: 'animate__animated animate__fadeOutUp'
				}
			});
		} else {
			await window.Swal.fire({
				title: 'Unable to Solve Conflicts',
				text: solvedPlanner.message || 'Some conflicts could not be resolved automatically.',
				icon: 'error',
				showClass: {
					popup: 'animate__animated animate__shakeX'
				},
				hideClass: {
					popup: 'animate__animated animate__fadeOut'
				}
			});
		}
	}

	const SaveAmendments = async (amendments) => {
		setSaveLoading(true);
		try {
			let status = studentStudyPlanner.StudyPlanner.UpdateStatus(true);
			if (status.is_complete) {
				if (await studentStudyPlanner.SaveAmendmentsToDB(amendments)) {
					await window.Swal.fire({
						title: 'Success',
						text: 'Amendments saved successfully',
						icon: 'success',
						confirmButtonText: 'OK'
					});
					// Refresh page to update last modified info
					window.location.reload();
				} else {
					await window.Swal.fire({
						icon: 'error',
						title: 'Failed',
						text: 'Amendments saved unsuccessfully',
						icon: 'warning',
						confirmButtonText: 'OK'
					});
				}
			} else {
				await window.Swal.fire({
					title: 'Error',
					text: status.message,
					icon: 'warning',
					confirmButtonText: 'OK'
				});
			}
			setHasChanges(false);
		} catch (error) {
			console.error("Failed to save amendments:", error);
			await window.Swal.fire({
				title: 'Error',
				text: 'Failed to save amendments. Please try again.',
				icon: 'error',
				confirmButtonText: 'OK'
			});
		} finally {
			setSaveLoading(false);
		}
	}

	const handleSaveAsPDF = async () => {
		setPdfLoading(true);
		try {
			await SaveStudyPlannerAsPDF(studentStudyPlanner);
		} catch (error) {
			console.error("Failed to generate PDF:", error);
		} finally {
			setPdfLoading(false);
		}
	}

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

	if (isLoading) {
		return (
			<LoadingSpinner
				size="large"
				color="primary"
				text="Loading study planner..."
				fullScreen={true}
			/>
		);
	}

	// Check if user has permission to view
	if (!hasReadPermission) {
		return (
			<ConditionalRequireAuth>
				<AccessDenied
					requiredPermission="student_info:read"
					resourceName="student study planners"
				/>
			</ConditionalRequireAuth>
		);
	}

	return (
		<ConditionalRequireAuth>
			<>
				{error ? (
					<div className="flex flex-col items-center justify-center py-16">
						<div className="text-2xl font-bold text-gray-700 mb-4">{error}</div>
						{error === 'Student Study Planner not found' ? (
							<button
								onClick={() => redirect(`/view/student_information/${student_id}`)}
								className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded cursor-pointer"
							>
								Back to Student Details
							</button>
						) : (
							<button
								onClick={() => redirect(`/view/student_information`)}
								className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded cursor-pointer"
							>
								Back to Students
							</button>
						)}
					</div>
				) : studentStudyPlanner && (
					<div className={`p-1 ${styles.primary_text_color}`}>
						{listOfConflicts.length > 0 && (
							<div
								onClick={handleNextConflict}
								className="fixed bottom-20 right-5  bg-red-700 text-white z-10 shadow-md py-4 px-6 cursor-pointer hover:bg-red-800 rounded-xl font-semibold text-center"
							>
								NEXT CONFLICT
							</div>
						)}
						<div className="flex flex-col items-center mb-5">
							<span className="text-gray-500 text-sm px-2 py-1 rounded">
								{isReadOnly ? 'View' : 'Edit'} Mode
							</span>
							<h1 className="text-3xl font-bold text-center"> {studentStudyPlanner?.student_info.student_id}'s Personal Study Planner</h1>
						</div>
						<div className="title font-bold mb-8">
							<div className="flex justify-between items-center mb-6 md:flex-row flex-col">
								<div>
									<h1 className='text-3xl'>
										{studentStudyPlanner?.StudyPlanner?.details?.course?.course_name} - {studentStudyPlanner?.StudyPlanner?.details?.course?.course_code}
										<p className="text-xl">{studentStudyPlanner?.StudyPlanner?.details?.course?.major_name}</p>
									</h1>
									<h2 className={`text-lg mb-4 ${styles.secondary_text_color}`}>
										{studentStudyPlanner?.StudyPlanner?.details?.intake?.name} | {studentStudyPlanner?.StudyPlanner?.details?.intake?.year}
									</h2>
									{lastModified && (
										<div className="relative inline-block group">
											<div className="text-sm text-gray-500 cursor-help flex items-center gap-2">
												<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
												</svg>
												<span>
													Last modified by <strong>{lastModified.userName}</strong> on{' '}
													{new Date(lastModified.timestamp).toLocaleDateString()}
												</span>
											</div>
											{/* Hover tooltip */}
											<div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-80 bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg z-10">
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
												<div className="absolute top-full left-8 -mt-1">
													<div className="border-8 border-transparent border-t-gray-800"></div>
												</div>
											</div>
										</div>
									)}
								</div>
								<div className="flex gap-4 md:w-fit w-full">
									<button
										onClick={async () => {
											if (hasChanges && !isReadOnly) {
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
													redirect(`/view/student_information/${studentStudyPlanner?.student_info.student_id}`);
												}
											} else {
												redirect(`/view/student_information/${studentStudyPlanner?.student_info.student_id}`);
											}
										}}
										className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded"
									>
										Back
									</button>
									{hasUpdatePermission && (
										<button
											onClick={() => {
												if (!isReadOnly) {
													// Going from edit to view - show confirmation if there are changes
													if (hasChanges) {
														cancelChanges(true);
													} else {
														setIsReadOnly(true);
													}
												} else {
													// Going from view to edit - check permission
													if (!hasUpdatePermission) {
														window.Swal?.fire?.({
															title: 'Permission Denied',
															text: 'You need student_info:update permission to edit study planners',
															icon: 'warning'
														});
														return;
													}
													setIsReadOnly(false);
												}
											}}
											className={`px-3 text-sm py-2 rounded text-white transition-colors duration-200 ${isReadOnly
												? 'bg-red-500 hover:bg-red-600'
												: 'bg-blue-500 hover:bg-blue-600'
												}`}
										>
											Change to {isReadOnly ? 'Edit' : 'View'}
										</button>
									)}
								</div>
							</div>
							<hr className="border-gray-300" />
						</div>
						<StudentInformation
							studentStudyPlanner={studentStudyPlanner}
							studentEmail={studentEmail}
							isInfoExpanded={isInfoExpanded}
							setIsInfoExpanded={setIsInfoExpanded}
							styles={styles}
						/>

						<SendStudyPlanner
							studentStudyPlanner={studentStudyPlanner}
							studentEmail={studentEmail}
							setStudentEmail={setStudentEmail}
							isEmailExpanded={isEmailExpanded}
							setIsEmailExpanded={setIsEmailExpanded}
						/>

						<Conflicts
							conflicts={conflicts}
							isConflictsExpanded={isConflictsExpanded}
							setIsConflictsExpanded={setIsConflictsExpanded}
							getUnitTypeInfo={getUnitTypeInfo}
						/>

						<CurrentAmendments
							studentStudyPlanner={studentStudyPlanner}
							isAmendmentsExpanded={isAmendmentsExpanded}
							setIsAmendmentsExpanded={setIsAmendmentsExpanded}
							getUnitTypeInfo={getUnitTypeInfo}
							getUnitCodeDisplay={getUnitCodeDisplay}
							getAmendmentAction={getAmendmentAction}
						/>

						<AmendmentHistory
							amendment_history={studentStudyPlanner?.amendments_history}
							getUnitTypeInfo={getUnitTypeInfo}
							getUnitCodeDisplay={getUnitCodeDisplay}
							getAmendmentAction={getAmendmentAction}
						/>

						<div className="flex justify-between items-center gap-4 mb-3">
							<div className="flex items-center gap-4">

								<button
									onClick={handleSaveAsPDF}
									className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all duration-200 shadow-sm hover:shadow text-white ${(pdfLoading || saveLoading)
										? 'bg-gray-400 cursor-not-allowed'
										: 'bg-red-500 hover:bg-red-600 cursor-pointer'
										}`}
									disabled={pdfLoading || saveLoading}
								>
									{pdfLoading ? (
										<>
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
											<span>Generating PDF...</span>
										</>
									) : (
										<span>Save as PDF</span>

									)}
								</button>
								<button
									onClick={handleExportExcel}
									className="px-4 py-2 rounded-md bg-green-500 hover:bg-green-600 text-white cursor-pointer"
								>
									Export Excel
								</button>
								{(!isReadOnly && conflicts.length > 0) && (
									<>

										<div className={`px-4 py-2 rounded-md flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow text-white ${(saveLoading || pdfLoading)
											? 'bg-gray-400 cursor-not-allowed'
											: 'bg-green-500 hover:bg-green-600 cursor-pointer'
											}`}>
											<button
												onClick={() => SolveStudyPlannerConflicts()}

												disabled={saveLoading || pdfLoading}
											>
												<span className='text-white'>Solve Conflicts</span>
											</button>
										</div>
										<InfoTooltip
											content={"The Auto Solver will only attempt to shift all the units in the study planner to resolve conflicts. It will not add or remove any units. If the conflicts cannot be resolved automatically, please resolve them manually."}
											position='right'
											className='info-bttn'
										></InfoTooltip>
									</>

								)}
							</div>
							{!isReadOnly && (
								<>
									<div className="flex items-center gap-4">
										<button
											className={`px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 ${(saveLoading || pdfLoading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
											title="Cancel"
											onClick={() => cancelChanges(false)}
											disabled={saveLoading || pdfLoading}
										>
											Cancel Changes
										</button>
										{studentStudyPlanner?.status !== "Empty" && (
											<button
												className={`px-4 py-2 text-white rounded flex items-center gap-2 ${(saveLoading || pdfLoading)
													? 'bg-gray-400 cursor-not-allowed'
													: 'bg-green-500 hover:bg-green-600 cursor-pointer'
													}`}
												title="Save"
												onClick={() => SaveAmendments(studentStudyPlanner?.amendments)}
												disabled={saveLoading || pdfLoading}
											>
												{saveLoading ? (
													<>
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
													</>
												) : (
													<span>Save Amendments</span>
												)}
											</button>
										)}

									</div>
								</>
							)}

						</div>
						<div>
							<>
								{studentStudyPlanner?.StudyPlanner?.years ? (
									studentStudyPlanner.StudyPlanner.years.map((year) => (
										<div key={year.year} className="relative mt-10">
											<Year
												year={year}
												studentStudyPlanner={studentStudyPlanner}
												updateStudentStudyPlanner={updateStudentStudyPlanner}
												setStudentStudyPlanner={setStudentStudyPlanner}
												unitTypes={unitTypes}
												handleRemoveYear={handleRemoveYear}
												isReadOnly={isReadOnly}
												isDarkMode={isDarkMode}
											/>
										</div>
									))
								) : (
									<div className="text-center py-10 bg-white rounded-lg shadow-md border border-gray-200">
										<svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
										</svg>
										<p className="text-lg text-gray-600 mb-4">No years found in study planner</p>
										<button
											onClick={handleAddYear}
											className="mt-4 px-6 py-3 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 flex items-center mx-auto shadow hover:shadow-md"
										>
											<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
											</svg>
											Add First Year
										</button>
									</div>
								)}
							</>
						</div>
						{!isReadOnly && (
							<button
								onClick={handleAddYear}
								className="mt-4 px-6 py-3 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 flex justify-center items-center gap-2 shadow-md hover:shadow-lg w-full"
							>
								<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
								</svg>
								Add Year
							</button>
						)}
					</div>
				)}
			</>
		</ConditionalRequireAuth>
	)
}
export default StudentPlanner