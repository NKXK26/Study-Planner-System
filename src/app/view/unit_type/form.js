'use client';
import { useEffect, useState, useRef } from 'react';
import UnitTypeDB from '@app/class/UnitType/UnitTypeDB';
import Button from '../../../components/button.js';
import Tooltip from '../../../components/Tooltip.js';
import InfoTooltip from '../../../components/InfoTooltip.js';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import { useRole } from '@app/context/RoleContext';

// Function to check if a unit type is restricted (cannot be edited or deleted)
const isRestrictedUnitType = (unitTypeName) => {
	const restrictedTypes = ['core', 'major', 'elective', 'mpu']; //if the unit type names are listed here, there are restricted, means cant be deleted, they are protected by the system
	return restrictedTypes.includes(unitTypeName.toLowerCase());
};

const Form = ({ onClose, mode, unitTypeId, RefreshList, HandleOpenForm, unitType }) => {
	const { can } = useRole();
	const { theme } = useLightDarkMode();
	const [unitTypeData, setUnitTypeData] = useState({
		id: '',
		name: '',
		colour: '#000000'
	});

	const [originalData, setOriginalData] = useState({
		id: '',
		name: '',
		colour: '#000000'
	});

	const [isLoading, setIsLoading] = useState(mode === 'VIEW' || mode === 'EDIT');
	const [isSaveLoading, setIsSaveLoading] = useState(false);
	const [isDeleteLoading, setIsDeleteLoading] = useState(false)



	useEffect(() => {
		if ((mode === 'VIEW' || mode === 'EDIT') && unitType) {
			try {
				if (unitType) {
					const unitTypeDataObj = {
						id: unitType.id,
						name: unitType.name,
						colour: unitType.colour
					};
					setUnitTypeData(unitTypeDataObj);
					setOriginalData(unitTypeDataObj); // Store original data for comparison
				} else {
					window.Swal.fire({
						title: 'Error',
						text: `Unit type with ID: ${unitTypeId} not found`,
						icon: 'error',
						confirmButtonText: 'OK'
					});
					onClose();
				}
			} catch (error) {
				window.Swal.fire({
					title: 'Error',
					text: 'Failed to fetch unit type data',
					icon: 'error',
					confirmButtonText: 'OK'
				});
			} finally {
				setIsLoading(false);
			}
		} else if (mode === 'ADD') {
			setIsLoading(false);
		}
	}, [unitType, mode, onClose]);

	const SubmitForm = async (e) => {
		setIsSaveLoading(true);
		e.preventDefault();

		// Use current state instead of FormData for more reliable data
		const unitType = {
			name: unitTypeData.name,
			colour: unitTypeData.colour
		};

		// For restricted types in EDIT mode, handle differently
		if (mode === 'EDIT' && isRestrictedUnitType(originalData.name)) {
			// Always use the original name for restricted types
			unitType.name = originalData.name;

			// Check if color actually changed
			const colorChanged = unitTypeData.colour !== originalData.colour;

			console.log('Original color:', originalData.colour);
			console.log('Current color:', unitTypeData.colour);
			console.log('Color changed:', colorChanged);

			// If no changes were made, show a message
			if (!colorChanged) {
				console.log('Color changed from', originalData.colour, 'to', unitTypeData.colour);
				window.Swal.fire({
					title: 'No Changes',
					text: 'No changes were made to the unit type.',
					icon: 'info',
					confirmButtonText: 'OK'
				});
				setIsSaveLoading(false);
				return;
			}

			// If color changed, allow the submission
			console.log('Color changed from', originalData.colour, 'to', unitTypeData.colour);
		}

		// For non-restricted types, check if any changes were made
		if (mode === 'EDIT' && !isRestrictedUnitType(originalData.name)) {
			setIsSaveLoading(false);
			const nameChanged = unitTypeData.name !== originalData.name;
			const colorChanged = unitTypeData.colour !== originalData.colour;

			if (!nameChanged && !colorChanged) {
				window.Swal.fire({
					title: 'No Changes',
					text: 'No changes were made to the unit type.',
					icon: 'info',
					confirmButtonText: 'OK'
				});
				setIsSaveLoading(false);
				return;
			}
		}

		// Validation
		const errors = [];
		if (!unitType.name) {
			errors.push("Name is required!");
		}

		if (errors.length > 0) {
			setIsSaveLoading(false);

			window.Swal.fire({
				title: 'Validation Error',
				text: errors.join('\n'),
				icon: 'error',
				confirmButtonText: 'OK'
			});
			return;
		}

		try {
			const method_type = mode === 'ADD' ? 'POST' : 'PUT';
			const dataToSend = {
				...unitType,
				...(mode === 'EDIT' && { ID: unitTypeData.id }) // Only include ID for edits
			};

			await UnitTypeDB.SaveUnitType(dataToSend, method_type);
			setIsSaveLoading(false);
			window.Swal.fire({
				title: 'Success',
				text: `Unit type ${mode === 'ADD' ? 'added' : 'updated'} successfully`,
				icon: 'success',
				confirmButtonText: 'OK'
			});
			onClose();
			RefreshList();
		} catch (error) {
			setIsSaveLoading(false);
			window.Swal.fire({
				title: 'Error',
				text: error.message,
				icon: 'error',
				confirmButtonText: 'OK'
			});
		}
	};

	const HandleConfirmDelete = async () => {
		setIsDeleteLoading(true);
		// Check if unit type is restricted
		if (isRestrictedUnitType(unitTypeData.name)) {
			await window.Swal.fire({
				title: 'Cannot Delete',
				text: `"${unitTypeData.name}" is a system unit type and cannot be deleted.`,
				icon: 'warning',
				confirmButtonText: 'OK'
			});
			return;
		}


		try {
			const res = await UnitTypeDB.deleteUnitType(unitTypeData.id);
			if (res.success) {
				await window.Swal.fire({
					title: 'Deleted!',
					text: 'Unit type has been deleted successfully.',
					icon: 'success',
					confirmButtonText: 'OK'
				});
				setIsDeleteLoading(false);
				RefreshList();
				onClose();
			} else {
				await window.Swal.fire({
					title: 'Error',
					text: res.message || 'Failed to delete unit type',
					icon: 'error',
					confirmButtonText: 'OK'
				});
			}
			setIsDeleteLoading(false);
		} catch (error) {
			if (
				error.message === 'This unit type is being used and cannot be deleted'
			) {
				await window.Swal.fire({
					title: 'Cannot Delete',
					text: 'This unit type is being used and cannot be deleted.',
					icon: 'warning',
					confirmButtonText: 'OK'
				});
			} else {
				await window.Swal.fire({
					title: 'Error',
					text: error.message || 'An error occurred while deleting the unit type',
					icon: 'error',
					confirmButtonText: 'OK'
				});
			}
		}
	};

	const form_heading_text = `${mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase()} Unit Type`;
	const is_read_only = mode === "VIEW";
	const is_restricted = isRestrictedUnitType(unitTypeData.name);

	const formRef = useRef(null);

	// Add click outside handler
	useEffect(() => {
		const handleClickOutside = (event) => {
			const confirmDialog = document.querySelector('.swal2-container');
			if (confirmDialog && confirmDialog.contains(event.target)) {
				return;
			}

			if (formRef.current && !formRef.current.contains(event.target)) {
				onClose();
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [onClose]);

	return (
		<>
			<div className="VED-wrapper">
				<div ref={formRef} className="VED-container">
					{/* Header */}
					<div className="VED-header">
						<h1 className='VED-title'>
							{form_heading_text}
							{/* Dynamic InfoTooltip - Edit the content below for each mode */}
							<InfoTooltip
								content={
									mode === 'VIEW'
										? "Currently viewing the Unit Type"
										: mode === 'EDIT'
											? "Currently editting the Unit Type"
											: mode === 'ADD'
												? "Adding a new Unit Type"
												: "Unit Type management form" // Default fallback text
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
						<div className="flex justify-center items-center h-64 w-128">
							<p className={theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}>Loading unit type data...</p>
						</div>
					) : (
						<form
							onSubmit={SubmitForm}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									SubmitForm(e);
								}
							}}
							className="p-6 flex flex-col h-full"
						>
							<div className="flex md:flex-row flex-col">
								{/* Left Column */}
								<div className="flex-1 pr-6">
									{/* Name Field */}
									<div className="mb-4">
										<label htmlFor="name" className="label-text-alt">
											Name:
											<InfoTooltip
												content={is_restricted
													? "System unit types (Core, Major, Elective, MPU) cannot be renamed as they are prime Unit Types."
													: "Enter a descriptive name for this unit type. This will be used to categorize units in the system."
												}
												position="right"
												className="ml-1"
											/>
											{is_restricted && mode === 'EDIT' && (
												<span className="ml-2 text-xs text-blue-600">(Protected)</span>
											)}
										</label>
										<input
											type="text"
											name="name"
											id="name"
											value={unitTypeData.name}
											onChange={(e) => setUnitTypeData({ ...unitTypeData, name: e.target.value })}
											className="form-input"
											required
											disabled={is_read_only || (is_restricted && mode === 'EDIT')}
										/>
										{is_restricted && mode === 'EDIT' && (
											<p className="text-xs text-blue-600 mt-1">
												This is a system unit type. Only the color can be modified.
											</p>
										)}
									</div>
									{/* Color Field */}
									<div className="mb-4">
										<label htmlFor="colour" className="label-text-alt">
											Color:
											<InfoTooltip
												content="Select a color to visually identify this unit type throughout the system. This helps in quickly distinguishing unit categories."
												position="right"
												className="ml-1"
											/>
											{is_restricted && mode === 'EDIT' && (
												<span className="ml-2 text-xs text-blue-600">(Editable)</span>
											)}
										</label>
										<div className="flex items-center gap-4">
											<input
												type="color"
												name="colour"
												id="colour"
												value={unitTypeData.colour}
												onChange={(e) => setUnitTypeData({ ...unitTypeData, colour: e.target.value })}
												className={`w-12 h-12 p-1 border border-gray-300 rounded-md ${is_read_only ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
												disabled={is_read_only}
												style={{
													opacity: is_read_only ? 0.5 : 1,
													cursor: is_read_only ? 'not-allowed' : 'pointer'
												}}
											/>
											<div className="flex items-center gap-2">
												<span className="font-mono">{unitTypeData.colour}</span>
											</div>
										</div>
										{is_restricted && mode === 'EDIT' && (
											<p className="text-xs text-blue-600 mt-1">
												You can change the color of system unit types.
											</p>
										)}
									</div>
								</div>
							</div>

							{/* Action Buttons */}
							<div className="mt-6 flex justify-end space-x-4">
								{mode === "VIEW" ? (
									<>
										<button
											type="button"
											onClick={onClose}
											className={`mx-3 px-4 py-2 rounded-xl cursor-pointer ${theme === 'dark'
												? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
												: 'bg-white text-gray-900 border-2 border-gray-300 hover:bg-gray-50'
												}`}
										>
											Close
										</button>
										{can("unit_type", "update") && (
											<button
												type="button"
												onClick={() => {
													onClose();
													HandleOpenForm('EDIT', unitTypeData.id, unitType);
												}}
												className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer hover:bg-red-700"
											>
												Edit Unit Type
											</button>
										)}
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
										{can("unit_type", "delete") && mode === "EDIT" && !is_restricted && (

											<button
												type="button"
												onClick={async () => {
													const result = await window.Swal.fire({
														title: 'Delete Unit Type',
														text: 'Are you sure you want to delete this unit type? This action cannot be undone.',
														icon: 'warning',
														showCancelButton: true,
														confirmButtonColor: '#d33',
														cancelButtonColor: '#3085d6',
														confirmButtonText: 'Yes, delete it!',
														cancelButtonText: 'No, cancel'
													});

													if (result.isConfirmed) {
														await HandleConfirmDelete();
													}
												}}
												className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer hover:bg-red-700"
											>
												{
													isDeleteLoading ? (
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
														<>Delete Unit</>
													)
												}
											</button>
										)}
										{(mode === "ADD" && can("unit_type", "create")) ||
											(mode === "EDIT" && can("unit_type", "update")) ? (
											<Button
												type="submit"
												variant="submit"
												className="px-4 py-2 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-70"
											>
												{isSaveLoading ? (
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
													<span>{mode === "ADD" ? "Add Unit Type" : "Save Changes"}</span>
												)}
											</Button>
										) : null}
									</>
								)}
							</div>
						</form>
					)}
				</div>
			</div>
		</>
	);
};

export default Form;