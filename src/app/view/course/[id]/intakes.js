import React, { useState, useCallback, useEffect, useRef } from 'react';
import MajorTermListing from './major_term_listing';
import CourseIntakeDB from '@app/class/CourseIntake/CourseIntakeDB';
import TermDB from '@app/class/Term/termDB';
import MajorDB from '@app/class/Major/MajorDB';
import ConfirmPopup from '@components/confirm';
import SemesterInStudyPlannerYearDB from '@app/class/SemesterInStudyPlannerYear/SemesterInStudyPlannerYearDB';
import StudentDB from '@app/class/Student/StudentsDB';
import Link from 'next/link';
import MasterStudyPlannerDB from '@app/class/MasterStudyPlanner/MasterStudyPlannerDB';
import LightDarkMode from '@styles/LightDarkMode';
// import { FaSpinner } from 'react-icons/fa';
import { useRole } from '@app/context/RoleContext';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import InfoTooltip from '@components/InfoTooltip';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import {
	GetMonthName,
	groupIntakesByStatusAndYear,
	getIntakeBackgroundColor,
	computeIntakesAfterDelete,
	computeIntakesAfterEditStatus,
	createNewIntake,
	updateIntakesAfterAdd,
	checkForChanges,
	prepareChangesData,
	updateIntakesAfterSave,
	resetIntakes
} from './intakeUtils';


