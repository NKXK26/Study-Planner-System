'use client';
import React, { use, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import MajorDB from '@app/class/Major/MajorDB';
import ConfirmPopup from '@components/confirm';
import Intakes from './intakes';
import styles from '@styles/major_intake.module.css';
import { ConditionalRequireAuth } from 'components/helper';
import { redirect } from 'components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import LightDarkMode from '@styles/LightDarkMode';
import InfoTooltip from '@components/InfoTooltip';
import LoadingSpinner from '@components/LoadingSpinner';


const MajorIntake = () => {
	const params = useParams(); // Fetch ID from URL
	const major_id = params.id;
	const hasAlertedRef = useRef(false); // Prevent multiple alerts
	const { can } = useRole(); // Get permission checking function
	const [isConfirmPopupOpen, setIsConfirmPopupOpen] = useState(false); // State to open the Confirmation page or not
	const [isCancelPopupOpen, setIsCancelPopupOpen] = useState(false); // State for cancel confirmation popup
	const [request, setRequest] = useState(null);
	const [newMajorName, setNewMajorName] = useState("")
	const [error, setError] = useState(null);
	const [isLoading, setIsLoading] = useState(true); // Add loading state
	// State for major information
	const [majorInfo, setMajorInfo] = useState({
		majorName: '',
		majorStatus: ''
	});

	const [intakeListing, setIntakeListing] = useState([])

	// State for course information
	const [courseInfo, setCourseInfo] = useState({
		courseCode: '',
		courseName: '',
		creditsRequired: 0,
		courseStatus: ''
	});

	const resetMajorName = () => {
		setNewMajorName(majorInfo.majorName);
	};

	const handleSaveSuccess = async () => {
		await FetchMajorInfo()
	};



	const FetchlocalStorageData = () => {
		const req = localStorage.getItem('PageRequest');
		if (req) {
			try {
				const parsed = JSON.parse(req);
				let action = parsed.action;
				if (parsed.action.toLowerCase() === 'edit') {
					setRequest({
						module: "course_major",
						action: 'edit'
					});

				} else {
					setRequest({
						module: "course_major",
						action: 'read'
					});

				}
			} catch (err) {
				console.error('Failed to parse pageRequest:', err);
			}
		} else {
			// If no request found, fall back to default behavior
			setRequest({
				module: "course_major",
				action: 'read'
			});
		}
	}

	const FetchMajorInfo = async () => {
		setIsLoading(true); // Start loading
		try {
			const major_intake_data = await MajorDB.FetchMajorIntake(major_id)
			if (!major_intake_data.success) {
				setError("Major not found");
				setIsLoading(false);
				return;
			}
			const course_info = major_intake_data.page_data._course;
			const major_info = major_intake_data.page_data;

			setMajorInfo({
				majorName: major_info._name,
				majorStatus: major_info._status
			});
			setCourseInfo({
				courseCode: course_info._code,
				courseName: course_info._name,
				creditsRequired: course_info._credits_required,
				courseStatus: course_info._status
			});

			setIntakeListing(major_intake_data.intake_listing_data);

			// Initialize newMajorName with the current major name
			setNewMajorName(major_info._name);
		} catch (err) {
			console.error("Error fetching major info:", err);
			setError("Major not found");
		} finally {
			setIsLoading(false);
		}
	};
	useEffect(() => {
		FetchlocalStorageData();
		FetchMajorInfo();
	}, [major_id]);

	if (isLoading) {
		return (
			<LoadingSpinner
				size="large"
				color="primary"
				text="Loading intake information..."
				fullScreen={true}
			/>
		);
	}

	// Check if user is in edit mode but doesn't have edit permissions
	const hasEditPermission = request?.action === 'edit' ? can('course', 'update') : true;

	return (
		<ConditionalRequireAuth>
			{request?.action === 'read' && !can("intakes", "read") ? (
				<AccessDenied requiredPermission="intakes:read" resourceName="course edit functionality" />
			) :
				request?.action === 'edit' && !hasEditPermission ? (
					<AccessDenied requiredPermission="course:update" resourceName="course edit functionality" />
				) : (
					<>
						{isConfirmPopupOpen && (
							<ConfirmPopup
								title="Confirm Changes"
								description="Are you sure you want to confirm these changes?"
								isOpen={isConfirmPopupOpen}
								onClose={() => setIsConfirmPopupOpen(false)}
								onConfirm={onConfirmChanges}
							/>
						)}

						{isCancelPopupOpen && (
							<ConfirmPopup
								title="Cancel Changes"
								description="Are you sure you want to cancel all changes? This action cannot be undone."
								isOpen={isCancelPopupOpen}
								onClose={() => setIsCancelPopupOpen(false)}
								onConfirm={onCancelChanges}
							/>
						)}

						{error === "Major not found" && (
							<div className="flex flex-col items-center justify-center py-16">
								<div className="text-2xl font-bold text-gray-700 mb-4">Major not found</div>
								<button
									onClick={() => redirect(`/view/course`)}
									className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded cursor-pointer"
								>
									Back to Course
								</button>
							</div>
						)}

						{!isLoading && error != "Major not found" && (
							<div className="p-2">
								<div className="coursesIDBox">
									<span className="coursesCurrentMode">
										{request?.action === 'edit' ? 'Edit' : 'View'} Mode
									</span>
									{(request?.action !== 'read' && can("course", "update")) ? (
										<div className="mb-2">
											<input
												type="text"
												className="text-3xl font-bold border-b border-gray-300 focus:outline-none focus:border-blue-500 w-full mb-1"
												value={newMajorName}
												onChange={(e) => setNewMajorName(e.target.value)}
											/>
										</div>
									) : (
										<h1 className="text-3xl font-bold mb-1">{majorInfo.majorName}</h1>
									)}
									<h2 className="majorNameCourse">
										{courseInfo.courseCode} - {courseInfo.courseName}
									</h2>
									<div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto sm:justify-end sm:items-center mt-2 sm:mt-0 self-end">
										<button
											onClick={() => redirect(`/view/course`)}
											className="bg-gray-500 hover:bg-gray-600 text-white px-5 py-2 rounded-lg transition-colors duration-200 w-full sm:w-auto"
										>
											Back to Course
										</button>
										{(can('course', 'update')) && (
											<button
												onClick={() => setRequest((prev) => ({
													module: "course_major",
													action: prev?.action === 'edit' ? 'read' : 'edit'
												}))}
												className={`px-5 py-2 rounded-lg text-white transition-colors duration-200 w-full sm:w-auto ${request?.action === 'edit'
													? 'bg-red-500 hover:bg-red-600'
													: 'bg-red-500 hover:bg-red-600'
													}`}
											>
												Change to {request?.action === 'edit' ? 'View' : 'Edit'}
											</button>
										)}
									</div>
								</div>
								<div className="intakesContainer">
									<Intakes
										major_id={major_id}
										req={request}
										intakeListing={intakeListing}
										new_major_name={newMajorName}
										original_major_name={majorInfo.majorName}
										onResetMajorName={resetMajorName}
										setNewMajorName={setNewMajorName}
										onSaveSuccess={handleSaveSuccess}
									/>
								</div>
							</div>
						)}

					</>
				)}
		</ConditionalRequireAuth>
	);
};

export default MajorIntake;