const Intakes = ({ major_id, req, intakeListing, new_major_name, original_major_name, onResetMajorName, onSaveSuccess }) => {
	const { theme } = useLightDarkMode();
	const mode = req?.action || 'read';
	const isReadOnly = mode === 'read';
	const { can } = useRole(); // Get permission checking function

	// Debug logging for intake permissions
	useEffect(() => {
		console.log('Intake permissions check:', {
			canCreate: can('intakes', 'create'),
			canUpdate: can('intakes', 'update'),
			canDelete: can('intakes', 'delete'),
			isReadOnly
		});
	}, [can, isReadOnly]);

	const [intakes, setIntakes] = useState({
		"Added": [],
		"Deleted": [],
		"Modified": [],
		"Existing": []
	});
	const [originalIntakes, setOriginalIntakes] = useState(null);
	const [showPopup, setShowPopup] = useState(false);
	const modalRef = useRef(null);
	const [confirmConfig, setConfirmConfig] = useState({
		title: '',
		description: '',
		isOpen: false,
		onConfirm: undefined,
	});
	const [hasChanges, setHasChanges] = useState(false);
	const [editingStatus, setEditingStatus] = useState(null);
	const [isSaveLoading, setIsSaveLoading] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [pageError, setPageError] = useState(null);

	// State for expandable sections
	const [expandedStatuses, setExpandedStatuses] = useState({
		"Published": true,
		"Unpublished": true,
		"Unavailable": true
	});
	const [expandedYears, setExpandedYears] = useState({});

	const openConfirmPopup = ({ title, description, onConfirm, confirmButtonColor = 'red' }) => {
		window.Swal.fire({
			title: title,
			text: description,
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: confirmButtonColor,
			cancelButtonColor: '#6b7280',
			confirmButtonText: 'Yes',
			cancelButtonText: 'No'
		}).then((result) => {
			if (result.isConfirmed && onConfirm) {
				onConfirm();
			}
		});
	};

	const onSelect = useCallback((selectedTerm) => {
		const newIntake = createNewIntake(selectedTerm);
		setIntakes(prev => updateIntakesAfterAdd(prev, newIntake));
	}, []);

	const handleClosePopup = useCallback(() => {
		setShowPopup(false);
	}, []);

	useEffect(() => {
		const handleClickOutside = (event) => {
			if (modalRef.current && !modalRef.current.contains(event.target)) {
				handleClosePopup();
			}
		};

		if (showPopup) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [showPopup, handleClosePopup]);

	const handleDeleteIntake = async (intake) => {
		console.log('intake', intake)
		if (isReadOnly) return;

		if (intake._master_study_planner_status === "Complete") {
			window.Swal.fire({
				title: 'Cannot Delete Intake',
				text: 'Please change the study planner status to Draft or Empty first.',
				icon: 'warning',
				confirmButtonText: 'OK',
				showConfirmButton: true,
				background: '#fff',
				iconColor: '#f59e0b',
				customClass: {
					popup: 'colored-toast'
				}
			});
			return;
		}

		if (intake._id) {
			const student_res = await StudentDB.FetchStudents({ IntakeID: intake._id })
			if (student_res.length > 0) {
				window.Swal.fire({
					title: 'Cannot Delete Intake',
					text: `Intake of ${intake._name} is currently being used by ${student_res.length} student(s)`,
					icon: 'warning',
					confirmButtonText: 'OK',
					showConfirmButton: true,
					background: '#fff',
					iconColor: '#f59e0b',
					customClass: {
						popup: 'colored-toast'
					}
				});
				return;
			}
		}


		openConfirmPopup({
			title: "Delete Intake",
			description: `Are you sure you want to delete the intake for ${intake._name} ${intake._year}?`,
			onConfirm: () => confirmDeleteIntake(intake),
		});
	};

	const confirmDeleteIntake = (intake) => {
		if (!intake) return;
		setIntakes(prev => computeIntakesAfterDelete(prev, intake));
	};

	useEffect(() => {
		setHasChanges(checkForChanges(intakes, new_major_name, original_major_name));
	}, [intakes.Added, intakes.Deleted, intakes.Modified, new_major_name]);

	const SetCourseIntakeListing = async () => {
		try {
			const combined_data = [];
			intakeListing.forEach((intake) => {
				const courseIntake = intake.CourseIntake;
				const term = intake.CourseIntake.Term

				combined_data.push({
					_id: courseIntake.ID,
					_term_id: courseIntake.TermID,
					_master_study_planner_id: intake?.ID,
					_master_study_planner_status: intake?.Status,
					_name: term.Name,
					_month: term.Month,
					_year: term.Year || new Date().getFullYear(),
					status: courseIntake.Status.charAt(0).toUpperCase() + courseIntake.Status.slice(1).toLowerCase(),
					is_existing: true
				})
			})
			setIntakes(prev => ({
				...prev,
				Existing: combined_data
			}));

			setOriginalIntakes(JSON.parse(JSON.stringify(combined_data)));
		} catch (err) {
			console.error("Error fetching course intakes:", err);
		}
	}

	useEffect(() => {
		SetCourseIntakeListing()
	}, [intakeListing]);

	const startEditStatus = (intake) => {
		if (isReadOnly) return;
		setEditingStatus(intake._id);
	};

	const handleEditStatus = (intake, newStatus) => {
		if (isReadOnly) return;

		// Prevent changing to Published if master study planner is not Complete
		if (newStatus === "Published" && intake._master_study_planner_status !== "Complete") {
			alert("Study Planner must be Complete before publishing this intake");
			setEditingStatus(null);
			return;
		}

		if (intake.status === newStatus) {
			setEditingStatus(null);
			return;
		}
		setIntakes(prev => computeIntakesAfterEditStatus(prev, intake, newStatus));
		setEditingStatus(null);
	};

	// Add click outside handler
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (editingStatus && !event.target.closest('.status-edit-container')) {
				setEditingStatus(null);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [editingStatus]);

	const saveChanges = async () => {
		if (isReadOnly) return;
		openConfirmPopup({
			title: "Confirm Save",
			description: "Are you sure you want to proceed?",
			confirmButtonColor: "green",
			onConfirm: async () => {
				try {
					setIsSaveLoading(true);
					const changesData = prepareChangesData(intakes, major_id);
					let is_pass = true;
					let response;

					if (new_major_name && new_major_name !== '') {
						try {
							const result = await MajorDB.updateMajor(major_id, {
								name: new_major_name,
								status: 'Active'
							});
							if (result.message === 'Major updated successfully') {
								onResetMajorName();
							} else {
								is_pass = false;
							}
						} catch (error) {
							is_pass = false;
						}
					}

					let newlyAddedIntakes = [];
					if (changesData.added && changesData.added.length > 0) {
						try {
							response = await CourseIntakeDB.AddCourseIntake(changesData.added);
							newlyAddedIntakes = response.intake
							if (!response.success) {
								is_pass = false;
							}
						} catch (error) {
							is_pass = false;
						}
					}

					if (changesData.modified && changesData.modified.length > 0) {
						try {
							response = await CourseIntakeDB.UpdateCourseIntake(changesData.modified);
							if (!response.success) {
								is_pass = false;
							}
						} catch (error) {
							is_pass = false;
						}
					}

					if (changesData.deleted && changesData.deleted.length > 0) {
						try {
							response = await CourseIntakeDB.DeleteCourseIntake(changesData.deleted);
							if (!response.success) {
								is_pass = false;
							}
						} catch (error) {
							is_pass = false;
						}
					}

					if (is_pass) {
						const updatedIntakes = updateIntakesAfterSave(intakes);
						setIntakes(updatedIntakes);
						setOriginalIntakes(updatedIntakes.Existing);
						onSaveSuccess?.();
						setHasChanges(false);
						setIsSaveLoading(false);
						await window.Swal.fire({
							title: 'Success',
							text: 'Major changes saved successfully.',
							icon: 'success',
							confirmButtonText: 'OK',
							showConfirmButton: true
						});
						if (newlyAddedIntakes && newlyAddedIntakes.length == 1) {
							promptToOpenPlanner(newlyAddedIntakes);
						}
					} else {
						await window.Swal.fire({
							title: 'Error',
							text: 'Failed to Save Changes: ' + (response ? response.message : 'Unknown error'),
							icon: 'error',
							confirmButtonText: 'OK',
							showConfirmButton: true
						});
					}
				} catch (error) {
					console.error('Error saving changes:', error);
				}
			}
		});
	};

	const promptToOpenPlanner = async (newlyAddedIntakes) => {
		const intake = newlyAddedIntakes[0];

		// Build the buttons HTML based on permissions
		let showViewButton = can('intakes', 'read');
		let showEditButton = !isReadOnly && can('intakes', 'update');

		const result = await window.Swal.fire({
			title: 'Success',
			text: 'Do you want to access the master study planner of the newly created intake?',
			icon: 'success',
			showCancelButton: true,
			showDenyButton: showEditButton,
			showConfirmButton: showViewButton,
			confirmButtonText: 'View',
			denyButtonText: 'Edit',
			cancelButtonText: 'No',
			confirmButtonColor: '#f3f4f6',
			denyButtonColor: '#fee2e2',
			cancelButtonColor: '#6b7280',
			customClass: {
				confirmButton: 'swal2-confirm-custom',
				denyButton: 'swal2-deny-custom',
				cancelButton: 'swal2-cancel-custom'
			}
		});

		// Handle the user's choice
		if (result.isConfirmed) {
			// View button clicked
			try {
				window.localStorage.setItem(`course_planner_mode_${intake.MajorID}`, 'read');
			} catch (_) { }

			try {
				window.dispatchEvent(new Event('course-planner-mode-change'));
			} catch (_) { }

			// Navigate to the planner
			window.location.href = `/view/course/${intake.MajorID}/${intake.ID}`;

		} else if (result.isDenied) {
			// Edit button clicked
			try {
				window.localStorage.setItem(`course_planner_mode_${intake.MajorID}`, 'edit');
			} catch (_) { }

			try {
				window.dispatchEvent(new Event('course-planner-mode-change'));
			} catch (_) { }

			// Navigate to the planner
			window.location.href = `/view/course/${intake.MajorID}/${intake.ID}`;
		}
		// If result.isDismissed (No button), do nothing
	}
	const cancelChanges = () => {
		if (isReadOnly) return;
		openConfirmPopup({
			title: "Cancel changes",
			description: "Are you sure you want to cancel all changes? This cannot be undone.",
			confirmButtonColor: "red",
			onConfirm: () => {
				setIntakes(resetIntakes(originalIntakes));
				if (onResetMajorName) {
					onResetMajorName();
				}
				setHasChanges(false);
			}
		});
	};

	// Toggle functions for expand/collapse
	const toggleStatusExpanded = (status) => {
		setExpandedStatuses(prev => ({
			...prev,
			[status]: !prev[status]
		}));
	};

	const toggleYearExpanded = (status, year) => {
		const key = `${status}-${year}`;
		setExpandedYears(prev => ({
			...prev,
			[key]: !prev[key]
		}));
	};

	// Helper function to count intakes for a status
	const getIntakeCountForStatus = (status, groupedIntakes) => {
		if (!groupedIntakes[status]) return 0;
		return Object.values(groupedIntakes[status]).reduce((total, yearIntakes) => total + yearIntakes.length, 0);
	};

	// Helper function to get year count for a status
	const getYearCountForStatus = (status, groupedIntakes) => {
		if (!groupedIntakes[status]) return 0;
		return Object.keys(groupedIntakes[status]).length;
	};

	const groupedIntakes = groupIntakesByStatusAndYear(intakes);
	const statusOrder = ["Published", "Unpublished", "Unavailable"];

	return (
		<PageLoadingWrapper
			requiredPermission={{ resource: 'intakes', action: 'read' }}
			resourceName="intake management"
			isLoading={isLoading}
			loadingText="Loading intakes..."
			error={pageError}
			errorMessage="Failed to load intakes"
		>
			<div className='space-y-6'>
				<div className="flex justify-between md:items-center items-start mb-8 md:flex-row flex-col">
					<div>
						<h1 className='intakeTitle'>
							Intakes {isReadOnly && <span className="intakeTitle">(View Only)</span>}
							{/* 
							<InfoTooltip
								content="Intake page guide - Customize this message"
								position="bottom"
								className="ml-2"
							/> */}
						</h1>
						<p className="intakeDesc">Manage course intakes and their study planners</p>
					</div>
					<div className="flex items-center gap-4 md:w-fit w-full text-md md:mt-0 mt-3">
						{!isReadOnly && can('intakes', 'create') && (
							<div className="inline-flex items-center gap-2">
								<button
									className='inline-flex items-center px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200'
									onClick={() => setShowPopup(true)}
								>
									<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
									</svg>
									Add Intake
								</button>
							</div>
						)}

						{hasChanges && !isReadOnly && (
							<div className="flex gap-3">
								<button
									onClick={cancelChanges}
									className="inline-flex items-center px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200"
								>
									<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
									</svg>
									Cancel Changes
								</button>
								{isSaveLoading ? (
									<span className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors duration-200">
										<span>Saving Changes...</span>
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
									</span>
								) : (
									<button
										onClick={saveChanges}
										disabled={isSaveLoading}
										className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors duration-200"
									>
										<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
										</svg>
										Save Changes
									</button>
								)}
							</div>
						)}
					</div>
				</div>

				{showPopup && (
					// <div className="fixed inset-0 flex items-center justify-center z-50 bg-opacity-50 h-[100%]" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
					// 	<div ref={modalRef} className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-xl p-6 shadow-2xl w-[80%]`}>
					<div className="modal-backdrop">
						<div ref={modalRef} className="listing-units-studyplanner">
							<MajorTermListing
								onSelect={(term) => {
									onSelect(term);
									handleClosePopup();
								}}
								onClose={handleClosePopup}
								intakes={intakes}
								setIntakes={setIntakes}
							/>
						</div>
					</div>
				)}

				<div className="space-y-4">
					{statusOrder.map((status) => {
						const hasIntakesForStatus = groupedIntakes[status] &&
							Object.keys(groupedIntakes[status]).length > 0;
						const isStatusExpanded = expandedStatuses[status];
						const intakeCount = getIntakeCountForStatus(status, groupedIntakes);
						const yearCount = getYearCountForStatus(status, groupedIntakes);

						return (
							<div key={status} className="intakeContainer">
								<div
									className="intakeStatus"
									onClick={() => toggleStatusExpanded(status)}
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className={`h-5 w-5 text-gray-600 transition-transform duration-200 ${isStatusExpanded ? 'rotate-90' : ''}`}
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
											</svg>
											<h3 className="intakeTextStatus">{status}</h3>
											{ }
											<InfoTooltip
												content={
													status === 'Published'
														? "The Intakes that have been published and completed"
														: status === 'Unpublished'
															? "The Intakes that are unpublished and possibly incomplete"
															: status === 'Unavailable'
																? "The Intakes that are completed but unavailable currently"
																: "Status information"
												}
												position="right"
											/>
										</div>
										<div className="text-sm intakeCountText">
											{hasIntakesForStatus ? (
												<span>{intakeCount} intakes across {yearCount} years</span>
											) : (
												<span>No intakes available</span>
											)}
										</div>
									</div>
								</div>

								{isStatusExpanded && (
									<div className="divide-y divide-gray-200">
										{!hasIntakesForStatus ? (
											<div className="p-6">
												<p className="text-gray-500 text-center">No intakes available</p>
											</div>
										) : (
											Object.keys(groupedIntakes[status])
												.sort((a, b) => b - a)
												.map((year) => {
													const yearKey = `${status}-${year}`;
													const isYearExpanded = expandedYears[yearKey] !== false; // Default to expanded
													const yearIntakeCount = groupedIntakes[status][year].length;

													return (
														<div key={year}>
															<div
																className="intakeYearHeader"
																onClick={() => toggleYearExpanded(status, year)}
															>
																<div className="flex items-center justify-between">
																	<div className="flex items-center gap-3">
																		<svg
																			xmlns="http://www.w3.org/2000/svg"
																			className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isYearExpanded ? 'rotate-90' : ''}`}
																			fill="none"
																			viewBox="0 0 24 24"
																			stroke="currentColor"
																		>
																			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
																		</svg>
																		<h4 className="intakeYear">{year}</h4>
																	</div>
																	<span className="intakeMonthText">{yearIntakeCount} intakes</span>
																</div>
															</div>

															{isYearExpanded && (
																<div className="intakeTableContainer">
																	<div className="overflow-x-auto">
																		<table className="w-full border-collapse">
																			<thead>
																				<tr className="intakeYearContainer">
																					<th className="intakeInfo">Intake</th>
																					<th className="intakeInfo">Status</th>
																					<th className="intakeInfo">Study Planner</th>
																					{(!isReadOnly && can("intakes", "delete")) && (
																						<th className="intakeInfoCenter">Actions</th>
																					)}
																				</tr>
																			</thead>
																			<tbody className="intakeTableBody">
																				{groupedIntakes[status][year]
																					.sort((a, b) => a._month - b._month)
																					.map((intake, index) => (
																						<tr key={index} className={`${getIntakeBackgroundColor(intake)} intakeTableRow`}>
																							<td className="intakeInfoBase">
																								<div className="intakeInfoContainer flex gap-3">
																									<span className="intakeNameText">{intake._name}</span>
																									<span className="intakeMonthText">({GetMonthName(intake._month)})</span>
																									<div className="flex gap-2">
																										{intake.is_new && (
																											<span className="px-2 py-0.5 text-sm font-medium bg-green-100 text-green-800 rounded-full">New</span>
																										)}
																										{intake.is_modified && (
																											<span className="px-2 py-0.5 text-sm font-medium bg-yellow-100 text-yellow-800 rounded-full">Modified</span>
																										)}
																									</div>
																								</div>
																							</td>
																							<td className="px-4 sm:px-6 py-4">
																								{editingStatus === intake._id ? (
																									<div className="flex flex-col gap-2 status-edit-container">
																										{statusOrder.map(statusOption => {
																											const isDisabled = statusOption === "Published" && intake._master_study_planner_status !== "Complete";
																											return (
																												<button
																													key={statusOption}
																													onClick={() => handleEditStatus(intake, statusOption)}
																													className={`px-3 py-2 text-sm sm:text-md rounded-lg transition-colors ${statusOption === intake.status
																														? 'bg-blue-500 text-white'
																														: isDisabled
																															? 'bg-gray-100 text-gray-400 cursor-not-allowed'
																															: 'bg-gray-100 hover:bg-gray-200 text-gray-700'
																														}`}
																													disabled={isDisabled}
																													title={isDisabled ? "Study Planner must be Complete before publishing" : ""}
																												>
																													{statusOption}
																													{isDisabled && (
																														<span className="hidden sm:inline"> (Requires Complete Planner)</span>
																													)}
																												</button>
																											);
																										})}
																									</div>
																								) : (
																									<div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
																										<span className="px-3 py-1.5 text-sm sm:text-md rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
																											{intake.status}
																										</span>
																										{!isReadOnly && can('intakes', 'update') && (
																											<button
																												onClick={() => startEditStatus(intake)}
																												className="px-3 py-1.5 border border-red-300 bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 text-sm sm:text-md font-medium rounded-lg transition-colors duration-200"
																											>
																												Edit
																											</button>
																										)}
																									</div>
																								)}
																							</td>
																							<td className="px-4 sm:px-6 py-4">
																								{intake.is_existing && (
																									<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
																										<span className={`text-sm sm:text-md whitespace-nowrap intakeMonthText`}>
																											Study Planner
																											<span
																												className={`
																													${intake._master_study_planner_status?.toLowerCase() === 'complete'
																														? 'bg-green-100 text-green-700'
																														: intake._master_study_planner_status?.toLowerCase() === 'draft'
																															? 'bg-yellow-100 text-yellow-700'
																															: 'bg-red-100 text-red-700'
																													}
																													px-2 py-1 ml-1 rounded-full
																												`}
																											>
																												({intake._master_study_planner_status})
																											</span>
																										</span>
																										<div className="flex gap-2">
																											{can('intakes', 'read') && (
																												<Link href={`/view/course/${major_id}/${intake._master_study_planner_id}`}>
																													<button onClick={() => { try { window.localStorage.setItem(`course_planner_mode_${major_id}`, 'read'); } catch (_) { } try { window.dispatchEvent(new Event('course-planner-mode-change')); } catch (_) { } }} className="px-3 py-1.5 border border-gray-300 bg-gray-100 text-gray-800 hover:bg-gray-200 hover:text-gray-900 text-sm sm:text-md font-medium rounded-lg transition-colors duration-200">
																														View
																													</button>
																												</Link>
																											)}
																											{!isReadOnly && can('intakes', 'update') && (
																												<Link href={`/view/course/${major_id}/${intake._master_study_planner_id}`}>
																													<button onClick={() => { try { window.localStorage.setItem(`course_planner_mode_${major_id}`, 'edit'); } catch (_) { } try { window.dispatchEvent(new Event('course-planner-mode-change')); } catch (_) { } }} className="px-3 py-1.5 border border-red-300 bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 text-sm sm:text-md font-medium rounded-lg transition-colors duration-200">
																														Edit
																													</button>
																												</Link>
																											)}
																										</div>
																									</div>
																								)}
																							</td>
																							{!isReadOnly && can('intakes', 'delete') && (
																								<td className="px-4 sm:px-6 py-4 text-center">
																									<button
																										onClick={async () => handleDeleteIntake(intake)}
																										className="px-3 py-1.5 border border-red-300 bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 text-sm sm:text-md font-medium rounded-lg transition-colors duration-200"
																									>
																										{intake.is_new ? 'Remove' : 'Delete'}
																									</button>
																								</td>
																							)}
																						</tr>
																					))}
																			</tbody>
																		</table>
																	</div>
																</div>
															)}
														</div>
													);
												})
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</PageLoadingWrapper>
	);
};

export default Intakes;